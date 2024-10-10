import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, createGroup, createLookaround, createUnicodeProperty, parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {traverse} from './traverser.js';
import {JsUnicodeProperties, PosixClasses} from './unicode.js';
import {r} from './utils.js';

// Transform an Oniguruma AST in-place to a `regex` AST
function transform(ast) {
  traverse(ast, {
    Assertion({node, parent, ast, key, remove, replaceWith}) {
      switch (node.kind) {
        case AstAssertionKinds.search_start:
          // Allows multiple leading `\G`s since the the node is removed. Additional `\G` error
          // checking in the `Pattern` visitor
          if (parent.parent !== ast.pattern || key !== 0) {
            throw new Error(r`Uses "\G" in an unsupported way`);
          }
          ast.flags.sticky = true;
          remove();
          break;
        case AstAssertionKinds.string_end:
          replaceWith(parseFragment(r`(?!\p{Any})`));
          break;
        case AstAssertionKinds.string_end_newline:
          replaceWith(parseFragment(r`(?=\n?(?!\p{Any}))`));
          break;
        case AstAssertionKinds.string_start:
          replaceWith(parseFragment(r`(?<!\p{Any})`));
          break;
        case AstAssertionKinds.word_boundary: {
          // Not the same definition as Onig's `\w`
          const wordChar = r`[\p{L}\p{N}\p{Pc}]`;
          const b = `(?:(?<=${wordChar})(?!${wordChar})|(?<!${wordChar})(?=${wordChar}))`;
          const B = `(?:(?<=${wordChar})(?=${wordChar})|(?<!${wordChar})(?!${wordChar}))`;
          replaceWith(parseFragment(node.negate ? B : b));
          break;
        }
        // Note: Don't need to transform `line_end` and `line_start` because the `Flags` visitor
        // always turns on `multiline` to match Onig's behavior for `^` and `$`
      }
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
      switch (kind) {
        case AstCharacterSetKinds.hex:
          replaceWith(createUnicodeProperty('AHex', {negate}));
          break;
        case AstCharacterSetKinds.posix: {
          const negateableNode = parseFragment(PosixClasses[value]);
          negateableNode.negate = negate;
          replaceWith(negateableNode);
          break;
        }
        case AstCharacterSetKinds.property:
          if (!JsUnicodeProperties.has(value)) {
            // Assume it's a script
            node.key = 'sc';
          }
          break;
        case AstCharacterSetKinds.space: {
          // Unlike JS, Onig's `\s` matches only ASCII space, tab, LF, VT, FF, and CR
          const s = parseFragment('[ \t\n\v\f\r]');
          s.negate = negate;
          replaceWith(s);
          break;
        }
      }
    },

    Directive({node, parent, ast, key, container, remove, removePrevSiblings, insertBefore}) {
      // TODO: Support `flags` directive

      if (node.kind === AstDirectiveKinds.keep) {
        // Allows multiple `\K`s since the the node is removed
        if (parent.parent !== ast.pattern || ast.pattern.alternatives.length > 1) {
          // `\K` is emulatable at least within top-level alternation, but it's tricky.
          // Ex: `ab\Kc|a` is equivalent to `(?<=ab)c|a(?!bc)`, not simply `(?<=ab)c|a`
          throw new Error(r`Uses "\K" in an unsupported way`);
        }
        const lb = createLookaround({behind: true});
        const lbAlt = lb.alternatives[0];
        const kept = container.slice(0, key);
        lbAlt.elements = kept;
        adopt(lbAlt, kept);
        removePrevSiblings();
        insertBefore(lb);
        remove();
      }
    },

    Flags({node, parent}) {
      // Onig's flag x (`extended`) isn't available in JS
      // Note: Flag x is fully handled during tokenization (and flag x modifiers are stripped)
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
      let hasAltWithLeadG = false;
      let hasAltWithoutLeadG = false;
      // For `\G` to be accurately convertable to JS flag y, it must be at the start of every
      // top-level alternative and nowhere else. Additional `\G` error checking in the `Assertion`
      // visitor
      for (const alt of node.alternatives) {
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

    VariableLengthCharacterSet(path) {
      // TODO: newline, grapheme
    },
  });
  return ast;
}

// Returns a single node, either the given node or all nodes wrapped in a noncapturing group
function parseFragment(pattern) {
  const ast = parse(tokenize(pattern, ''), {optimize: true});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    const group = createGroup();
    group.alternatives = alts;
    adopt(group, alts);
    return group;
  }
  const node = alts[0].elements[0];
  return node;
}

function adopt(parent, kids) {
  kids.forEach(kid => kid.parent = parent);
}

export {
  transform,
};
