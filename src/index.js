import {transform} from './transform.js';
import {compile} from './compile.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';

// The transformation and error checking for Oniguruma's unique syntax and behavior differences
// compared to native JS RegExp is layered into all steps of the compilation process:
// 1. Tokenizer: Understands Oniguruma syntax, with many large and small differences from JS.
// 2. Parser: Builds an Oniguruma AST from the tokens with understanding of Oniguruma differences.
// 3. Transformer: Converts the Oniguruma AST to a `regex` AST that preserves all Oniguruma
//    behavior. This is true even in cases of non-native-JS features that are supported by both
//    `regex` and Oniguruma but with subtly different behavior in each (subroutines, flag x).
// 4. Generator: Converts the `regex` AST to a `regex` pattern, flags, and options.
// 5. Compiler: Components of the `regex` libray are used to transpile several remaining features
//    that aren't native to JS (atomic groups, possessive quantifiers, recursion). `regex` uses a
//    strict superset of JS RegExp syntax, so using it allows this library to benefit from not
//    reinventing the wheel for complex features that `regex` already knows how to transpile to JS.

/**
Generates an Oniguruma AST from an Oniguruma pattern and flags.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag `m` is equivalent to JS's flag `s`.
@returns {import('./parse.js').OnigurumaAst}
*/
function toOnigurumaAst(pattern, flags) {
  return parse(tokenize(pattern, flags));
}

/**
Generates a `regex` AST from an Oniguruma pattern and flags.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag `m` is equivalent to JS's flag `s`.
@returns {import('./transform.js').RegexAst}
*/
function toRegexAst(pattern, flags) {
  return transform(toOnigurumaAst(pattern, flags));
}

/**
Transpiles an Oniguruma regex pattern and flags and returns a native JS RegExp.
@param {string} pattern Oniguruma regex pattern.
@param {string} [flags] Any combination of Oniguruma flags `imx` and JS flags `dg`. Flag `m` is
  equivalent to JS's flag `s`.
@param {import('./compile.js').CompileOptions} [options]
@returns {RegExp}
*/
function toRegExp(pattern, flags = '', options) {
  const allowedJsFlags = flags.replace(/[^dg]+/g, '');
  flags = flags.replace(/[dg]+/g, '');
  const result = compile(pattern, flags, options);
  return new RegExp(result.pattern, `${allowedJsFlags}${result.flags}`);
}

export {
  compile,
  toOnigurumaAst,
  toRegexAst,
  toRegExp,
};
