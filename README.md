# Oniguruma-To-ES

**This library does not work yet.**

This is an in-development **[Oniguruma](https://github.com/kkos/oniguruma) to JavaScript RegExp transpiler** that runs in any JavaScript environment. It gives you the ability to:

- Use most of Oniguruma's extended regex syntax and behavior in JavaScript.
- Run regexes intended for Oniguruma in JavaScript, such as those used in TextMate grammars (used by VS Code, [Shiki](https://shiki.matsu.io/) syntax highlighter, etc.).

Compared to running the actual Oniguruma C library in JavaScript via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)), this library is **much lighter weight** and its regexes **run much faster**.

Oniguruma-To-ES is *obsessive* about ensuring the emulated features it supports have **exactly the same behavior** as Oniguruma, even in extreme edge cases. A few uncommon features can't be perfectly emulated and allow rare differences, but if you don't want to allow this, you can disable the `allowBestEffort` option to throw for such patterns (more details below).

## Options

### `allowBestEffort`

Allows results that differ from Oniguruma in rare cases. If `false`, throws if the pattern can't be emulated with identical behavior for the given `target`.

Specifically, this option enables the following additional features, depending on `target`:

- All targets (`ESNext` and earlier):
  - `\X`: Uses a close approximation of a Unicode extended grapheme cluster.
  - Recursion via `\g<0>` and `\g<name>`: Uses a depth limit, specified via option `maxRecursionDepth`.
- `ES2024` and earlier:
  - Case-insensitive backreferences to case-sensitive groups.
- `ES2018`:
  - POSIX classes `[[:graph:]]` and `[[:print:]]`: Use approximations.

*Default: `true`.*

### `maxRecursionDepth`

If `null`, any use of recursion throws. If an integer between `2` and `100` (and `allowBestEffort` is on), common recursion forms are supported and recurse up to the specified max depth.

*Default: `6`.*

### `target`

Sets the JavaScript language version for generated patterns and flags. Later targets allow faster processing, simpler generated source, and support for additional features.

- `ES2018`: Uses JS flag `u`.
  - Emulation restrictions: Character class intersection and nested negated classes are unsupported. These restrictions avoid the need for heavyweight Unicode character data.
  - Minimum requirement for any generated regex is Node.js 6 or a 2016-era browser, but regexes might use ES2018 features that require Node.js 10 or a browser version released during 2018 to 2023 (in Safari's case).
- `ES2024`: Uses JS flag `v`.
  - No emulation restrictions.
  - Generated regexes require Node.js 20 or a 2023-era browser ([compat table](https://caniuse.com/mdn-javascript_builtins_regexp_unicodesets)).
- `ESNext`: Allows use of ESNext regex features (flag groups and duplicate group names).
  - Benefits: Faster transpilation, simpler generated source, and duplicate group names are preserved across separate alternation paths.
  - Generated regexes might require Node.js 23 or a 2024-era browser (except Safari, which lacks support).

*Default: `'ES2024'`.*

## Similar projects

[js_regex](https://github.com/jaynetics/js_regex) transpiles [Onigmo](https://github.com/k-takata/Onigmo) regexes to JavaScript (Onigmo is a fork of Oniguruma that has slightly different syntax/behavior). js_regex is written in Ruby and relies on Ruby's Onigmo parser, which means regexes must be pre-transpiled to use them in JavaScript. In contrast, Oniguruma-To-ES is written in JavaScript, so it can be used at runtime. js_regex also produces regexes with more edge cases that don't perfectly follow Oniguruma's behavior, in addition to the Oniguruma/Onigmo differences.
