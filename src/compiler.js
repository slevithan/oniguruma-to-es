import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {transform} from './transformer.js';
import {Target} from './utils.js';

function onigurumaAst(pattern, flags, {optimize} = {}) {
  return parse(tokenize(pattern, flags), {optimize});
}

function regexAst(pattern, flags, {optimize, allowBestEffort, target} = {}) {
  return transform(parse(tokenize(pattern, flags), {optimize}), {allowBestEffort, target});
}

export {
  onigurumaAst, // TODO: Remove
  regexAst, // TODO: Remove
  parse,
  Target,
  tokenize,
};
