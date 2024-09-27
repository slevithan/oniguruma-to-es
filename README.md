# oniguruma-to-es

**This library does not work yet.**

This is an in-development [Oniguruma](https://github.com/kkos/oniguruma) to native JavaScript RegExp transpiler that is lightweight and can run in browsers or any JavaScript environment. It gives you the ability to use most of Oniguruma's extended regex syntax/features in JavaScript, and to run regexes written for Oniguruma such as regexes used in TextMate grammars (used by VS Code, etc.). It is **much** faster and **much** lighter weight than running the actual Oniguruma C library in JavaScript via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)).

## Compatibility

oniguruma-to-es relies on JavaScript's regex `v` (`unicodeSets`) flag, which is supported by Node.js 20 and all major 2023-era browsers ([compat table](https://caniuse.com/mdn-javascript_builtins_regexp_unicodesets)).

## Similar projects

[jaynetics/js_regex](https://github.com/jaynetics/js_regex) transpiles Onigmo regexes to JavaScript, but it is written in Ruby and relies on Ruby's built-in Onigmo syntax parser. Thus it can only pre-transpile regexes. (Onigmo is a fork of Oniguruma that's used by Ruby.) In contrast, oniguruma-to-es's transpilation runs fully in JavaScript, so it can be used at runtime.
