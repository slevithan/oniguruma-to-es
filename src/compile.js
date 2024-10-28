import {generate} from './generate.js';
import {parse} from './parse.js';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {EsVersion, Target} from './utils.js';
import {atomic, possessive} from 'regex/atomic';
import {recursion} from 'regex-recursion';

/**
@typedef {{
  allowBestEffort?: boolean;
  maxRecursionDepth?: number | null;
  optimize?: boolean;
  target?: keyof Target;
}} CompileOptions
*/
/**
Transpiles an Oniguruma regex pattern and flags to native JS.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag m is equivalent to JS's flag s.
@param {CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
}}
*/
function compile(pattern, flags, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, flags);
  const onigurumaAst = parse(tokenized, {
    optimize: opts.optimize,
  });
  const regexAst = transform(onigurumaAst, {
    allowBestEffort: opts.allowBestEffort,
    bestEffortTarget: opts.target,
  });
  const generated = generate(regexAst, opts);
  return {
    pattern: atomic(possessive(recursion(generated.pattern))),
    flags: `${generated.flags}${generated.options.disable.v ? 'u' : 'v'}`,
  };
}

/**
Returns a complete set of options, with default values set for options that weren't provided.
@param {CompileOptions} [options]
@returns {Required<CompileOptions>}
*/
function getOptions(options) {
  if (options?.target !== undefined && !EsVersion[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  // Set default values
  return {
    // Allows results that differ from Oniguruma in rare cases. If `false`, throws if the pattern
    // can't be emulated with identical behavior.
    allowBestEffort: true,
    // If `null`, any use of recursion throws. If an integer between `2` and `100` (and
    // `allowBestEffort` is on), common recursion forms are supported and recurse up to the
    // specified max depth.
    maxRecursionDepth: 6,
    // Simplify the generated pattern when it doesn't change the meaning.
    optimize: true,
    // Sets the JavaScript language version for generated patterns and flags. Later targets allow
    // faster processing, simpler generated source, and support for additional Oniguruma features.
    target: 'ES2024',
    ...options,
  };
}

export {
  compile,
  getOptions,
};
