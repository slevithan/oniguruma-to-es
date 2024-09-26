# oniguruma-to-es

This is an in-development [Oniguruma](https://github.com/kkos/oniguruma) to native JavaScript RegExp transpiler. It gives you the ability to use most of Oniguruma's extended regex syntax/features in JavaScript, or to run regexes written for Oniguruma like those in TextMate grammars (used by VS Code, etc.). It is **much** faster and **much** lighter weight than running the actual Oniguruma C library in the browser via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)).

**This library does not work yet.**
