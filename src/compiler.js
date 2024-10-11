import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {transform} from './transformer.js';

function onigurumaAst(pattern, flags, {optimize} = {}) {
  return parse(tokenize(pattern, flags), {optimize});
}

function regexAst(pattern, flags, {optimize, allowBestEffort} = {}) {
  return transform(parse(tokenize(pattern, flags), {optimize}), {allowBestEffort});
}

export {
  onigurumaAst, // TODO: Remove
  regexAst, // TODO: Remove
  parse,
  tokenize,
};
