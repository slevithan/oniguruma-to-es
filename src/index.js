import {transform} from './transform.js';
import {generate} from './generate.js';
import {Accuracy, getOptions, Target} from './options.js';
import {parse} from './parse.js';
import {EmulatedRegExp} from './subclass.js';
import {tokenize} from './tokenize.js';
import {atomic, possessive} from 'regex/internals';
import {recursion} from 'regex-recursion';

// The transformation and error checking for Oniguruma's unique syntax and behavior differences
// compared to native JS RegExp is layered into all steps of the compilation process:
// 1. Tokenizer: Understands Oniguruma syntax, with many large and small differences from JS.
// 2. Parser: Builds an Oniguruma AST from the tokens with understanding of Oniguruma differences.
// 3. Transformer: Converts the Oniguruma AST to a Regex+ AST that preserves all Oniguruma
//    behavior. This is true even in cases of non-native-JS features that are supported by both
//    Regex+ and Oniguruma but with subtly different behavior in each (subroutines, flag x).
// 4. Generator: Converts the Regex+ AST to a Regex+ pattern, flags, and options.
// 5. Compiler: Components of the Regex+ libray are used to transpile several remaining features
//    that aren't native to JS (atomic groups, possessive quantifiers, recursion). Regex+ uses a
//    strict superset of JS RegExp syntax, so using it allows this library to benefit from not
//    reinventing the wheel for complex features that Regex+ already knows how to transpile to JS.

/**
@typedef {{
  accuracy?: keyof Accuracy;
  avoidSubclass?: boolean;
  flags?: string;
  global?: boolean;
  hasIndices?: boolean;
  maxRecursionDepth?: number | null;
  overrides?: {
    allowOrphanBackrefs?: boolean;
  };
  target?: keyof Target;
  verbose?: boolean;
}} OnigurumaToEsOptions
*/

/**
Accepts an Oniguruma pattern and returns the details needed to construct an equivalent JavaScript `RegExp`.
@param {string} pattern Oniguruma regex pattern.
@param {OnigurumaToEsOptions} [options]
@returns {{
  pattern: string;
  flags: string;
  subclass?: import('./subclass.js').EmulatedRegExpOptions;
}}
*/
function toDetails(pattern, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, opts.flags);
  const onigurumaAst = parse(tokenized, {
    skipBackrefValidation: opts.overrides.allowOrphanBackrefs,
    verbose: opts.verbose,
  });
  const regexAst = transform(onigurumaAst, {
    accuracy: opts.accuracy,
    avoidSubclass: opts.avoidSubclass,
    bestEffortTarget: opts.target,
  });
  const generated = generate(regexAst, opts);
  pattern = possessive(recursion(generated.pattern));
  const atomized = atomic(pattern, {useEmulationGroups: !opts.avoidSubclass});
  const useEmulationGroups = atomized !== pattern && !opts.avoidSubclass;
  pattern = atomized;
  const result = {
    pattern,
    flags: `${opts.hasIndices ? 'd' : ''}${opts.global ? 'g' : ''}${generated.flags}${generated.options.disable.v ? 'u' : 'v'}`,
  };
  if (useEmulationGroups || regexAst._strategy) {
    result.subclass = {
      useEmulationGroups,
      strategy: regexAst._strategy ?? null,
    };
  }
  return result;
}

/**
Returns an Oniguruma AST generated from an Oniguruma pattern.
@param {string} pattern Oniguruma regex pattern.
@param {{
  flags?: string;
}} [options]
@returns {import('./parse.js').OnigurumaAst}
*/
function toOnigurumaAst(pattern, options) {
  return parse(tokenize(pattern, options?.flags));
}

/**
Accepts an Oniguruma pattern and returns an equivalent JavaScript `RegExp`.
@param {string} pattern Oniguruma regex pattern.
@param {OnigurumaToEsOptions} [options]
@returns {RegExp | EmulatedRegExp}
*/
function toRegExp(pattern, options) {
  const result = toDetails(pattern, options);
  if (result.subclass) {
    return new EmulatedRegExp(result.pattern, result.flags, result.subclass);
  }
  return new RegExp(result.pattern, result.flags);
}

export {
  EmulatedRegExp,
  toDetails,
  toOnigurumaAst,
  toRegExp,
};
