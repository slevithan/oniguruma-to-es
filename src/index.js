import {transform} from './transformer.js';
import {compile, toRegExp} from './compiler.js';
import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';

// Handling and error checking for Oniguruma's unique syntax and behavior differences is layered
// into all steps of the compilation process:
// 1. Tokenizer: Understands Oniguruma syntax (many differences from JS).
// 2. Parser: Builds an Oniguruma AST from the tokens.
// 3. Transformer: Converts the Oniguruma AST to a `regex` AST.
// 4. Generator: Converts the `regex` AST to a `regex` pattern.
// 5. `regex`: Components of the `regex` libray are used to transpile several remaining features
//    that work identically (atomic groups, possessive quantifiers, recursion) into a native JS
//    RegExp pattern. `regex` uses a strict superset of JS regex syntax, so using it this way
//    allows this library to benefit from not reinventing the wheel for advanced features that
//    `regex` already knows how to transpile to JS.

function toOnigurumaAst(pattern, flags) {
  return parse(tokenize(pattern, flags), {optimize: true});
}

function toRegexAst(pattern, flags) {
  return transform(parse(tokenize(pattern, flags), {optimize: true}));
}

export {
  compile,
  toOnigurumaAst,
  toRegexAst,
  toRegExp,
};
