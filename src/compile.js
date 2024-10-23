import {generate} from './generate.js';
import {parse} from './parse.js';
import {rewrite} from 'regex';
import {recursion} from 'regex-recursion';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {EsVersion, Target} from './utils.js';

/**
@typedef {{
  allowBestEffort?: boolean;
  maxRecursionDepth?: number | null;
  optimize?: boolean;
  target?: keyof Target;
}} CompileOptions
*/
/**
Transpiles a regex pattern and flags from Oniguruma to native JS.
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
  const onigurumaAst = parse(tokenized, {optimize: opts.optimize});
  const regexAst = transform(onigurumaAst, {
    allowBestEffort: opts.allowBestEffort,
    bestEffortTarget: opts.target,
  });
  const generated = generate(regexAst, opts);
  // TODO: When `rewrite` is removed, add flag u or v based on `generated.options`
  const result = rewrite(generated.pattern, {
    ...generated.options,
    flags: generated.flags,
    plugins: [recursion],
  });
  return {
    pattern: result.expression,
    flags: result.flags,
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
    target: Target.ES2024,
    ...options,
  };
}

/**
Transpiles a regex pattern and flags from Oniguruma to a native JS RegExp.
@param {string} pattern Oniguruma regex pattern.
@param {import('./tokenize.js').OnigurumaFlags} [flags] Oniguruma flags. Flag m is equivalent to JS's flag s.
@param {CompileOptions} [options]
@returns {RegExp}
*/
function toRegExp(pattern, flags, options) {
  const result = compile(pattern, flags, options);
  return new RegExp(result.pattern, result.flags);
}

export {
  compile,
  getOptions,
  toRegExp,
};
