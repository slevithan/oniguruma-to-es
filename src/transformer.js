// TODO: Transform Oniguruma AST to `regex` AST

// Nodes to transform:
// - Assertion (line_end, line_start, search_start, string_end, string_end_newline, string_start, word_boundary)
// - Backreference (multiplexing)
// - CharacterSet (hex, posix, space) - Unlike JS, Onig `\s` matches only ASCII space, tab, LF, CR, VT, and FF
// - CapturingGroup (duplicate names)
// - Directive (flags, keep)
// - Flags (drop `extended`)
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
