// TODO: Create me


// TODO: Also check for extra Unicode properties like `\p{Blank}`
// TODO: Unlike JS, Onig `\s` matches only ASCII space, tab, LF, CR, VT, and FF
// const keyless = JsKeylessUnicodePropertiesMap.has(property);
// // If not identified as a JS binary property or general category, assume it's a script
// const key = keyless ? property : 'sc';
// const value = keyless ? null : property;


// // Unicode case folding is complicated, and this doesn't support all aspects of it.
// // - Ex: Doesn't derive/add titlecase versions of chars like Serbo-Croatian 'ǅ'.
// // - Ex: Doesn't handle language-specific edge cases like Turkish İ. In JS, both
// //   `/i/iv.test('İ')` and `/İ/iv.test('i')` return `false`, although lowercase `İ` is `i`.
// const lower = char.toLowerCase();
// const upper = char.toUpperCase();


// In the generator, do the heavy lifting for the interaction of subroutines and backref multiplexing when you encounter a backref:
// - Get all groups of that name/number to the left, and all subroutines to the left, combined together in the order they appear
// - Create a array for multiplex capture numbers
// - Iterate over the combined array of capturing groups and subroutines
// - If a group, add a new number for it to the multiplex array
// - If a subroutine that references the backreffed capture, replace the multiple number for it
// - If any other subroutine, traverse its contents to see if it contains a nested copy of the backreffed capture
//   - If so, replace the multiplex number for the group whose (multi-level) parent the subroutine references
// But since this is complicated and only important for extreme edge cases (the intersection of backref multiplexing, subroutines, duplicate group names, and those duplicate group names not being directly referenced by subroutines), start by having the generator do something simpler:
// - Track the subroutines and capturing groups encountered to the left
// - When you encounter a backref:
//   - If there is a subroutine for the same group to the left, only use the most recent capturing group or subroutine's generated group number
//   - Else, multiplex all the preceding groups of that name
