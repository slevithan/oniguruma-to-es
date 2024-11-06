import {generate} from './generate.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {EmulationMode, EsVersion, Target} from './utils.js';
import {atomic, possessive} from 'regex/atomic';
import {recursion} from 'regex-recursion';

/**
@typedef {{
  emulation?: keyof EmulationMode;
  global?: boolean;
  hasIndices?: boolean;
  maxRecursionDepth?: number | null;
  optimize?: boolean;
  target?: keyof Target;
  tmGrammar?: boolean;
}} CompileOptions
@typedef {CompileOptions & {
  allowSubclassBasedEmulation?: boolean;
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
    allowSubclassBasedEmulation: opts.allowSubclassBasedEmulation,
    emulation: opts.emulation,
    bestEffortTarget: opts.target,
  });
  const generated = generate(regexAst, opts);
  const result = {
    pattern: atomic(possessive(recursion(generated.pattern))),
    flags: `${opts.hasIndices ? 'd' : ''}${opts.global ? 'g' : ''}${generated.flags}${generated.options.disable.v ? 'u' : 'v'}`,
  };
  if (regexAst._strategy) {
    let emulationSubpattern = null;
    result.pattern = result.pattern.replace(/\(\?:\\p{sc=<<}\|(.*?)\|\\p{sc=>>}\)/s, (_, sub) => {
      emulationSubpattern = sub;
      return '';
    });
    result._internal = {
      strategy: regexAst._strategy.name,
      subpattern: emulationSubpattern,
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
    // Allows advanced emulation strategies that rely on returning a `RegExp` subclass with an
    // overridden `exec` method. A subclass is only used if needed for the given pattern
    allowSubclassBasedEmulation: false,
    // Sets the level of emulation strictness; `default` is best in most cases. If `strict`, throws
    // if the pattern can't be emulated with identical behavior (even in rare edge cases) for the
    // given target
    emulation: 'default',
    // Include JS flag `g` in the result
    global: false,
    // Include JS flag `d` in the result
    hasIndices: false,
    // If an integer between `2` and `100`, common recursion forms are supported and recurse up to
    // the specified depth limit. If set to `null`, any use of recursion results in an error
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
