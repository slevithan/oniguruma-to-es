import {AstTypes} from './parser.js';
import {traverse} from './traverser.js';

// TODO: Remaining nodes to transform:
// - Assertion (line_end, line_start, search_start, string_end, string_end_newline, string_start, word_boundary)
// - Backreference (multiplexing)
// - CharacterSet (hex, posix, property, space)
//   - For property, add key
//   - Unlike JS, Onig `\s` matches only ASCII space, tab, LF, CR, VT, and FF
// - CapturingGroup (duplicate names)
// - Directive (flags, keep)
// - Subroutine
// - VariableLengthCharacterSet (newline, grapheme)
// The `regex` AST should assume a target of ESNext (so e.g. Group flags with target ES2024 should be handled by the generator)

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

const visitors = {

  [AstTypes.Flags]: {
    enter(node) {
      // Onig's flag x (`extended`) isn't available in JS
      // Note: Flag x is fully handled during tokenization (and flag x modifiers are stripped)
      delete node.extended;
      Object.assign(node, {
        global: false, // JS flag g; no Onig equiv
        hasIndices: false, // JS flag d; no Onig equiv
        multiline: true, // JS flag m; no Onig equiv but its behavior is always on
        sticky: false, // JS flag y; no Onig equiv
        // Note: `regex` doesn't allow explicitly adding flags it handles implicitly, so leave out
        // properties `unicode` (JS flag u) and `unicodeSets` (JS flag v). Keep the existing values
        // for `ignoreCase` (flag i) and `dotAll` (JS flag s, but Onig flag m)
      });
      node.parent.options = {
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
  },

};

// Transform in-place an Oniguruma AST to a `regex` AST
function transform(ast) {
  traverse(ast, visitors);
  return ast;
}

export {
  transform,
};
