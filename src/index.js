import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';

function createAst(pattern, flags) {
  return parse(tokenize(pattern, flags));
}

export {
  createAst,
  tokenize, // TODO: Remove (only for debugging)
};
