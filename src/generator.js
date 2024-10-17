import {AstTypes} from './parser.js';
import {Target} from './utils.js';

/**
@typedef {import('./compiler.js').Options} Options
*/

/**
Returns a complete set of options, with default values set for options that weren't provided.
@param {Options} options
@returns {Required<Options>}
*/
function getOptions(options) {
  return {
    allowBestEffort: true,
    maxRecursionDepth: null,
    target: Target.ESNext,
    ...options,
  };
}

// Generate a `regex` pattern, flags, and options from a `regex` AST
function generate(node, options) {
  const opts = getOptions(options);
  switch (node.type) {
    case AstTypes.Regex:
      return {
        pattern: generate(node.pattern),
        flags: generate(node.flags),
        options: node.options,
      };
    case AstTypes.Alternative:
      return node.elements.map(generate).join('');
    case AstTypes.Assertion:
      return ''; // TODO
    case AstTypes.Backreference:
      // Transformed backrefs always use digits. Following literal digits need to be escaped or
      // delimited to avoid changing the meaning of the backref
      return '\\' + node.ref;
    case AstTypes.CapturingGroup:
      return ''; // TODO
    case AstTypes.Character:
      // TODO
      return String.fromCodePoint(node.value);
    case AstTypes.CharacterClass:
      return ''; // TODO
    case AstTypes.CharacterClassIntersection:
      return ''; // TODO
    case AstTypes.CharacterClassRange:
      return ''; // TODO
    case AstTypes.CharacterSet:
      // TODO: Special case for `\p{Any}` to `[^]` since the former is used when parsing fragments
      // in the transformer since the parser follows Onig rules and doesn't allow empty char classes
      return ''; // TODO
    case AstTypes.Flags:
      // `regex` doesn't accept implicit flags nuvx, but allows control via other options
      return flagIf(node.hasIndices, 'd') +
        flagIf(node.global, 'g') +
        flagIf(node.ignoreCase, 'i') +
        flagIf(node.multiline, 'm') +
        flagIf(node.dotAll, 's') +
        flagIf(node.sticky, 'y');
    case AstTypes.Group:
      // TODO: Use target ESNext to enable flag groups
      return ''; // TODO
    case AstTypes.Pattern:
      return node.alternatives.map(generate).join('|');
    case AstTypes.Quantifier:
      return ''; // TODO
    case AstTypes.Recursion:
      return ''; // TODO
    case AstTypes.VariableLengthCharacterSet:
      return ''; // TODO
    default:
      throw new Error(`Unexpected node type "${node.type}"`);
    // Node types `Directive` and `Subroutine` are never included in output from the transformer.
    // Technically, `VariableLengthCharacterSet` shouldn't be either, but its `kind: 'grapheme'` is
    // transformed here to enable use of the `allowBestEffort` and `target` options
  }
}

function flagIf(isOn, flag) {
  return isOn ? flag : '';
}

// const keyless = JsUnicodePropertiesMap.has(property);
// // If not identified as a JS binary property or general category, assume it's a script
// const key = keyless ? property : 'sc';
// const value = keyless ? null : property;

// // Unicode case folding is complicated, and this doesn't support all aspects of it.
// // - Ex: Doesn't derive/add titlecase versions of chars like Serbo-Croatian 'ǅ'.
// // - Ex: Doesn't handle language-specific edge cases like Turkish İ. In JS, both
// //   `/i/iv.test('İ')` and `/İ/iv.test('i')` return `false`, although lowercase `İ` is `i`.
// const lower = char.toLowerCase();
// const upper = char.toUpperCase();
// function charHasCase(char) {
//   return /^\p{Cased}$/u.test(char);
// }



// VariableLengthCharacterSet({node, replaceWith}, {allowBestEffort, target}) {
//   const {kind} = node;
//   if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
//     if (!allowBestEffort) {
//       throw new Error(r`"\X" unsupported when allowBestEffort disabled`);
//     }
//     // Close approximation of an extended grapheme cluster. Full details of what should be
//     // matched are in Unicode Standard Annex #29 <https://unicode.org/reports/tr29/>
//     // TODO: Consider using <https://github.com/slevithan/emoji-regex-xs> for pre-ES2024
//     const emojiAlt = hasMinTarget(target, Target.ES2024) ? r`\p{RGI_Emoji}|` : '';
//     replaceWith(parseFragment(r`(?>${emojiAlt}\r\n|\P{M}\p{M}*)`));
//   }
// }

export {
  generate,
  getOptions,
};
