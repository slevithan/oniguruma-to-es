import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstTypes, AstVariableLengthCharacterSetKinds, createGroup, createLookaround, createUnicodeProperty, parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {traverse} from './traverser.js';
import {JsUnicodeProperties, PosixClasses} from './unicode.js';
import {r} from './utils.js';

// Transform an Oniguruma AST in-place to a `regex` AST
function transform(ast, {allowBestEffort} = {}) {
  traverse({node: ast}, {allowBestEffort}, Visitor);
  return ast;
}

const Visitor = {
  Alternative: {
    enter: ({node, parent, key}) => {
      // Look for top level flag directives when entering an alternative because after traversing
      // the directive itself, any subsequent flag directives will no longer be at the same level
      const flagDirectives = [];
      for (let i = 0; i < node.elements.length; i++) {
        const el = node.elements[i];
        if (el.type === AstTypes.Directive && el.kind === AstDirectiveKinds.flags) {
          flagDirectives.push(el);
        }
      }
      for (let i = key + 1; i < parent.alternatives.length; i++) {
        const forwardSiblingAlt = parent.alternatives[i];
        forwardSiblingAlt.$flagDirectives ??= [];
        forwardSiblingAlt.$flagDirectives.push(...flagDirectives);
      }
    },
    // Wait until exiting to wrap the alternative's nodes with flag directives from prior sibling
    // alternatives because doing this at the end allows inner nodes to accurately check whether
    // they're at the top level
    exit: ({node, parent}) => {
      if (node.$flagDirectives?.length) {
        const flags = getFlagsFromFlagDirectives(node.$flagDirectives);
        const flagGroup = createGroup({flags});
        flagGroup.parent = parent;
        adoptAndReplaceKids(flagGroup.alternatives[0], node.elements);
        node.elements = [flagGroup];
      }
      delete node.$flagDirectives;
    }
  },

  Assertion({node, parent, ast, key, remove, replaceWith}) {
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
    // Note: Don't need to transform `line_end` and `line_start` because the `Flags` visitor
    // always turns on `multiline` to match Onig's behavior for `^` and `$`
  },

  Backreference(path) {
    // TODO: multiplexing
    // Transform the interaction of subroutines and backref multiplexing when you encounter a backref:
    // - Get all groups of that name/number to the left, and all subroutines to the left, combined together in the order they appear
    // - Create a array for multiplex capture numbers
    // - Iterate over the combined array of capturing groups and subroutines
    // - If a group, add a new number for it to the multiplex array
    // - If a subroutine that references the backreffed capture, replace the multiple number for it
    // - If any other subroutine, traverse its contents to see if it contains a nested copy of the backreffed capture
    //   - If so, replace the multiplex number for the group whose (multi-level) parent the subroutine references
    // But since this is complicated and only important for extreme edge cases (the intersection of backref multiplexing, subroutines, duplicate group names, and those duplicate group names not being directly referenced by subroutines), start by having the transformer do something simpler:
    // - Track the subroutines and capturing groups encountered to the left
    // - When you encounter a backref:
    //   - If there is a subroutine for the same group to the left, only use the most recent capturing group or subroutine's generated group number
    //   - Else, multiplex all the preceding groups of that name
  },

  CapturingGroup(path) {
    // TODO: duplicate names
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

  Directive({node, parent, ast, key, container, replaceWith, removeAllPrevSiblings, removeAllNextSiblings}, state) {
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
      }, state, Visitor);
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

  Pattern({node}) {
    // For `\G` to be accurately convertable to JS flag y, it must be at the start of every
    // top-level alternative and nowhere else. Additional `\G` error checking in the `Assertion`
    // visitor
    let hasAltWithLeadG = false;
    let hasAltWithoutLeadG = false;
    for (const alt of node.alternatives) {
      // Move neighboring `\G` nodes in front of flag directives since flag directives nest all
      // their following siblings into a flag group
      alt.elements.sort((a, b) => {
        if (a.kind === AstDirectiveKinds.flags && b.kind === AstAssertionKinds.search_start) {
          return 1;
        } else if (a.kind === AstAssertionKinds.search_start && b.kind === AstDirectiveKinds.flags) {
          return -1;
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
    throw new Error('Accessor unknown for child container');
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

// Returns a single node, either the given node or all nodes wrapped in a noncapturing group
function parseFragment(pattern) {
  const ast = parse(tokenize(pattern, ''), {optimize: true});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    const group = createGroup();
    adoptAndReplaceKids(group, alts);
    return group;
  }
  const node = alts[0].elements[0];
  return node;
}

export {
  transform,
};
