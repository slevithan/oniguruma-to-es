# oniguruma-to-es

**This library does not work yet.**

This is an in-development [Oniguruma](https://github.com/kkos/oniguruma) to native JavaScript RegExp transpiler that's lightweight and can run in any JavaScript environment. It gives you the ability to use most of Oniguruma's extended regex syntax/features in JavaScript, and to run regexes written for Oniguruma such as those used in TextMate grammars (used by VS Code, [Shiki](https://shiki.matsu.io/) syntax highlighter, etc.).

Compared to running the actual Oniguruma C library in JavaScript via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)), this library is **much lighter weight** and its regexes **run much faster**.

oniguruma-to-es is *obsessive* about ensuring that the native JS regexes it generates have **exactly the same behavior** as Oniguruma, even in extreme edge cases. Some features can't be perfectly emulated and allow extremely rare differences. If you don't want to allow this, you can disable the `allowBestEffort` option to throw for such patterns. For example, this option enables the use of `\X`, which uses a close approximation of a Unicode extended grapheme cluster.

## ES target

oniguruma-to-es allows a transpilation target of `ES2018`, `ES2024`, or `ESNext`. Patterns that aren't supported when using the given target throw an error.

- `ES2018`: Broadest compatibility; uses JS flag `u`.
  - Unsupported features: Nested character classes, character class intersection, and some POSIX classes.
- `ES2024` (*default*): Uses JS flag `v`.
  - Support: Node.js 20 and 2023-era browsers ([compat table](https://caniuse.com/mdn-javascript_builtins_regexp_unicodesets)).
- `ESNext`: Allows use of ESNext regex features in generated patterns (flag groups and duplicate group names). This preserves duplicate group names across separate alternation paths, allows generating shorter regexes, and improves transpilation performance.
  - Support: Node.js 23 and 2024-era browsers except Safari (which supports duplicate group names but not flag groups).

## Similar projects

[js_regex](https://github.com/jaynetics/js_regex) transpiles [Onigmo](https://github.com/k-takata/Onigmo) regexes to JavaScript (Onigmo is a fork of Oniguruma that has slightly different syntax/behavior). It's written in Ruby and relies on Ruby's Onigmo parser, which means it can only pre-transpile regexes for use in JavaScript. In contrast, oniguruma-to-es is written in JavaScript, so it can be used at runtime. js_regex also produces regexes with more edge cases that don't perfectly follow Oniguruma's behavior, in addition to the Oniguruma/Onigmo differences.
