import {AstAssertionKinds, AstTypes, isLookaround} from './parse.js';
import {hasOnlyChild} from './utils.js';

// Special case handling that requires coupling with a `RegExp` subclass (see `EmulatedRegExp`).
// These changes add emulation support for some common patterns that are otherwise unsupportable.
// Only one subclass strategy is supported per pattern
function applySubclassStrategies(ast, accuracy) {
  const alts = ast.pattern.alternatives;
  const firstEl = alts[0].elements[0];

  if (alts.length > 1 || !firstEl) {
    // These strategies only work if there's no top-level alternation
    return null;
  }

  const hasWrapperGroup =
    hasOnlyChild(ast.pattern, kid => (
      kid.type === AstTypes.CapturingGroup || kid.type === AstTypes.Group
    )) &&
    firstEl.alternatives.length === 1;
  const singleAltIn = hasWrapperGroup ? firstEl.alternatives[0] : alts[0];
  // First el within first group if the group doesn't contain top-level alternation, else just the
  // first el of the pattern; ex: a flag group might enclose the full pattern
  const firstElIn = hasWrapperGroup ? singleAltIn.elements[0] : firstEl;
  if (!firstElIn) {
    return null;
  }

  // ## Strategy `line_or_search_start`: Support leading `(^|\G)` and similar
  if (
    (firstElIn.type === AstTypes.CapturingGroup || firstElIn.type === AstTypes.Group) &&
    firstElIn.alternatives.length === 2 &&
    firstElIn.alternatives[0].elements.length === 1 &&
    firstElIn.alternatives[1].elements.length === 1
  ) {
    const el1 = firstElIn.alternatives[0].elements[0];
    const el2 = firstElIn.alternatives[1].elements[0];
    if (
      (el1.kind === AstAssertionKinds.line_start && el2.kind === AstAssertionKinds.search_start) ||
      (el1.kind === AstAssertionKinds.search_start && el2.kind === AstAssertionKinds.line_start)
    ) {
      // Remove the `\G` and its container alternative
      if (el1.kind === AstAssertionKinds.line_start) {
        firstElIn.alternatives.pop();
      } else {
        firstElIn.alternatives.shift();
      }
      return 'line_or_search_start';
    }
  }

  // ## Strategy `not_search_start`: Support leading `(?!\G)` and similar
  if (isNegatedSearchStart(firstElIn)) {
    // Remove the negative lookaround
    firstElIn.parent.elements.shift();
    return 'not_search_start';
  }
  const negGIndex = singleAltIn.elements.findIndex(el => isNegatedSearchStart(el));
  if (negGIndex > -1 && singleAltIn.elements.every(el => el.type === AstTypes.Assertion)) {
    // Remove the negative lookaround
    singleAltIn.elements.splice(negGIndex, 1);
    return 'not_search_start';
  }

  return null;
}

function isNegatedSearchStart(node) {
  return isLookaround(node) &&
    node.negate &&
    hasOnlyChild(node, kid => kid.kind === AstAssertionKinds.search_start);
}

export {
  applySubclassStrategies,
};
