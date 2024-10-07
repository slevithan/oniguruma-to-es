import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';

function createAst(pattern, flags, options) {
  return parse(tokenize(pattern, flags), options);
}

export {
  createAst, // TODO: Replace with `compile`
  parse,
  tokenize,
};
