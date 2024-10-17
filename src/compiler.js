import {generate, getOptions} from './generator.js';
import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {transform} from './transformer.js';
import {rewrite} from 'regex';
import {recursion} from 'regex-recursion';

/**
@typedef {{
  allowBestEffort?: boolean;
  maxRecursionDepth?: number | null;
  target?: 'ES2018' | 'ES2024' | 'ESNext';
}} Options
*/

/**
Transpiles a regex pattern and flags from Oniguruma to native JS.
@param {string} pattern
@param {string} [flags]
@param {Options} [options]
@returns {{pattern: string; flags: string;}}
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
Transpiles a regex pattern and flags from Oniguruma to a native JS RegExp.
@param {string} pattern
@param {string} [flags]
@param {Options} [options]
@returns {RegExp}
*/
function toRegExp(pattern, flags, options) {
  const result = compile(pattern, flags, options);
  return new RegExp(result.pattern, result.flags);
}

export {
  compile,
  parse,
  tokenize,
  toRegExp,
  transform,
};
