import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';

function createAst(pattern, flags, options) {
  return parse(tokenize(pattern, flags), options);
}

export {
  createAst,
  parse, // TODO: Remove?
  tokenize, // TODO: Remove?
};
