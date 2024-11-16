import {transform} from './transform.js';
import {generate} from './generate.js';
import {Accuracy, getOptions, Target} from './options.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {atomic, possessive, RegExpSubclass} from 'regex/internals';
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
  flags?: import('./tokenize.js').OnigurumaFlags;
  global?: boolean;
  hasIndices?: boolean;
  maxRecursionDepth?: number | null;
  target?: keyof Target;
  tmGrammar?: boolean;
  verbose?: boolean;
}} Options
@typedef {{
  useEmulationGroups: boolean;
  strategy: string;
}} SubclassOptions
*/

/**
Accepts an Oniguruma pattern and returns the details needed to construct an equivalent JavaScript `RegExp`.
@param {string} pattern Oniguruma regex pattern.
@param {Options} [options]
@returns {{
  pattern: string;
  flags: string;
  subclass?: SubclassOptions;
}}
*/
function toDetails(pattern, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, opts.flags);
  const onigurumaAst = parse(tokenized, {
    skipBackrefValidation: opts.tmGrammar,
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
  flags?: import('./tokenize.js').OnigurumaFlags;
}} [options]
@returns {import('./parse.js').OnigurumaAst}
*/
function toOnigurumaAst(pattern, options) {
  return parse(tokenize(pattern, options?.flags));
}

/**
Accepts an Oniguruma pattern and returns an equivalent JavaScript `RegExp`.
@param {string} pattern Oniguruma regex pattern.
@param {Options} [options]
@returns {RegExp | EmulatedRegExp}
*/
function toRegExp(pattern, options) {
  const result = toDetails(pattern, options);
  if (result.subclass) {
    return new EmulatedRegExp(result.pattern, result.flags, result.subclass);
  }
  return new RegExp(result.pattern, result.flags);
}

/**
Works the same as JavaScript's native `RegExp` constructor in all contexts, but can be given
results from `toDetails` to produce the same result as `toRegExp`.
@class
@augments RegExp
@param {string | EmulatedRegExp} pattern
@param {string} [flags]
@param {SubclassOptions} [options]
*/
class EmulatedRegExp extends RegExpSubclass {
  #strategy;
  constructor(pattern, flags, options) {
    const opts = {
      useEmulationGroups: false,
      strategy: null,
      ...options,
    };
    super(pattern, flags, {useEmulationGroups: opts.useEmulationGroups});
    if (opts.strategy) {
      this.#strategy = opts.strategy;
    // The third argument `options` isn't provided when regexes are copied as part of the internal
    // handling of string methods `matchAll` and `split`
    } else if (pattern instanceof EmulatedRegExp) {
      // Can read private properties of the existing object since it was created by this class
      this.#strategy = pattern.#strategy;
    }
  }
  /**
  Called internally by all String/RegExp methods that use regexes.
  @override
  @param {string} str
  @returns {RegExpExecArray | null}
  */
  exec(str) {
    // Special case handling that requires coupling with pattern changes for the specific strategy
    // in the transformer. These changes add emulation support for some common patterns that are
    // otherwise unsupportable. Only one subclass strategy is supported per pattern
    const exec = super.exec;
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;
    const strategy = this.#strategy;

    // ## Support leading `(^|\G)` and similar
    if (strategy === 'line_or_search_start' && useLastIndex && this.lastIndex) {
      // Reset since testing on a sliced string that we want to match at the start of
      this.lastIndex = 0;
      const match = exec.call(this, str.slice(pos));
      if (match) {
        match.input = str;
        match.index += pos;
        this.lastIndex += pos;
      }
      return match;
    }

    // ## Support leading `(?!\G)` and similar
    if (strategy === 'not_search_start') {
      let match = exec.call(this, str);
      if (match?.index === pos) {
        const globalRe = useLastIndex ? this : new RegExp(this.source, `g${this.flags}`);
        globalRe.lastIndex = match.index + 1;
        match = exec.call(globalRe, str);
      }
      return match;
    }

    return exec.call(this, str);
  }
}

export {
  EmulatedRegExp,
  toDetails,
  toOnigurumaAst,
  toRegExp,
};
