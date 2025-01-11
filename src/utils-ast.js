import {AstAssertionKinds, AstTypes} from './parse.js';

function hasOnlyChild({alternatives}, kidFn) {
  return (
    alternatives.length === 1 &&
    alternatives[0].elements.length === 1 &&
    (!kidFn || kidFn(alternatives[0].elements[0]))
  );
}

function isLookaround({type, kind}) {
  return (
    type === AstTypes.Assertion &&
    (kind === AstAssertionKinds.lookahead || kind === AstAssertionKinds.lookbehind)
  );
}

function isAlwaysZeroLength({type}) {
  return type === AstTypes.Assertion || type === AstTypes.Directive;
}

function isAlwaysNonZeroLength(node) {
  const types = [
    AstTypes.Character,
    AstTypes.CharacterClass,
    AstTypes.CharacterSet,
  ];
  return types.includes(node.type) || (
    node.type === AstTypes.Quantifier &&
    node.min &&
    types.includes(node.element.type)
  );
}

export {
  hasOnlyChild,
  isAlwaysNonZeroLength,
  isAlwaysZeroLength,
  isLookaround,
};
