# oniguruma-to-es

**This library does not work yet.**

This is an in-development [Oniguruma](https://github.com/kkos/oniguruma) to native JavaScript RegExp transpiler that is lightweight and can run in any JavaScript environment. It gives you the ability to use most of Oniguruma's extended regex syntax/features in JavaScript, and to run regexes written for Oniguruma such as regexes used in TextMate grammars (used by VS Code, etc.). It is **much** faster and **much** lighter weight than running the actual Oniguruma C library in JavaScript via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)).

## Compatibility

oniguruma-to-es allows a transpilation target of ES2018, ES2024, or ESNext.

- Using ES2024 or later as the target relies on JavaScript's regex `v` flag (`unicodeSets`), which is supported by Node.js 20 and all major 2023-era browsers ([compat table](https://caniuse.com/mdn-javascript_builtins_regexp_unicodesets)).
- ESNext allows the output to use flag modifier groups and duplicate capturing group names that are unique per alternation path. These features are not yet supported in Node.js as of 22.9, but are supported in the latest versions of most browsers (the exception being that Safari doesn't yet support flag modifier groups).

## Similar projects

[jaynetics/js_regex](https://github.com/jaynetics/js_regex) transpiles [Onigmo](https://github.com/k-takata/Onigmo) regexes to JavaScript (Onigmo is a fork of Oniguruma that has slightly different syntax/behavior). It's written in Ruby and relies on Ruby's Onigmo parser, which means it can only pre-transpile regexes for use in JavaScript. In contrast, oniguruma-to-es runs fully in JavaScript, so it can be used at runtime.
