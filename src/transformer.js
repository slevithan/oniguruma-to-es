import {AstAssertionKinds, AstCharacterSetKinds, AstTypes, createGroup, parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {traverse} from './traverser.js';
import {JsUnicodeProperties, PosixClasses} from './unicode.js';

const r = String.raw;

// Transform (in-place) from an Oniguruma to a `regex` AST
function transform(ast) {
  traverse(ast, visitors);
  return ast;
}

const visitors = {
  [AstTypes.Assertion]: {
    enter(node, context) {
      switch (node.kind) {
        case AstAssertionKinds.search_start:
          // Additional `\G` error checking in the `Pattern` visitor
          if (node.parent.parent !== context.ast.pattern || context.index !== 0) {
            throw new Error(r`Uses "\G" in an unsupported way`);
          }
          context.ast.flags.sticky = true;
          removeNode(node, context); // Will throw if `\G` is quantified
          break;
        case AstAssertionKinds.string_end:
          replaceNodeWithParsed(node, r`(?!\p{Any})`, context);
          break;
        case AstAssertionKinds.string_end_newline:
          replaceNodeWithParsed(node, r`(?=\n?(?!\p{Any}))`, context);
          break;
        case AstAssertionKinds.string_start:
          replaceNodeWithParsed(node, r`(?<!\p{Any})`, context);
          break;
        case AstAssertionKinds.word_boundary: {
          const w = r`[\p{L}\p{N}\p{Pc}]`;
          const b = `(?:(?<=${w})(?!${w})|(?<!${w})(?=${w}))`;
          const B = `(?:(?<=${w})(?=${w})|(?<!${w})(?!${w}))`;
          replaceNodeWithParsed(node, node.negate ? B : b, context);
          break;
        }
        // Note: Don't need to transform `line_end` and `line_start` because the `Flags` visitor
        // always turns on `multiline` to match Onig's behavior for `^` and `$`
      }
    },
  },

  [AstTypes.Backreference]: {
    enter(node) {
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
  },

  [AstTypes.CapturingGroup]: {
    enter(node) {
      // TODO: duplicate names
    },
  },

  [AstTypes.CharacterSet]: {
    enter(node, context) {
      const {kind, negate, value} = node;
      switch (kind) {
        case AstCharacterSetKinds.hex:
          replaceNodeWithParsed(node, negate ? r`\P{AHex}` : r`\p{AHex}`, context);
          break;
        case AstCharacterSetKinds.posix:
          node = replaceNodeWithParsed(node, PosixClasses[value], context);
          node.negate = negate;
          break;
        case AstCharacterSetKinds.property:
          if (!JsUnicodeProperties.has(value)) {
            // Assume it's a script
            node.key = 'sc';
          }
          break;
        case AstCharacterSetKinds.space:
          // Unlike JS, Onig's `\s` matches only ASCII space, tab, LF, VT, FF, and CR
          replaceNodeWithParsed(node, `[${negate ? '^' : ''} \t\n\v\f\r]`, context);
          break;
      }
    },
  },

  [AstTypes.Directive]: {
    enter(node) {
      // TODO: flags, keep
    },
  },

  [AstTypes.Flags]: {
    enter(node) {
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

  [AstTypes.Pattern]: {
    enter(node) {
      let hasWithLeadG = false;
      let hasWithoutLeadG = false;
      // For `\G` to be accurately convertable to JS flag y, it must be at the start of every
      // top-level alternative and nowhere else
      for (const alt of node.alternatives) {
        if (alt.elements[0]?.kind === AstAssertionKinds.search_start) {
          hasWithLeadG = true;
        } else {
          hasWithoutLeadG = true;
        }
        if (hasWithLeadG && hasWithoutLeadG) {
          throw new Error(r`Uses "\G" in an unsupported way`);
        }
      }
    },
  },

  [AstTypes.Subroutine]: {
    enter(node) {
      // TODO
    },
  },

  [AstTypes.VariableLengthCharacterSet]: {
    enter(node) {
      // TODO: newline, grapheme
    },
  },
};

function parseFragment(parent, pattern) {
  const ast = parse(tokenize(pattern, ''), {optimize: true});
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    const group = createGroup(parent);
    group.alternatives = alts;
    alts.parent = group;
    return group;
  }
  const node = alts[0].elements[0];
  node.parent = parent;
  return node;
}

function removeNode(node, {accessor, index}) {
  const container = node.parent[accessor];
  if (!Array.isArray(container)) {
    throw new Error('Array expected as accessor');
  }
  container.splice(index, 1);
}

function replaceNode(node, newNode, {accessor, index}) {
  const container = node.parent[accessor];
  if (Array.isArray(container)) {
    container.splice(index, 1, newNode);
  } else {
    node.parent[accessor] = newNode;
  }
  return newNode;
}

function replaceNodeWithParsed(node, pattern, context) {
  return replaceNode(node, parseFragment(node.parent, pattern), context);
}

export {
  transform,
};
