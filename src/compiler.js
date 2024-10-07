import {parse} from './parser.js';
import {tokenize} from './tokenizer.js';
import {transform} from './transformer.js';

function onigurumaAst(pattern, flags, options) {
  return parse(tokenize(pattern, flags), options);
}

function regexAst(pattern, flags, options) {
  return transform(parse(tokenize(pattern, flags), options));
}

export {
  onigurumaAst, // TODO: Remove
  regexAst, // TODO: Remove
  parse,
  tokenize,
};
