import {generate} from './generate.js';
import {parse} from './parse.js';
import {rewrite} from 'regex';
import {recursion} from 'regex-recursion';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {Target, TargetNum} from './utils.js';

/**
@typedef {'i' | ''} FlagI
@typedef {'m' | ''} FlagM
@typedef {'x' | ''} FlagX
@typedef {`${FlagI}${FlagM}${FlagX}` | `${FlagI}${FlagX}${FlagM}` | `${FlagM}${FlagI}${FlagX}` | `${FlagM}${FlagX}${FlagI}` | `${FlagX}${FlagI}${FlagM}` | `${FlagX}${FlagM}${FlagI}`} OnigurumaFlags
@typedef {{
  allowBestEffort?: boolean;
  maxRecursionDepth?: number | null;
  target?: keyof Target;
}} CompileOptions
*/
/**
Transpiles a regex pattern and flags from Oniguruma to native JS.
@param {string} pattern Oniguruma regex pattern.
@param {OnigurumaFlags} [flags] Oniguruma flags i, m, x. Flag m is equivalent to JS's flag s.
@param {CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
}}
*/
function compile(pattern, flags, options) {
  const opts = getOptions(options);
  const tokenized = tokenize(pattern, flags);
  const onigurumaAst = parse(tokenized, {optimize: true});
  const regexAst = transform(onigurumaAst);
  const generated = generate(regexAst, opts);
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
  if (options?.target !== undefined && !TargetNum[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  return {
    // Allows results that differ from Oniguruma in extreme edge cases. If `false`, throws if the
    // pattern can't be converted with identical behavior. Ex: Enables the use of `\X`, which uses
    // a close approximation of a Unicode extended grapheme cluster.
    allowBestEffort: true,
    // If `null`, any use of recursion (ex: `a\g<0>?b` or `(?<r>a\g<r>?b)`) throws. If an integer
    // from 2-100 is provided, common forms of recursive patterns are supported and recurse up to
    // the specified max depth.
    maxRecursionDepth: 5,
    // JS version for the generated regex pattern and flags. Patterns that can't be emulated using
    // the given target throw.
    // - 'ES2018': Broadest compatibility (uses JS flag u). Unsupported features: nested character
    //             classes and character class intersection.
    // - 'ES2024': Uses JS flag v, supported by Node.js 20 and 2023-era browsers.
    // - 'ESNext': Allows use of ES2025+ regex features in generated patterns (flag groups and
    //             duplicate group names). This preserves duplicate group names across separate
    //             alternation paths and allows disabling option `allowBestEffort` with patterns
    //             that include cased, non-ASCII chars with different states of case sensitivity.
    target: Target.ES2024,
    // Override default values with provided options
    ...options,
  };
}

/**
Transpiles a regex pattern and flags from Oniguruma to a native JS RegExp.
@param {string} pattern Oniguruma regex pattern.
@param {OnigurumaFlags} [flags] Oniguruma flags i, m, x. Flag m is equivalent to JS's flag s.
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
