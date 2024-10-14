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
