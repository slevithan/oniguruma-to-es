// TODO

// The `regex` AST assumes a target of ESNext, so e.g. `Group` flags with target ES2024 should be handled by the generator

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

// Special case for `\p{Any}` to `[^]` since the former is used when parsing fragments in the
// transformer (since the parser follows Onig rules and doesn't allow empty char classes)

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
