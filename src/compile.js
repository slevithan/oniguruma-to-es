import {generate} from './generate.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {Accuracy, EsVersion, Target} from './utils.js';
import {atomic, possessive} from 'regex/atomic';
import {recursion} from 'regex-recursion';

/**
@typedef {{
  accuracy?: keyof Accuracy;
  global?: boolean;
  hasIndices?: boolean;
  maxRecursionDepth?: number | null;
  optimize?: boolean;
  target?: keyof Target;
  tmGrammar?: boolean;
}} CompileOptions
@typedef {CompileOptions & {
  avoidSubclass?: boolean;
}} ToRegExpOptions
*/

/**
Transpiles an Oniguruma regex pattern and flags to native JS.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag `m` is equivalent to JS flag `s`.
@param {CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
}}
*/
function compile(pattern, flags, options) {
  return compileInternal(pattern, flags, options);
}

/**
@param {string} pattern
@param {import('./tokenize.js').OnigurumaFlags} [flags]
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
function compileInternal(pattern, flags, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, flags);
  const onigurumaAst = parse(tokenized, {
    optimize: opts.optimize,
    skipBackrefValidation: opts.tmGrammar,
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
Returns a complete set of options, with default values set for options that weren't provided.
@param {CompileOptions} [options]
@returns {Required<ToRegExpOptions>}
*/
function getOptions(options) {
  if (options?.target !== undefined && !EsVersion[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  // Set default values
  return {
    // Sets the level of emulation rigor/strictness
    accuracy: 'default',
    // Prevents use of advanced emulation strategies that rely on returning a `RegExp` subclass,
    // resulting in certain patterns not being emulatable
    avoidSubclass: false,
    // Include JS flag `g` in the result
    global: false,
    // Include JS flag `d` in the result
    hasIndices: false,
    // Specifies the recursion depth limit. Supported values are integers `2` to `100` and `null`.
    // If `null`, any use of recursion results in an error
    maxRecursionDepth: 6,
    // Simplify the generated pattern when it doesn't change the meaning
    optimize: true,
    // Sets the JavaScript language version for generated patterns and flags. Later targets allow
    // faster processing, simpler generated source, and support for additional features
    target: 'ES2024',
    // Leave disabled unless the regex will be used in a TextMate grammar processor that merges
    // backreferences across `begin` and `end` patterns
    tmGrammar: false,
    ...options,
  };
}

export {
  compile,
  compileInternal,
  getOptions,
};
