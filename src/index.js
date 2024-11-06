import {transform} from './transform.js';
import {generate} from './generate.js';
import {Accuracy, getOptions, Target} from './options.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {atomic, possessive} from 'regex/atomic';
import {recursion} from 'regex-recursion';

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
@typedef {{
  accuracy?: keyof Accuracy;
  flags?: import('./tokenize.js').OnigurumaFlags;
  global?: boolean;
  hasIndices?: boolean;
  maxRecursionDepth?: number | null;
  target?: keyof Target;
  tmGrammar?: boolean;
  verbose?: boolean;
}} CompileOptions
@typedef {CompileOptions & {avoidSubclass?: boolean;}} ToRegExpOptions
*/

/**
Transpiles an Oniguruma pattern to native JS.
@param {string} pattern Oniguruma regex pattern.
@param {CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
}}
*/
function compile(pattern, options) {
  return compileInternal(pattern, options);
}

/**
@param {string} pattern
@param {ToRegExpOptions} [options]
@returns {{
  pattern: string;
  flags: string;
  _internal?: {
    strategy: string;
    subpattern: string | null;
  };
}}
*/
function compileInternal(pattern, options) {
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
  const result = {
    pattern: atomic(possessive(recursion(generated.pattern))),
    flags: `${opts.hasIndices ? 'd' : ''}${opts.global ? 'g' : ''}${generated.flags}${generated.options.disable.v ? 'u' : 'v'}`,
  };
  if (regexAst._strategy) {
    let subpattern = null;
    result.pattern = result.pattern.replace(/\(\?:\\p{sc=<<}\|(.*?)\|\\p{sc=>>}\)/s, (_, sub) => {
      subpattern = sub;
      return '';
    });
    result._internal = {
      strategy: regexAst._strategy.name,
      subpattern,
    };
  }
  return result;
}

/**
Generates an Oniguruma AST from an Oniguruma pattern.
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
Generates a `regex` AST from an Oniguruma pattern.
@param {string} pattern Oniguruma regex pattern.
@param {{
  flags?: import('./tokenize.js').OnigurumaFlags;
}} [options]
@returns {import('./transform.js').RegexAst}
*/
function toRegexAst(pattern, options) {
  return transform(toOnigurumaAst(pattern, options));
}

/**
Transpiles an Oniguruma pattern and returns a native JS RegExp.
@param {string} pattern Oniguruma regex pattern.
@param {ToRegExpOptions} [options]
@returns {RegExp}
*/
function toRegExp(pattern, options) {
  const result = compileInternal(pattern, options);
  if (result._internal) {
    return new WrappedRegExp(result.pattern, result.flags, result._internal);
  }
  return new RegExp(result.pattern, result.flags);
}

class WrappedRegExp extends RegExp {
  #data;
  /**
  @param {string | WrappedRegExp} pattern
  @param {string} [flags]
  @param {string} [data]
  */
  constructor(pattern, flags, data) {
    super(pattern, flags);
    if (data) {
      this.#data = data;
    // The third argument `data` isn't provided when regexes are copied as part of the internal
    // handling of string methods `matchAll` and `split`
    } else if (pattern instanceof WrappedRegExp) {
      // Can read private properties of the existing object since it was created by this class
      this.#data = pattern.#data;
    }
  }
  /**
  Called internally by all String/RegExp methods that use regexes.
  @override
  @param {string} str
  @returns {RegExpExecArray | null}
  */
  exec(str) {
    // Special case handling that requires coupling with changes for the specific strategy in the
    // transformer. These changes add emulation support for some common patterns that are otherwise
    // unsupportable. Only one subclass strategy is supported per pattern
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;
    const exec = RegExp.prototype.exec;

    // ## Support leading `(^|\G)` and similar
    if (this.#data.strategy === 'line_or_search_start' && useLastIndex && this.lastIndex) {
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
    const globalRe = useLastIndex ? this : new RegExp(this, `g${this.flags}`);
    if (this.#data.strategy === 'not_search_start') {
      let match = exec.call(this, str);
      if (match?.index === pos) {
        globalRe.lastIndex = match.index + 1;
        match = exec.call(globalRe, str);
      }
      return match;
    }

    // ## Support leading `(?<=\G|…)` and similar
    // Note: Leading `(?<=\G)` without other alts is supported without the need for a subclass
    if (this.#data.strategy === 'after_search_start_or_subpattern') {
      let match = exec.call(this, str);
      if (!match) {
        return match;
      }
      if (match.index === pos) {
        // Satisfied `\G` in lookbehind
        return match;
      }
      const reBehind = new RegExp(`(?:${this.#data.subpattern})$`);
      while (match) {
        if (reBehind.exec(str.slice(0, match.index))) {
          // Satisfied other alternative in lookbehind; return the main pattern's match
          return match;
        }
        globalRe.lastIndex = match.index + 1;
        match = exec.call(globalRe, str);
      }
      return match;
    }

    return exec.call(this, str);
  }
}

export {
  compile,
  toOnigurumaAst,
  toRegexAst,
  toRegExp,
};
