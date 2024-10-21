import {generate} from './generate.js';
import {parse} from './parse.js';
import {rewrite} from 'regex';
import {recursion} from 'regex-recursion';
import {tokenize} from './tokenize.js';
import {transform} from './transform.js';
import {Target, TargetNum} from './utils.js';

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
  const regexAst = transform(onigurumaAst);
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
  if (options?.target !== undefined && !TargetNum[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  return {
    // Allows results that differ from Oniguruma in rare cases. If `false`, throws if the pattern
    // can't be converted with identical behavior. Ex: Enables the use of `\X`, which uses a close
    // approximation of a Unicode extended grapheme cluster.
    allowBestEffort: true,
    // If `null`, any use of recursion (ex: `a\g<0>?b` or `(?<r>a\g<r>?b)`) throws. If an integer
    // from 2-100, common forms of recursive patterns are supported and recurse up to the specified
    // max depth.
    maxRecursionDepth: 6,
    // Simplify the generated pattern when it doesn't change the meaning
    optimize: true,
    // JS version for the generated regex pattern and flags. Patterns that can't be emulated using
    // the given target throw.
    // - 'ES2018': Broadest compatibility (uses JS flag u). Unsupported features: Nested character
    //             classes, character class intersection, and some POSIX classes.
    // - 'ES2024': Uses JS flag v, supported by Node.js 20 and 2023-era browsers.
    // - 'ESNext': Allows use of ESNext regex features in generated patterns (flag groups and
    //             duplicate group names). This allows generating shorter regexes, improves
    //             transpilation performance, and preserves duplicate group names across separate
    //             alternation paths.
    target: Target.ES2024,
    // Override default values with provided options
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
