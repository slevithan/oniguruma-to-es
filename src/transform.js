import {Accuracy, Target} from './options.js';
import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstTypes, AstVariableLengthCharacterSetKinds, createAlternative, createBackreference, createCapturingGroup, createGroup, createLookaround, createUnicodeProperty, isLookaround, parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {traverse} from './traverse.js';
import {JsUnicodeProperties, PosixClassesMap} from './unicode.js';
import {cp, getNewCurrentFlags, getOrCreate, isMinTarget, r} from './utils.js';
import emojiRegex from 'emoji-regex-xs';

/**
@typedef {{
  type: 'Regex';
  parent: null;
  pattern: Object;
  flags: Object;
  options: Object;
  _strategy?: {
    name: string;
  };
}} RegexAst
*/
/**
Transforms an Oniguruma AST in-place to a [`regex`](https://github.com/slevithan/regex) AST.
Targets `ESNext`, expecting the generator to then down-convert to the desired JS target version.

`regex`'s syntax and behavior is a strict superset of native JavaScript, so the AST is very close
to representing native ESNext `RegExp` but with some added features (atomic groups, possessive
quantifiers, recursion). The AST doesn't use some of `regex`'s extended features like flag `x` or
subroutines because they follow PCRE behavior and work somewhat differently than in Oniguruma. The
AST represents what's needed to precisely reproduce Oniguruma behavior using `regex`.
@param {import('./parse.js').OnigurumaAst} ast
@param {{
  accuracy?: keyof Accuracy;
  avoidSubclass?: boolean;
  bestEffortTarget?: keyof Target;
}} [options]
@returns {RegexAst}
*/
function transform(ast, options) {
  const opts = {
    // A couple edge cases exist where options `accuracy` and `bestEffortTarget` are used:
    // - `VariableLengthCharacterSet` kind `grapheme` (`\X`): An exact representation would require
    //   heavy Unicode data; a best-effort approximation requires knowing the target.
    // - `CharacterSet` kind `posix` with values `graph` and `print`: Their complex exact
    //   representations are hard to change after the fact in the generator to a best-effort
    //   approximation based on the target, so produce the appropriate structure here.
    accuracy: 'default',
    avoidSubclass: false,
    bestEffortTarget: 'ESNext',
    ...options,
  };
  // AST changes that work together with a `RegExp` subclass to add advanced emulation
  const strategy = opts.avoidSubclass ? null : applySubclassStrategies(ast, opts.accuracy);
  const firstPassState = {
    accuracy: opts.accuracy,
    flagDirectivesByAlt: new Map(),
    minTargetEs2024: isMinTarget(opts.bestEffortTarget, 'ES2024'),
    // Subroutines can appear before the groups they ref, so collect reffed nodes for a second pass 
    subroutineRefMap: new Map(),
    supportedGNodes: new Set(),
  };
  traverse({node: ast}, firstPassState, FirstPassVisitor);
  // Global flags modified by the first pass
  const globalFlags = {
    dotAll: ast.flags.dotAll,
    ignoreCase: ast.flags.ignoreCase,
  };
  // The interplay of subroutines (with Onig's unique rules/behavior for them; see comments in the
  // parser for details) with backref multiplexing (a unique Onig feature), flag modifiers, and
  // duplicate group names (which might be indirectly referenced by subroutines even though
  // subroutines can't directly reference duplicate names) is extremely complicated to emulate in
  // JS in a way that handles all edge cases, so we need multiple passes to do it
  const secondPassState = {
    currentFlags: globalFlags,
    prevFlags: null,
    globalFlags,
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
    highestOrphanBackref: 0,
    numCapturesToLeft: 0,
    reffedNodesByBackreference: secondPassState.reffedNodesByBackreference,
  };
  traverse({node: ast}, thirdPassState, ThirdPassVisitor);
  if (strategy) {
    ast._strategy = strategy;
  }
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
        const flags = getCombinedFlagModsFromFlagNodes(flagDirectivesByAlt.get(node));
        if (flags) {
          const flagGroup = prepContainer(createGroup({flags}), node.elements);
          // Manually set the parent since we're not using `replaceWith`
          flagGroup.parent = node;
          node.elements = [flagGroup];
        }
      }
    },
  },

  Assertion({node, ast, remove, replaceWith}, {accuracy, supportedGNodes}) {
    const {kind, negate} = node;
    if (kind === AstAssertionKinds.line_end) {
      // Onig's only line break char is line feed, unlike JS
      replaceWith(parseFragment(r`(?=\z|\n)`));
    } else if (kind === AstAssertionKinds.line_start) {
      // Onig's only line break char is line feed, unlike JS
      replaceWith(parseFragment(r`(?<=\A|\n)`));
    } else if (kind === AstAssertionKinds.search_start) {
      if (!supportedGNodes.has(node) && accuracy !== 'loose') {
        throw new Error(r`Uses "\G" in a way that's unsupported`);
      }
      ast.flags.sticky = true;
      remove();
    } else if (kind === AstAssertionKinds.string_end_newline) {
      replaceWith(parseFragment(r`(?=\n?\z)`));
    } else if (kind === AstAssertionKinds.word_boundary) {
      // Onig's word char definition for `\b` is different than for `\w`
      const wordChar = r`[\p{L}\p{N}\p{Pc}]`;
      const b = `(?:(?<=${wordChar})(?!${wordChar})|(?<!${wordChar})(?=${wordChar}))`;
      const B = `(?:(?<=${wordChar})(?=${wordChar})|(?<!${wordChar})(?!${wordChar}))`;
      replaceWith(parseFragment(negate ? B : b));
    }
    // Kinds `string_end` and `string_start` don't need transformation since JS flag m isn't used.
    // Kinds `lookahead` and `lookbehind` also don't need transformation
  },

  CapturingGroup({node}, {subroutineRefMap}) {
    const {name, number} = node;
    if (name && !isValidGroupNameJs(name)) {
      throw new Error(`Group name "${name}" invalid in JS`);
    }
    subroutineRefMap.set(name ?? number, node);
  },

  CharacterSet({node, replaceWith}, {accuracy, minTargetEs2024}) {
    const {kind, negate, value} = node;
    if (kind === AstCharacterSetKinds.any) {
      replaceWith(createUnicodeProperty('Any'));
    } else if (kind === AstCharacterSetKinds.hex) {
      replaceWith(createUnicodeProperty('AHex', {negate}));
    } else if (kind === AstCharacterSetKinds.non_newline) {
      replaceWith(parseFragment(r`[^\n]`));
    } else if (kind === AstCharacterSetKinds.posix) {
      if (!minTargetEs2024 && (value === 'graph' || value === 'print')) {
        if (accuracy === 'strict') {
          throw new Error(`POSIX class "${value}" requires min target ES2024 or non-strict accuracy`);
        }
        let ascii = {
          graph: '!-~',
          print: ' -~',
        }[value];
        if (negate) {
          // POSIX classes are always nested in a char class; manually invert the range rather than
          // using `[^...]` so it can be unwrapped since ES2018 doesn't support nested classes
          ascii = `\0-${cp(ascii.codePointAt(0) - 1)}${cp(ascii.codePointAt(2) + 1)}-\u{10FFFF}`;
        }
        replaceWith(parseFragment(`[${ascii}]`));
      } else {
        const negateableNode = parseFragment(PosixClassesMap.get(value));
        negateableNode.negate = negate;
        replaceWith(negateableNode);
      }
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

  Directive(path, state) {
    const {node, parent, ast, remove, replaceWith, removeAllPrevSiblings, removeAllNextSiblings} = path;
    const {kind, flags} = node;
    if (kind === AstDirectiveKinds.flags) {
      if (!flags.enable && !flags.disable) {
        // Flag directive without flags; ex: `(?-)`, `(?--)`
        remove();
      } else {
        const flagGroup = prepContainer(createGroup({flags}), removeAllNextSiblings());
        replaceWith(flagGroup);
        traverseReplacement(flagGroup, path, state, FirstPassVisitor);
      }
    } else if (kind === AstDirectiveKinds.keep) {
      // Allows multiple `\K`s
      if (parent.parent !== ast.pattern || ast.pattern.alternatives.length > 1) {
        // `\K` is emulatable at least within top-level alternation, but it's tricky. Ex: `ab\Kc|a`
        // is equivalent to `(?<=ab)c|a(?!bc)`, not simply `(?<=ab)c|a`
        throw new Error(r`Uses "\K" in a way that's unsupported`);
      }
      replaceWith(prepContainer(createLookaround({behind: true}), removeAllPrevSiblings()));
    }
  },

  Flags({node, parent}) {
    // Onig's flag x (`extended`) isn't available in JS
    delete node.extended;
    Object.assign(node, {
      // JS flag g; no Onig equiv
      global: false,
      // JS flag d; no Onig equiv
      hasIndices: false,
      // JS flag m; no Onig equiv but its behavior is always on in Onig. Onig's only line break
      // char is line feed, unlike JS, so this flag isn't used since it would produce inaccurate
      // results (also allows `^` and `$` to be used in the generator for string start and end)
      multiline: false,
      // JS flag y; no Onig equiv, but used for `\G` emulation
      sticky: node.sticky ?? false,
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
        // support for Onig features nested classes, set intersection, Unicode properties, etc.).
        // However, the generator might disable flag v based on its `target` option
        v: true,
      },
    };
  },

  Group({node}) {
    if (!node.flags) {
      return;
    }
    const {enable, disable} = node.flags;
    // Onig's flag x (`extended`) isn't available in JS
    enable?.extended && delete enable.extended;
    disable?.extended && delete disable.extended;
    // JS doesn't support flag groups that enable and disable the same flag; ex: `(?i-i:)`
    enable?.dotAll && disable?.dotAll && delete enable.dotAll;
    enable?.ignoreCase && disable?.ignoreCase && delete enable.ignoreCase;
    // Cleanup
    enable && !Object.keys(enable).length && delete node.flags.enable;
    disable && !Object.keys(disable).length && delete node.flags.disable;
    !node.flags.enable && !node.flags.disable && delete node.flags;
  },

  Pattern({node}, {accuracy, supportedGNodes}) {
    // For `\G` to be accurately emulatable using JS flag y, it must be at (and only at) the start
    // of every top-level alternative (with complex rules for what determines being at the start).
    // Additional `\G` error checking in `Assertion` visitor
    const leadingGs = [];
    let hasAltWithLeadG = false;
    let hasAltWithoutLeadG = false;
    for (const alt of node.alternatives) {
      const leadingG = getLeadingG(alt.elements);
      if (leadingG) {
        hasAltWithLeadG = true;
        if (Array.isArray(leadingG)) {
          leadingGs.push(...leadingG);
        } else {
          leadingGs.push(leadingG);
        }
      } else {
        hasAltWithoutLeadG = true;
      }
    }
    if (hasAltWithLeadG && hasAltWithoutLeadG && accuracy !== 'loose') {
      throw new Error(r`Uses "\G" in a way that's unsupported`);
    }
    // These nodes will be removed when traversed; other `\G` nodes will error
    leadingGs.forEach(g => supportedGNodes.add(g))
  },

  Quantifier({node}) {
    if (node.element.type === AstTypes.Quantifier) {
      // Change e.g. `a**` to `(?:a*)*`
      const group = prepContainer(createGroup(), [node.element]);
      // Manually set the parent since we're not using `replaceWith`
      group.parent = node;
      node.element = group;
    }
  },

  VariableLengthCharacterSet({node, replaceWith}, {accuracy, minTargetEs2024}) {
    const {kind} = node;
    if (kind === AstVariableLengthCharacterSetKinds.newline) {
      replaceWith(parseFragment('(?>\r\n?|[\n\v\f\x85\u2028\u2029])'));
    } else if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
      if (accuracy === 'strict') {
        throw new Error(r`Use of "\X" requires non-strict accuracy`);
      }
      // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows over/under-qualified
      // emoji using a general pattern that matches any Unicode sequence following the structure of
      // a valid emoji. That actually makes it more accurate for matching any grapheme
      const emoji = minTargetEs2024 ? r`\p{RGI_Emoji}` : emojiRegex().source.replace(/\\u\{/g, r`\x{`);
      // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>.
      // Skip name check to allow `RGI_Emoji` through, which Onig doesn't support
      replaceWith(parseFragment(r`(?>\r\n|${emoji}|\P{M}\p{M}*)`, {skipPropertyNameValidation: true}));
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
    const {orphan, ref} = node;
    if (!orphan) {
      // Copy the current state for later multiplexing expansion. It's done in a subsequent pass
      // because backref numbers need to be recalculated after subroutine expansion
      reffedNodesByBackreference.set(node, [...multiplexCapturesToLeftByRef.get(ref).map(({node}) => node)]);
    }
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
      const parentAlt = getParentAlternative(node);

      // ## Handle recursion; runs after subroutine expansion
      if (openSubroutineRefs.has(ref)) {
        // Indirect recursion is supportable at the AST level but would require `regex-recursion`
        // to allow multiple recursions in a pattern, along with code changes here (after which
        // `openDirectCaptures` and `openSubroutineRefs` could be combined)
        throw new Error('Unsupported indirect recursion');
      }
      if (origin) {
        // Name or number; not mixed since can't use numbered subroutines with named capture
        openSubroutineRefs.add(ref);
      } else {
        openDirectCaptures.add(node);
      }
      if (openDirectCaptures.has(origin)) {
        // Recursion doesn't affect any following backrefs to its `ref` (unlike other subroutines),
        // so don't wrap with a capture
        // [TODO] The reffed group might have its name removed due to a later subroutine expansion
        // (ex: `(?<a>\g<a>)\g<a>`), so use `number` for `ref`, look up the reffed node in
        // `openDirectCaptures`, and rename `reffedNodesByBackreference` so it can also be used to
        // track the reffed node. Like with backrefs, can then modify the `ref` in the final pass
        // to use the recalculated group number. But this relies on `regex-recursion` supporting
        // multiple non-overlapping recursions. For now, the resulting error is caught by
        // `regex-recursion`
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
        const mpName = multiplex.node.name;
        if (
          // This group is from subroutine expansion, and there's a multiplex value from either the
          // origin node or a prior subroutine expansion group with the same origin
          (origin === multiplex.node || (origin && origin === multiplex.origin)) ||
          // This group is not from subroutine expansion, and it comes after a subroutine expansion
          // group that refers to this group
          node === multiplex.origin ||
          // The multiplex node is a named group that's not in the current alternation path (which
          // will mean it's nonparticipating for any following backrefs); remove it from
          // multiplexing since backrefs to nonparticipating groups can't match in Onig but match
          // the empty string in JS
          (mpName && !getOrCreate(namedGroupsInScopeByAlt, parentAlt, new Map()).has(mpName))
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
        const namedGroupsInScope = getOrCreate(namedGroupsInScopeByAlt, parentAlt, new Map());
        if (namedGroupsInScope.has(name)) {
          // Will change the earlier instance with this name to an unnamed capture in a later pass
          groupsWithDuplicateNamesToRemove.add(namedGroupsInScope.get(name));
        }
        // Track the latest instance of this group name, and pass it up through parent alternatives
        namedGroupsInScope.set(name, node);
        // Skip the immediate parent alt because we don't want subsequent sibling alts to consider
        // named groups from their preceding siblings
        let upAlt = getParentAlternative(parentAlt);
        if (upAlt) {
          do {
            getOrCreate(namedGroupsInScopeByAlt, upAlt, new Map()).set(name, node);
          } while ((upAlt = getParentAlternative(upAlt)));
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

  Group: {
    enter({node}, state) {
      // Flag directives have already been converted to flag groups by the previous pass
      state.prevFlags = state.currentFlags;
      if (node.flags) {
        state.currentFlags = getNewCurrentFlags(state.currentFlags, node.flags);
      }
    },
    exit(_, state) {
      state.currentFlags = state.prevFlags;
    },
  },

  Subroutine(path, state) {
    const {node, replaceWith} = path;
    const {ref} = node;
    const reffedGroupNode = state.subroutineRefMap.get(ref);
    // Other forms of recursion are handled by the `CapturingGroup` visitor
    const isGlobalRecursion = ref === 0;
    const expandedSubroutine = isGlobalRecursion ?
      createRecursion(ref) :
      // The reffed group might itself contain subroutines, which are expanded during sub-traversal
      cloneCapturingGroup(reffedGroupNode, state.groupOriginByCopy, null);
    let replacement = expandedSubroutine;
    if (!isGlobalRecursion) {
      // Subroutines take their flags from the reffed group, not the flags surrounding themselves
      const reffedGroupFlagMods = getCombinedFlagModsFromFlagNodes(getAllParents(reffedGroupNode, node => {
        return node.type === AstTypes.Group && !!node.flags;
      }));
      const reffedGroupFlags = reffedGroupFlagMods ?
        getNewCurrentFlags(state.globalFlags, reffedGroupFlagMods) :
        state.globalFlags;
      if (!areFlagsEqual(reffedGroupFlags, state.currentFlags)) {
        replacement = prepContainer(createGroup({
          flags: getFlagModsFromFlags(reffedGroupFlags),
        }), [expandedSubroutine]);
      }
    }
    replaceWith(replacement);
    if (!isGlobalRecursion) {
      traverseReplacement(replacement, path, state, SecondPassVisitor);
    }
  },
};

const ThirdPassVisitor = {
  Backreference({node, replaceWith}, state) {
    if (node.orphan) {
      state.highestOrphanBackref = Math.max(state.highestOrphanBackref, node.ref);
      return;
    }
    const refNodes = state.reffedNodesByBackreference.get(node);
    const unclosedCaps = getAllParents(node, node => node.type === AstTypes.CapturingGroup);
    // For the backref's `ref`, use `number` rather than `name` because group names might have been
    // removed if they're duplicates within their alternation path, or they might be removed later
    // by the generator (depending on target) if they're duplicates within the overall pattern.
    // Backrefs must come after groups they ref, so reffed node `number`s are already recalculated.
    // Also, convert backrefs to not-yet-closed groups to `(?!)`; they can't match in Onig but
    // match the empty string in JS
    if (refNodes.length > 1) {
      const alts = refNodes.map(reffedGroupNode => adoptAndSwapKids(
        createAlternative(),
        [ unclosedCaps.some(capture => capture.number === reffedGroupNode.number) ?
            createLookaround({negate: true}) :
            createBackreference(reffedGroupNode.number)
        ]
      ));
      replaceWith(adoptAndSwapKids(createGroup(), alts));
    } else {
      node.ref = refNodes[0].number;
      if (unclosedCaps.some(capture => capture.number === node.ref)) {
        replaceWith(createLookaround({negate: true}));
      }
    }
  },

  CapturingGroup({node}, state) {
    // Recalculate the number since the current value might be wrong due to subroutine expansion
    node.number = ++state.numCapturesToLeft;
    // Removing duplicate names here rather than in an earlier pass avoids extra complexity when
    // handling subroutine expansion and backref multiplexing
    if (state.groupsWithDuplicateNamesToRemove.has(node)) {
      delete node.name;
    }
  },

  Regex: {
    exit({node}, state) {
      // [HACK] Add unnamed captures to the end of the regex if needed to allow orphaned backrefs
      // to be valid in JS. This is needed to support TextMate grammars, which merge `begin` and
      // `end` patterns. An `end` pattern might therefore have backrefs to a group that doesn't
      // exist within `end`. This presents a dilemma since both Oniguruma and JS (with flag u or v)
      // throw for backrefs to missing captures, and the backref can't be removed or changed. So
      // here's a solution. NB: Orphan backrefs are only allowed if the `tmGrammar` option is used
      const numCapsNeeded = Math.max(state.highestOrphanBackref - state.numCapturesToLeft, 0);
      for (let i = 0; i < numCapsNeeded; i++) {
        const emptyCapture = createCapturingGroup();
        node.pattern.alternatives.at(-1).elements.push(emptyCapture);
      }
    },
  },
};

function adoptAndSwapKids(parent, kids) {
  kids.forEach(kid => kid.parent = parent);
  parent[getChildContainerAccessor(parent)] = kids;
  return parent;
}

function applySubclassStrategies(ast, accuracy) {
  // Special case handling that requires coupling with a `RegExp` subclass (see `EmulatedRegExp`).
  // These changes add emulation support for some common patterns that are otherwise unsupportable.
  // Only one subclass strategy is supported per pattern
  const alts = ast.pattern.alternatives;
  const firstEl = alts[0].elements[0];
  if (alts.length > 1 || !firstEl) {
    // These strategies only work if there's no top-level alternation
    return null;
  }
  const hasWrapperGroup =
    alts[0].elements.length === 1 &&
    (firstEl.type === AstTypes.CapturingGroup || firstEl.type === AstTypes.Group) &&
    firstEl.alternatives.length === 1;
  const singleAltIn = hasWrapperGroup ? firstEl.alternatives[0] : alts[0];
  // First el within first group if the group doesn't contain top-level alternation, else just the
  // first el of the pattern; ex: a flag group might enclose the full pattern
  const firstElIn = hasWrapperGroup ? singleAltIn.elements[0] : firstEl;
  if (!firstElIn) {
    return null;
  }

  // ## Strategy `line_or_search_start`: Support leading `(^|\G)` and similar
  if (
    (firstElIn.type === AstTypes.CapturingGroup || firstElIn.type === AstTypes.Group) &&
    firstElIn.alternatives.length === 2 &&
    firstElIn.alternatives[0].elements.length === 1 &&
    firstElIn.alternatives[1].elements.length === 1
  ) {
    const el1 = firstElIn.alternatives[0].elements[0];
    const el2 = firstElIn.alternatives[1].elements[0];
    if (
      (el1.kind === AstAssertionKinds.line_start && el2.kind === AstAssertionKinds.search_start) ||
      (el1.kind === AstAssertionKinds.search_start && el2.kind === AstAssertionKinds.line_start)
    ) {
      // Remove the `\G` and its container alternative
      if (el1.kind === AstAssertionKinds.line_start) {
        firstElIn.alternatives.pop();
      } else {
        firstElIn.alternatives.shift();
      }
      return {name: 'line_or_search_start'};
    }
  }

  // ## Strategy `not_search_start`: Support leading `(?!\G)` and similar
  function isNegG(node) {
    return isLookaround(node) &&
      node.negate &&
      node.alternatives.length === 1 &&
      node.alternatives[0].elements.length === 1 &&
      node.alternatives[0].elements[0].kind === AstAssertionKinds.search_start;
  }
  if (isNegG(firstElIn)) {
    // Remove the lookaround
    firstElIn.parent.elements.shift();
    return {name: 'not_search_start'};
  }
  const negGIndex = singleAltIn.elements.findIndex(el => isNegG(el));
  if (negGIndex > -1 && singleAltIn.elements.every(el => el.type === AstTypes.Assertion)) {
    // Remove the lookaround
    singleAltIn.elements.splice(negGIndex, 1);
    return {name: 'not_search_start'};
  }

  // ## Strategy `after_search_start_or_subpattern`: Support leading `(?<=\G|…)` and similar
  // Note: Leading `(?<=\G)` without other alts is already supported; no need for a subclass
  if (
    isLookaround(firstElIn) &&
    !firstElIn.negate &&
    firstElIn.alternatives.length > 1
  ) {
    const siblingAlts = [];
    let hasGAlt = false;
    firstElIn.alternatives.forEach(alt => {
      if (alt.elements.length === 1 && alt.elements[0].kind === AstAssertionKinds.search_start) {
        hasGAlt = true;
      } else {
        siblingAlts.push(alt);
      }
    });
    if (hasGAlt && siblingAlts.length) {
      let supported = true;
      if (siblingAlts.some(alt => alt.elements.some(el => {
        // Check for nodes that are or can include captures
        return el.type === AstTypes.CapturingGroup || el.type === AstTypes.Group || el.type === AstTypes.Subroutine || isLookaround(el);
      }))) {
        if (accuracy === 'loose') {
          supported = false;
        } else {
          throw new Error(r`Uses "\G" in a way that's unsupported`);
        }
      }
      if (supported) {
        // [HACK] Replace the lookbehind with an emulation marker since it isn't easy from here to
        // acurately extract what will later become the generated subpattern
        const emulationGroup = adoptAndSwapKids(createGroup(), [
          adoptAndSwapKids(createAlternative(), [createUnicodeProperty('<<', {skipPropertyNameValidation: true})]),
          ...siblingAlts,
          adoptAndSwapKids(createAlternative(), [createUnicodeProperty('>>', {skipPropertyNameValidation: true})]),
        ]);
        emulationGroup.parent = firstElIn.parent;
        firstElIn.parent.elements[0] = emulationGroup;
        return {name: 'after_search_start_or_subpattern'};
      }
    }
  }
  return null;
}

function areFlagsEqual(a, b) {
  return a.dotAll === b.dotAll && a.ignoreCase === b.ignoreCase;
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
        originMap.set(store, originMap.get(obj) ?? obj);
      }
      store[key] = value;
    }
  }
  return store;
}

function createRecursion(ref) {
  return {
    type: AstTypes.Recursion,
    ref,
  };
}

function getAllParents(node, filterFn) {
  const results = [];
  while ((node = node.parent)) {
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

function getCombinedFlagModsFromFlagNodes(flagNodes) {
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

function getFlagModsFromFlags({dotAll, ignoreCase}) {
  const mods = {};
  if (dotAll || ignoreCase) {
    mods.enable = {};
    dotAll && (mods.enable.dotAll = true);
    ignoreCase && (mods.enable.ignoreCase = true);
  }
  if (!dotAll || !ignoreCase) {
    mods.disable = {};
    !dotAll && (mods.disable.dotAll = true);
    !ignoreCase && (mods.disable.ignoreCase = true);
  }
  return mods;
}

function getLeadingG(els) {
  if (!els.length) {
    return null;
  }
  const first = els[0];
  // Special case for leading positive lookaround with leading `\G`; else all leading assertions
  // are ignored when looking for `\G`
  if (isLookaround(first) && !first.negate && first.alternatives.length === 1 && first.alternatives[0].elements.length) {
    const els = first.alternatives[0].elements;
    const index = first.kind === AstAssertionKinds.lookahead ? 0 : els.length - 1;
    // `\G` is first node in lookahead or last node in lookbehind
    if (els[index].kind === AstAssertionKinds.search_start) {
      return els[index];
    }
  }

  const firstToConsider = els.find(el => {
    return el.kind === AstAssertionKinds.search_start ?
      true :
      ( el.type !== AstTypes.Directive &&
        el.type !== AstTypes.Assertion &&
        !(el.type === AstTypes.Quantifier && !el.min)
      );
  });
  if (!firstToConsider) {
    return null;
  }
  if (firstToConsider.kind === AstAssertionKinds.search_start) {
    return firstToConsider;
  }
  if (firstToConsider.type === AstTypes.Group || firstToConsider.type === AstTypes.CapturingGroup) {
    const gNodesForGroup = [];
    for (const alt of firstToConsider.alternatives) {
      const leadingG = getLeadingG(alt.elements);
      if (!leadingG) {
        // Don't return `gNodesForGroup` collected so far since this alt didn't qualify
        return null;
      }
      if (Array.isArray(leadingG)) {
        gNodesForGroup.push(...leadingG);
      } else {
        gNodesForGroup.push(leadingG);
      }
    }
    return gNodesForGroup;
  }
  return null;
}

// See also `getAllParents`
function getParentAlternative(node) {
  while ((node = node.parent)) {
    // Skip past quantifiers, etc.
    if (node.type === AstTypes.Alternative) {
      return node;
    }
  }
  return null;
}

function isValidGroupNameJs(name) {
  // JS group names are more restrictive than Onig; see
  // <developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers>
  return /^[$_\p{IDS}][$\u200C\u200D\p{IDC}]*$/u.test(name);
}

// Returns a single node, either the given node or all nodes wrapped in a noncapturing group
function parseFragment(pattern, {skipPropertyNameValidation} = {}) {
  const ast = parse(tokenize(pattern), {skipPropertyNameValidation});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    return adoptAndSwapKids(createGroup(), alts);
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

function traverseReplacement(replacement, {parent, key, container}, state, visitor) {
  traverse({
    // Don't use the `node` from `path`
    node: replacement,
    parent,
    key,
    container,
  }, state, visitor);
}

export {
  transform,
};
