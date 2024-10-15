import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {transform} from './transformer.js';
import {Target} from './utils.js';

// TODO: Remove; temp for testing during dev
function onigurumaAst(pattern, flags, {optimize} = {}) {
  return parse(tokenize(pattern, flags), {optimize});
}

// TODO: Remove; temp for testing during dev
function regexAst(pattern, flags, {optimize} = {}) {
  return transform(parse(tokenize(pattern, flags), {optimize}));
}

export {
  onigurumaAst,
  parse,
  regexAst,
  Target,
  tokenize,
};
