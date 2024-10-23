import emojiRegex from 'emoji-regex-xs';
import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstTypes, AstVariableLengthCharacterSetKinds, createAlternative, createBackreference, createGroup, createLookaround, createUnicodeProperty, parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {traverse} from './traverse.js';
import {JsUnicodeProperties, PosixClasses} from './unicode.js';
import {EsVersion, getOrCreate, r, Target} from './utils.js';

/**
@typedef {{
  type: 'Regex';
  parent: null;
  pattern: Object;
  flags: Object;
  options: Object;
}} RegexAst
*/
/**
Transforms an Oniguruma AST in-place to a `regex` AST. Targets `ESNext`, expecting the generator to
then down-convert to the desired JS target version.

A couple edge cases exist where options `allowBestEffort` and `bestEffortTarget` are used:
- `VariableLengthCharacterSet` kind `grapheme` (`\X`): An exact representation would require heavy
  Unicode data; a best-effort approximation requires knowing the target.
- `CharacterSet` kind `posix` with values `graph` and `print`: Their complex exact representations
  are hard to change after the fact in the generator to a best-effort approximation based on
  the target, so produce the appropriate structure here.
@param {import('./parse.js').OnigurumaAst} ast
@param {{
  allowBestEffort?: boolean;
  bestEffortTarget?: keyof Target;
}} [options]
@returns {RegexAst}
*/
function transform(ast, options) {
  const opts = {
    allowBestEffort: true,
    bestEffortTarget: Target.ESNext,
    ...options,
  };
  const firstPassState = {
    allowBestEffort: opts.allowBestEffort,
    flagDirectivesByAlt: new Map(),
    minTargetEs2024: EsVersion[opts.bestEffortTarget] >= EsVersion[Target.ES2024],
    // Subroutines can appear before the groups they ref, so collect reffed nodes for a second pass 
    subroutineRefMap: new Map(),
  };
  traverse({node: ast}, firstPassState, FirstPassVisitor);
  // The interplay of subroutines (with Onig's unique rules/behavior for them; see comments in the
  // parser for details) with backref multiplexing (a unique Onig feature), flag modifiers, and
  // duplicate group names (which might be indirectly referenced by subroutines even though
  // subroutines can't directly reference duplicate names) is extremely complicated to emulate in
  // JS in a way that handles all edge cases, so we need multiple passes to do it
  const secondPassState = {
    groupOriginByCopy: new Map(),
    groupsWithDuplicateNamesToRemove: new Set(),
    multiplexCapturesToLeftByRef: new Map(),
    namedGroupsInScopeByAlt: new Map(),
    openDirectCaptures: new Set(),
    openSubroutineRefs: new Set(),
    reffedNodesByBackreference: new Map(),
    subroutineRefMap: firstPassState.subroutineRefMap,
  };
  traverse({node: ast}, secondPassState, SecondPassVisitor);
  const thirdPassState = {
    groupsWithDuplicateNamesToRemove: secondPassState.groupsWithDuplicateNamesToRemove,
    numCapturesToLeft: 0,
    reffedNodesByBackreference: secondPassState.reffedNodesByBackreference,
  };
  traverse({node: ast}, thirdPassState, ThirdPassVisitor);
  return ast;
}

const FirstPassVisitor = {
  Alternative: {
    enter({node, parent, key}, {flagDirectivesByAlt}) {
      // Look for own-level flag directives when entering an alternative because after traversing
      // the directive itself, any subsequent flag directives will no longer be at the same level
      const flagDirectives = node.elements.filter(el => el.kind === AstDirectiveKinds.flags);
      for (let i = key + 1; i < parent.alternatives.length; i++) {
        const forwardSiblingAlt = parent.alternatives[i];
        getOrCreate(flagDirectivesByAlt, forwardSiblingAlt, []).push(...flagDirectives);
      }
    },
    exit({node}, {flagDirectivesByAlt}) {
      // Wait until exiting to wrap an alternative's nodes with flag groups that extend flag
      // directives from prior sibling alternatives because doing this at the end allows inner
      // nodes to accurately check their level in the tree
      if (flagDirectivesByAlt.get(node)?.length) {
        const flags = getCombinedFlagsFromFlagNodes(flagDirectivesByAlt.get(node));
        const flagGroup = prepContainer(createGroup({flags}), node.elements);
        // Manually set the parent since we're not using `replaceWith`
        flagGroup.parent = node;
        node.elements = [flagGroup];
      }
    },
  },

  Assertion({node, parent, key, ast, remove, replaceWith}) {
    const {kind, negate} = node;
    if (kind === AstAssertionKinds.search_start) {
      // Allows multiple leading `\G`s since the the node is removed. Additional `\G` error
      // checking in the `Pattern` visitor
      // TODO: Allow `\G` if it's the first node in a top-level group that doesn't use alternation; ex: `(?i:\G.)` or `\Ga|(?i:\Gb)`; maybe allow further nesting like `(((\Ga)))b|\Gb`; probably stop the sort with directives and instead check the key after subtracting preceding directives
      if (parent.parent !== ast.pattern || key !== 0) {
        throw new Error(r`Uses "\G" in a way that's unsupported for conversion to JS`);
      }
      ast.flags.sticky = true;
      remove();
    } else if (kind === AstAssertionKinds.string_end) {
      replaceWith(parseFragment(r`(?!\p{Any})`));
    } else if (kind === AstAssertionKinds.string_end_newline) {
      replaceWith(parseFragment(r`(?=\n?(?!\p{Any}))`));
    } else if (kind === AstAssertionKinds.string_start) {
      replaceWith(parseFragment(r`(?<!\p{Any})`));
    } else if (kind === AstAssertionKinds.word_boundary) {
      // Onig's word char definition for `\b` isn't the same as for `\w`
      const wordChar = r`[\p{L}\p{N}\p{Pc}]`;
      const b = `(?:(?<=${wordChar})(?!${wordChar})|(?<!${wordChar})(?=${wordChar}))`;
      const B = `(?:(?<=${wordChar})(?=${wordChar})|(?<!${wordChar})(?!${wordChar}))`;
      replaceWith(parseFragment(negate ? B : b));
    }
    // Don't need to transform `line_end` and `line_start` because the `Flags` visitor always turns
    // on `multiline` to match Onig's behavior for `^` and `$`
  },

  CapturingGroup({node}, {subroutineRefMap}) {
    const {name, number} = node;
    subroutineRefMap.set(name ?? number, node);
  },

  CharacterSet({node, replaceWith}) {
    const {kind, negate, value} = node;
    if (kind === AstCharacterSetKinds.hex) {
      replaceWith(createUnicodeProperty('AHex', {negate}));
    } else if (kind === AstCharacterSetKinds.posix) {
      const negateableNode = parseFragment(PosixClasses[value]);
      negateableNode.negate = negate;
      replaceWith(negateableNode);
    } else if (kind === AstCharacterSetKinds.property) {
      if (!JsUnicodeProperties.has(value)) {
        // Assume it's a script
        node.key = 'sc';
      }
    } else if (kind === AstCharacterSetKinds.space) {
      // Unlike JS, Onig's `\s` matches only ASCII space, tab, LF, VT, FF, and CR
      const s = parseFragment('[ \t\n\v\f\r]');
      s.negate = negate;
      replaceWith(s);
    }
  },

  Directive({node, parent, key, container, ast, replaceWith, removeAllPrevSiblings, removeAllNextSiblings}, state) {
    const {kind, flags} = node;
    if (kind === AstDirectiveKinds.flags) {
      const flagGroup = prepContainer(createGroup({flags}), removeAllNextSiblings());
      replaceWith(flagGroup);
      traverse({
        node: flagGroup,
        parent,
        key,
        container,
      }, state, FirstPassVisitor);
    } else if (kind === AstDirectiveKinds.keep) {
      // Allows multiple `\K`s since the the node is removed
      if (parent.parent !== ast.pattern || ast.pattern.alternatives.length > 1) {
        // `\K` is emulatable at least within top-level alternation, but it's tricky.
        // Ex: `ab\Kc|a` is equivalent to `(?<=ab)c|a(?!bc)`, not simply `(?<=ab)c|a`
        throw new Error(r`Uses "\K" in a way that's unsupported for conversion to JS`);
      }
      replaceWith(prepContainer(createLookaround({behind: true}), removeAllPrevSiblings()));
    }
  },

  Flags({node, parent}) {
    // Onig's flag x (`extended`) isn't available in JS. Note that flag x is fully handled during
    // tokenization (and flag x modifiers are stripped)
    delete node.extended;
    Object.assign(node, {
      global: false, // JS flag g; no Onig equiv
      hasIndices: false, // JS flag d; no Onig equiv
      multiline: true, // JS flag m; no Onig equiv but its behavior is always on in Onig
      sticky: node.sticky ?? false, // JS flag y; no Onig equiv
      // Note: `regex` doesn't allow explicitly adding flags it handles implicitly, so leave out
      // properties `unicode` (JS flag u) and `unicodeSets` (JS flag v). Keep the existing values
      // for `ignoreCase` (flag i) and `dotAll` (JS flag s, but Onig flag m)
    });
    // Options accepted by `regex`; see <github.com/slevithan/regex#-options>
    parent.options = {
      disable: {
        // Onig uses different rules for flag x than `regex`, so disable the implicit flag
        x: true,
        // Onig has no flag to control "named capture only" mode but contextually applies its
        // behavior when named capturing is used, so disable `regex`'s implicit flag for it
        n: true,
      },
      force: {
        // Always add flag v because we're generating an AST that relies on it (it enables JS
        // support for Onig features nested classes, set intersection, Unicode properties, `\u{}`).
        // However, the generator might disable flag v based on its `target` option
        v: true,
      },
    };
  },

  Group({node}) {
    if (!node.flags) {
      return;
    }
    // JS doesn't support flag groups that enable and disable the same flag; ex: `(?i-i:)`
    const {enable, disable} = node.flags;
    if (enable?.dotAll && disable?.dotAll) {
      delete enable.dotAll;
    }
    if (enable?.ignoreCase && disable?.ignoreCase) {
      delete enable.ignoreCase;
    }
    if (enable && !Object.keys(enable).length) {
      delete node.flags.enable;
    }
  },

  Pattern({node}) {
    // For `\G` to be accurately emulatable using JS flag y, it must be at (and only at) the start
    // of every top-level alternative. Additional `\G` error checking in the `Assertion` visitor
    let hasAltWithLeadG = false;
    let hasAltWithoutLeadG = false;
    for (const alt of node.alternatives) {
      // Move neighboring `\G` assertions in front of flag directives since `Assertion` only allows
      // top-level `\G` but flag directives nest their following siblings into a flag group
      alt.elements.sort((a, b) => {
        if (a.kind === AstAssertionKinds.search_start && b.kind === AstDirectiveKinds.flags) {
          return -1;
        }
        if (a.kind === AstDirectiveKinds.flags && b.kind === AstAssertionKinds.search_start) {
          return 1;
        }
        return 0;
      });
      if (alt.elements[0]?.kind === AstAssertionKinds.search_start) {
        hasAltWithLeadG = true;
      } else {
        hasAltWithoutLeadG = true;
      }
    }
    if (hasAltWithLeadG && hasAltWithoutLeadG) {
      throw new Error(r`Uses "\G" in a way that's unsupported for conversion to JS`);
    }
  },

  Quantifier({node}) {
    if (node.element.type === AstTypes.Quantifier) {
      const group = prepContainer(createGroup(), [node.element]);
      // Manually set the parent since we're not using `replaceWith`
      group.parent = node;
      node.element = group;
    }
  },

  VariableLengthCharacterSet({node, replaceWith}, {allowBestEffort, minTargetEs2024}) {
    const {kind} = node;
    if (kind === AstVariableLengthCharacterSetKinds.newline) {
      replaceWith(parseFragment(r`(?>\r\n?|[\n\v\f\x85\u2028\u2029])`));
    } else if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
      if (!allowBestEffort) {
        throw new Error(r`Use of "\X" requires option allowBestEffort`);
      }
      // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows over/under-qualified
      // emoji using a general pattern that matches any Unicode sequence following the structure of
      // a valid emoji. That actually makes it more accurate for matching any grapheme
      const emoji = minTargetEs2024 ? r`\p{RGI_Emoji}` : emojiRegex().source;
      // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>.
      // Bypass name check to allow `RGI_Emoji` through, which Onig doesn't support
      replaceWith(parseFragment(r`(?>\r\n|${emoji}|\P{M}\p{M}*)`, {bypassPropertyNameCheck: true}));
    } else {
      throw new Error(`Unexpected varcharset kind "${kind}"`);
    }
  },
};

const SecondPassVisitor = {
  Alternative({node}, {namedGroupsInScopeByAlt}) {
    const parentAlt = getParentAlternative(node);
    if (parentAlt) {
      // JS requires group names to be unique per alternation path (which includes alternations in
      // nested groups), so pull down the names already used within this alternation path to this
      // nested alternative for handling within the `CapturingGroup` visitor
      const groups = namedGroupsInScopeByAlt.get(parentAlt);
      if (groups) {
        namedGroupsInScopeByAlt.set(node, groups);
      }
    }
  },

  Backreference({node}, {multiplexCapturesToLeftByRef, reffedNodesByBackreference}) {
    const {ref} = node;
    // Copy the current state for later multiplexing expansion. It's done in a subsequent pass
    // because backref numbers need to be recalculated after subroutine expansion
    reffedNodesByBackreference.set(node, [...multiplexCapturesToLeftByRef.get(ref).map(({node}) => node)]);
  },

  CapturingGroup: {
    enter(
      { node,
        replaceWith,
        skip,
      },
      { groupOriginByCopy,
        groupsWithDuplicateNamesToRemove,
        multiplexCapturesToLeftByRef,
        namedGroupsInScopeByAlt,
        openDirectCaptures,
        openSubroutineRefs,
      }
    ) {
      const {name, number} = node;
      const ref = name ?? number;
      // Has value if we're within a subroutine expansion
      const origin = groupOriginByCopy.get(node);

      // ## Handle recursion; runs after subroutine expansion
      // TODO: Can this be refactored into conditions for `isDirectRecursion` and `isIndirectRecursion`?
      const isRecursion = openSubroutineRefs.has(ref) || openDirectCaptures.has(origin);
      const isDirectRecursion = isRecursion && !openSubroutineRefs.size;
      if (isRecursion && !isDirectRecursion) {
        // Indirect recursion is supportable at the AST level but would require `regex-recursion`
        // to allow multiple recursions in a pattern, along with code changes here (after which
        // `openDirectCaptures` and `openSubroutineRefs` could be combined)
        throw new Error('Unsupported indirect recursion');
      }
      if (origin) {
        openSubroutineRefs.add(ref);
      } else {
        openDirectCaptures.add(node);
      }
      if (isDirectRecursion) {
        // Recursion doesn't change following backrefs to `ref` (unlike other subroutines), so
        // don't wrap with a capture for this node's ref
        replaceWith(createRecursion(ref));
        // This node's kids have been removed from the tree, so no need to traverse them
        skip();
        return;
      }

      // ## Track data for backref multiplexing
      const multiplexNodes = getOrCreate(multiplexCapturesToLeftByRef, ref, []);
      for (let i = 0; i < multiplexNodes.length; i++) {
        // Captures added via subroutine expansion (possibly indirectly because they were child
        // captures of the reffed group or in a nested subroutine expansion) form a set with their
        // origin group and any other copies of it added via subroutines. Only the most recently
        // matched within this set is added to backref multiplexing. So search the list of already-
        // tracked multiplexed nodes for this group name or number to see if there's a node being
        // replaced by this capture
        const multiplex = multiplexNodes[i];
        if (
          // This group is from subroutine expansion, and there's a multiplex value from either the
          // origin node or a prior subroutine expansion group with the same origin
          (origin === multiplex.node || (origin && origin === multiplex.origin)) ||
          // This group is not from subroutine expansion, and it comes after a subroutine expansion
          // group that refers to itself
          node === multiplex.origin
        ) {
          multiplexNodes.splice(i, 1);
          break;
        }
      }
      multiplexNodes.push({node, origin});

      // ## Track data for duplicate names within an alternation path
      // JS requires group names to be unique per alternation path (which includes alternations in
      // nested groups), so if using a duplicate name for this alternation path, remove the name from
      // all but the latest instance (also applies to groups added via subroutine expansion)
      if (name) {
        let parentAlt = getParentAlternative(node);
        const namedGroupsInScope = getOrCreate(namedGroupsInScopeByAlt, parentAlt, new Map());
        if (namedGroupsInScope.has(name)) {
          // Change the earlier instance of this group name to an unnamed capturing group
          groupsWithDuplicateNamesToRemove.add(namedGroupsInScope.get(name));
        }
        // Track the latest instance of this group name, and pass it up through parent alternatives
        namedGroupsInScope.set(name, node);
        // Skip the immediate parent alt because we don't want subsequent sibling alts to consider
        // named groups from their preceding siblings
        parentAlt = getParentAlternative(parentAlt);
        if (parentAlt) {
          while (parentAlt = getParentAlternative(parentAlt)) {
            getOrCreate(namedGroupsInScopeByAlt, parentAlt, new Map()).set(name, node);
          }
        }
      }
    },
    exit({node}, {groupOriginByCopy, openDirectCaptures, openSubroutineRefs}) {
      const {name, number} = node;
      if (groupOriginByCopy.get(node)) {
        openSubroutineRefs.delete(name ?? number);
      } else {
        openDirectCaptures.delete(node);
      }
    },
  },

  Subroutine({node, parent, key, container, replaceWith}, state) {
    const {groupOriginByCopy, subroutineRefMap} = state;
    const {ref} = node;
    const reffedGroupNode = subroutineRefMap.get(ref);
    // Other forms of recursion are handled by the `CapturingGroup` visitor
    const isGlobalRecursion = ref === 0;
    const expandedSubroutine = isGlobalRecursion ?
      createRecursion(ref) :
      // The reffed group might itself contain subroutines, which are expanded during sub-traversal
      cloneCapturingGroup(reffedGroupNode, groupOriginByCopy, null);
    let replacement = expandedSubroutine;
    if (!isGlobalRecursion) {
      // Subroutines take their flags from the reffed group, not the flags surrounding themselves
      const flags = getCombinedFlagsFromFlagNodes(getAllParents(reffedGroupNode, node => {
        return node.type === AstTypes.Group && !!node.flags;
      }));
      // TODO: Avoid if flags are the same as the currently active flag groups
      // TODO: When there aren't mods affecting the reffed group, need to disable currently active flags to match
      if (flags) {
        replacement = prepContainer(createGroup({flags}), [expandedSubroutine]);
      }
    }
    replaceWith(replacement);
    if (!isGlobalRecursion) {
      traverse({
        // Start traversal at the flag group wrapper so the logic for stripping duplicate names
        // propagates through its alternative
        node: replacement,
        parent,
        key,
        container,
      }, state, SecondPassVisitor);
    }
  },
};

const ThirdPassVisitor = {
  CapturingGroup({node}, state) {
    // Recalculate the number since the current value might be wrong due to subroutine expansion
    node.number = ++state.numCapturesToLeft;
    // Removing duplicate names here rather than in an earlier pass avoids extra complexity when
    // handling subroutine expansion and backref multiplexing
    if (state.groupsWithDuplicateNamesToRemove.has(node)) {
      delete node.name;
    }
  },

  Backreference({node, replaceWith}, {reffedNodesByBackreference}) {
    const refNodes = reffedNodesByBackreference.get(node);
    // For the backref's `ref`, use `number` rather than `name` because group names might have been
    // removed if they're duplicates within their alternation path, or they might be removed later
    // by the generator (depending on options) if they're duplicates within the overall pattern.
    // Backrefs must come after groups they ref, so reffed node `number`s are already recalculated
    if (refNodes.length > 1) {
      const alts = refNodes.map(reffedGroupNode => adoptAndSwapKids(
        createAlternative(),
        [createBackreference(reffedGroupNode.number)]
      ));
      replaceWith(adoptAndSwapKids(createGroup(), alts));
    } else {
      node.ref = refNodes[0].number;
    }
  },
};

function adoptAndSwapKids(parent, kids) {
  kids.forEach(kid => kid.parent = parent);
  parent[getChildContainerAccessor(parent)] = kids;
  return parent;
}

// Creates a deep copy of the provided node, with special handling:
// - Make `parent` props point to their parent in the copy
// - Update the provided `originMap` for each cloned capturing group (outer and nested)
function cloneCapturingGroup(obj, originMap, up, up2) {
  const store = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'parent') {
      // If the last cloned item was a child container array, use the object above it
      store.parent = Array.isArray(up) ? up2 : up;
    } else if (value && typeof value === 'object') {
      store[key] = cloneCapturingGroup(value, originMap, store, up);
    } else {
      if (key === 'type' && value === AstTypes.CapturingGroup) {
        // Key is the copied node, value is the origin node
        originMap.set(store, obj);
      }
      store[key] = value;
    }
  }
  return store;
}

function createRecursion(ref) {
  if (typeof ref === 'number') {
    // Limitation of `regex-recursion`; remove if future versions support
    throw new Error('Unsupported recursion by number; use name instead');
  }
  return {
    type: AstTypes.Recursion,
    ref,
  };
}

function getAllParents(node, filterFn) {
  const results = [];
  while (node = node.parent) {
    if (!filterFn || filterFn(node)) {
      results.push(node);
    }
  }
  return results;
}

function getChildContainerAccessor(node) {
  if (node.alternatives) {
    return 'alternatives';
  }
  if (node.elements) {
    return 'elements';
  }
  if (node.classes) {
    return 'classes';
  }
  throw new Error('Accessor for child container unknown');
}

function getCombinedFlagsFromFlagNodes(flagNodes) {
  const flagProps = ['dotAll', 'ignoreCase'];
  const combinedFlags = {enable: {}, disable: {}};
  flagNodes.forEach(({flags}) => {
    flagProps.forEach(prop => {
      if (flags.enable?.[prop]) {
        // Need to remove `disable` since disabled flags take precedence
        delete combinedFlags.disable[prop];
        combinedFlags.enable[prop] = true;
      }
      if (flags.disable?.[prop]) {
        combinedFlags.disable[prop] = true;
      }
    });
  });
  if (!Object.keys(combinedFlags.enable).length) {
    delete combinedFlags.enable;
  }
  if (!Object.keys(combinedFlags.disable).length) {
    delete combinedFlags.disable;
  }
  if (combinedFlags.enable || combinedFlags.disable) {
    return combinedFlags;
  }
  return null;
}

function getParentAlternative(node) {
  // Skip past quantifiers, etc.
  while (node = node.parent) {
    if (node.type === AstTypes.Alternative) {
      return node;
    }
  }
  return null;
}

// Returns a single node, either the given node or all nodes wrapped in a noncapturing group
// TODO: Consider moving to `parse` module and dropping assumptions about `parent` props
function parseFragment(pattern, {bypassPropertyNameCheck}) {
  const ast = parse(tokenize(pattern), {bypassPropertyNameCheck});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    return adoptAndSwapKids(createGroup(), alts);;
  }
  return alts[0].elements[0];
}

function prepContainer(node, kids) {
  const accessor = getChildContainerAccessor(node);
  // Set the parent for the default container of a new node
  node[accessor][0].parent = node;
  if (kids) {
    adoptAndSwapKids(node[accessor][0], kids);
  }
  return node;
}

export {
  transform,
};
