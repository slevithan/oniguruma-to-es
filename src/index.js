import {transform} from './transform.js';
import {compile, toRegExp} from './compile.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';

// The transformation and error checking for Oniguruma's unique syntax and behavior differences
// compared to native JS RegExp is layered into all steps of the compilation process:
// 1. Tokenizer: Understands Oniguruma syntax (many large and small differences from JS).
// 2. Parser: Builds an Oniguruma AST from the tokens with understanding of Oniguruma differences.
// 3. Transformer: Converts the Oniguruma AST to a `regex` AST that preserves all Oniguruma
//    behavior. This is true even in cases of non-JS features that are supported by both `regex`
//    and Oniguruma but with subtly different behavior (subroutines, flag x).
// 4. Generator: Converts the `regex` AST to a `regex` pattern.
// 5. `regex`: Components of the `regex` libray are used to transpile several remaining features
//    that aren't native to JS RegExp (atomic groups, possessive quantifiers, recursion). `regex`
//    uses a strict superset of JS RegExp syntax, so using it this way allows this library to
//    benefit from not reinventing the wheel for features that `regex` already knows how to
//    transpile to JS.

/**
Generates an Oniguruma AST from an Oniguruma pattern and flags.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag m is equivalent to JS's flag s.
@returns {import('./parse.js').OnigurumaAst}
*/
function toOnigurumaAst(pattern, flags) {
  return parse(tokenize(pattern, flags));
}

/**
Generates a `regex` AST from an Oniguruma pattern and flags.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag m is equivalent to JS's flag s.
@returns {import('./transform.js').RegexAst}
*/
function toRegexAst(pattern, flags) {
  return transform(toOnigurumaAst(pattern, flags));
}

export {
  compile,
  toOnigurumaAst,
  toRegexAst,
  toRegExp,
};
