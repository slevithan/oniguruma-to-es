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

function isZeroLengthNode({type, min}) {
  return (
    type === AstTypes.Assertion ||
    type === AstTypes.Directive ||
    (type === AstTypes.Quantifier && !min)
  );
}

export {
  hasOnlyChild,
  isLookaround,
  isZeroLengthNode,
};
