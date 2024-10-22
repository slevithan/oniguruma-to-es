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
  // Set default values
  return {
    // Allows results that differ from Oniguruma in rare cases. If `false`, throws if the pattern
    // can't be emulated with identical behavior.
    allowBestEffort: true,
    // If `null`, any use of recursion (ex: `a\g<0>?b` or `(?<r>a\g<r>?b)`) throws. If an integer
    // from `2` to `100` and `allowBestEffort` is on, common recursion forms are supported and
    // recurse up to the specified max depth.
    maxRecursionDepth: 6,
    // Simplify the generated pattern when it doesn't change the meaning. Optimization also enables
    // use of nested character classes with target ES2018.
    optimize: true,
    // Sets the JavaScript language version for generated patterns and flags:
    // ES2018: Uses JS flag u.
    // - Emulation restrictions: Character class intersection and nested negated classes are
    //   unsupported. These restrictions avoid the need for heavyweight Unicode character data.
    // - Generated regexes potentially use features that require Node.js 10 or a browser released
    //   during 2018 (Chrome) to 2023 (Safari). Minimum requirement for any regex is Node.js 6 or a
    //   2016-era browser.
    // ES2024: Uses JS flag v.
    // - Generated regexes require Node.js 20 or a 2023-era browser (compat table).
    // ESNext: Allows use of ESNext regex features (flag groups and duplicate group names).
    // - Generated regexes might require Node.js 23 or a 2024-era browser (Safari unsupported).
    // - Benefits: Better transpilation performance, shorter generated source, and duplicate group
    //   names are preserved across separate alternation paths.
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
