import {generate} from './generator.js';
import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstTypes, AstVariableLengthCharacterSetKinds, createAlternative, createBackreference, createCapturingGroup, createCharacter, createCharacterClass, createCharacterClassIntersection, createCharacterClassRange, createFlags, createGroup, createLookaround, createPattern, createQuantifier, createRegex, createSubroutine, createUnicodeProperty, createVariableLengthCharacterSet, parse} from './parser.js';
import {TokenCharacterSetKinds, TokenDirectiveKinds, TokenGroupKinds, tokenize, TokenTypes} from './tokenizer.js';
import {transform} from './transformer.js';
import {traverse} from './traverser.js';
import {Target} from './utils.js';

function compile(pattern, flags, options = {}) {
  const {allowBestEffort, maxRecursionDepth, target} = options;
  const tokens = tokenize(pattern, flags);
  const onigurumaAst = parse(tokens);
  const regexAst = transform(onigurumaAst);
  const output = generate(regexAst, {
    allowBestEffort,
    maxRecursionDepth,
    target,
  });
  return output;
}

export {
  AstAssertionKinds,
  AstCharacterSetKinds,
  AstDirectiveKinds,
  AstTypes,
  AstVariableLengthCharacterSetKinds,
  compile,
  createAlternative,
  createBackreference,
  createCapturingGroup,
  createCharacter,
  createCharacterClass,
  createCharacterClassIntersection,
  createCharacterClassRange,
  createFlags,
  createGroup,
  createLookaround,
  createPattern,
  createQuantifier,
  createRegex,
  createSubroutine,
  createUnicodeProperty,
  createVariableLengthCharacterSet,
  generate,
  parse,
  Target,
  TokenCharacterSetKinds,
  TokenDirectiveKinds,
  TokenGroupKinds,
  tokenize,
  TokenTypes,
  transform,
  traverse,
};
