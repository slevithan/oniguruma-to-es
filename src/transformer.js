import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstTypes, AstVariableLengthCharacterSetKinds, createGroup, createLookaround, createUnicodeProperty, parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {traverse} from './traverser.js';
import {JsUnicodeProperties, PosixClasses} from './unicode.js';
import {r} from './utils.js';

// Transform an Oniguruma AST in-place to a `regex` AST
function transform(ast, options = {}) {
  const firstPassState = {
    allowBestEffort: !!options.allowBestEffort,
    flagDirectivesByAlt: new Map(),
    subroutineRefMap: new Map(),
  };
  traverse({node: ast}, firstPassState, FirstPassVisitor);
  // The interplay of subroutines (with Onig's unique rules and behavior for them) with duplicate
  // group names (which might be indirectly referenced by subroutines), backref multiplexing (a
  // unique Onig feature), flag modifiers, and nested subroutine refs is extremely complicated to
  // emulate in JS in a way that perfectly handles all edge cases, so we need a second and third
  // pass to do it. See comments in the parser for details of Onig's subroutine behavior
  const secondPassState = {
    namedGroupsInScopeByAlt: new Map(),
  };
  traverse({node: ast}, secondPassState, SecondPassVisitor);
  return ast;
}

const FirstPassVisitor = {
  Alternative: {
    enter({node, parent, key}, {flagDirectivesByAlt}) {
      // Look for own-level flag directives when entering an alternative because after traversing
      // the directive itself, any subsequent flag directives will no longer be at the same level
      const flagDirectives = [];
      for (let i = 0; i < node.elements.length; i++) {
        const child = node.elements[i];
        if (child.kind === AstDirectiveKinds.flags) {
          flagDirectives.push(child);
        }
      }
      for (let i = key + 1; i < parent.alternatives.length; i++) {
        const forwardSiblingAlt = parent.alternatives[i];
        setExistingOr(flagDirectivesByAlt, forwardSiblingAlt, []).push(...flagDirectives);
      }
    },
    exit({node, parent}, {flagDirectivesByAlt}) {
      // Wait until exiting to wrap an alternative's nodes with flag groups that emulate flag
      // directives from prior sibling alternatives because doing this at the end allows inner
      // nodes to accurately check their level in the tree
      if (flagDirectivesByAlt.get(node)?.length) {
        const flags = getFlagsFromFlagDirectives(flagDirectivesByAlt.get(node));
        const flagGroup = createGroup({flags});
        flagGroup.parent = parent;
        adoptAndReplaceKids(flagGroup.alternatives[0], node.elements);
        node.elements = [flagGroup];
      }
      flagDirectivesByAlt.delete(node); // Might as well clean up
    },
  },

  Assertion({node, parent, key, ast, remove, replaceWith}) {
    const {kind, negate} = node;
    if (kind === AstAssertionKinds.search_start) {
      // Allows multiple leading `\G`s since the the node is removed. Additional `\G` error
      // checking in the `Pattern` visitor
      if (parent.parent !== ast.pattern || key !== 0) {
        throw new Error(r`Uses "\G" in an unsupported way`);
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

  Backreference(path) {
    // TODO: multiplexing
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
      const flagGroup = createGroup({flags});
      adoptAndReplaceKids(flagGroup.alternatives[0], removeAllNextSiblings());
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
        throw new Error(r`Uses "\K" in an unsupported way`);
      }
      const lookbehind = createLookaround({behind: true});
      replaceWith(lookbehind);
      adoptAndReplaceKids(lookbehind.alternatives[0], removeAllPrevSiblings());
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
    parent.options = {
      disable: {
        // Onig uses different rules for flag x than `regex`, so disable the implicit flag
        x: true,
        // Onig has no flag to control "named capture only" mode but contextually applies its
        // behavior when named capturing is used, so disable `regex`'s implicit flag for it
        n: true,
      },
      force: {
        // Always add flag v because that enables JS support for various Onig features (nested
        // classes, set intersection, Unicode properties, `\u{}`) and allows the code generator
        // to rely on one set of JS regex syntax
        v: true,
      },
    };
  },

  Pattern({node}, {subroutineRefMap}) {
    // Used for `\g<0>` recursion of the entire pattern
    subroutineRefMap.set(0, node);
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
      throw new Error(r`Uses "\G" in an unsupported way`);
    }
  },

  Subroutine(path) {
    // TODO
  },

  VariableLengthCharacterSet({node, replaceWith}, {allowBestEffort}) {
    const {kind} = node;
    if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
      if (!allowBestEffort) {
        throw new Error(r`\X unsupported when allowBestEffort disabled`);
      }
      // Reasonably close approximation of an extended grapheme cluster. Full details of what
      // should be matched are in Unicode Standard Annex #29 <https://unicode.org/reports/tr29/>
      replaceWith(parseFragment(r`(?>\P{M}\p{M}*)`));
    } else if (kind === AstVariableLengthCharacterSetKinds.newline) {
      replaceWith(parseFragment(r`(?>\r\n?|[\n\v\f\x85\u2028\u2029])`));
    }
  },
};

const SecondPassVisitor = {
  Alternative({node}, {namedGroupsInScopeByAlt}) {
    // JS requires group names to be unique per alternation (which includes alternations in
    // nested groups), so pass down the current names used within this alternation to nested
    // alternations for handling within the `CapturingGroup` visitor
    const parentAlt = getParentAlternative(node);
    if (parentAlt) {
      namedGroupsInScopeByAlt.set(node, namedGroupsInScopeByAlt.get(parentAlt));
    }
  },

  CapturingGroup({node}, {namedGroupsInScopeByAlt}) {
    const {name} = node;
    // JS requires group names to be unique per alternation (which includes alternations in
    // nested groups), so if using a duplicate name for this alternation path, keep the name only
    // on the last instance
    let parentAlt = getParentAlternative(node);
    const namedGroupsInScope = setExistingOr(namedGroupsInScopeByAlt, parentAlt, new Map());
    if (namedGroupsInScope.has(name)) {
      // Change the earlier instance of this group name to an unnamed capturing group
      delete namedGroupsInScope.get(name).name;
    }
    // Track the latest instance of this group name, and pass it up through parent alternatives
    namedGroupsInScope.set(name, node);
    // Skip the immediate parent alt because we don't want subsequent sibling alts to consider
    // named groups from their preceding siblings
    parentAlt = getParentAlternative(parentAlt);
    if (parentAlt) {
      while (parentAlt = getParentAlternative(parentAlt)) {
        setExistingOr(namedGroupsInScopeByAlt, parentAlt, new Map()).set(name, node);
      }
    }
  },
};

// Abandon current children if any; adopt new
function adoptAndReplaceKids(parent, kids) {
  kids.forEach(kid => kid.parent = parent);
  if (parent.alternatives) {
    parent.alternatives = kids;
  } else if (parent.elements) {
    parent.elements = kids;
  } else if (parent.classes) {
    parent.classes = kids;
  } else {
    throw new Error('Accessor for child container unknown');
  }
}

function getFlagsFromFlagDirectives(flagDirectiveNodes) {
  const flagProps = ['dotAll', 'ignoreCase'];
  const combinedFlags = {enable: {}, disable: {}};
  flagDirectiveNodes.forEach(({flags}) => {
    flagProps.forEach(prop => {
      if (flags?.enable?.[prop]) {
        // Disabled flags take precedence
        delete combinedFlags.disable[prop];
        combinedFlags.enable[prop] = true;
      }
      if (flags?.disable?.[prop]) {
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
  return combinedFlags;
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
function parseFragment(pattern) {
  const ast = parse(tokenize(pattern, ''), {optimize: true});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    const group = createGroup();
    adoptAndReplaceKids(group, alts);
    return group;
  }
  return alts[0].elements[0];
}

function setExistingOr(map, key, defaultValue) {
  map.set(key, map.get(key) ?? defaultValue);
  return map.get(key);
}

export {
  transform,
};
