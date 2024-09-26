import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';

function createAST(pattern, flags) {
  return parse(tokenize(pattern, flags));
}

export {
  createAST,
  tokenize, // TODO: Remove (only for debugging)
};
