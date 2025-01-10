import {AstAssertionKinds, AstTypes} from './parse.js';

function canMatchZeroLength({type, min}) {
  // Uses partial check for simplicity:
  // - Groups can match zero-len depending on contents
  // - Non-zero-min quantifier can match zero-len if repeating a group that can match zero-len
  return (
    type === AstTypes.Assertion ||
    type === AstTypes.Directive ||
    // Min 0 doesn't mean that it will always match the empty string
    (type === AstTypes.Quantifier && !min)
  );
}

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

export {
  canMatchZeroLength,
  hasOnlyChild,
  isLookaround,
};
