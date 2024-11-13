import {AstAssertionKinds, AstTypes, createAlternative, createGroup, createUnicodeProperty, isLookaround} from './parse.js';
import {adoptAndSwapKids} from './transform.js';
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
      return {name: 'line_or_search_start'};
    }
  }

  // ## Strategy `not_search_start`: Support leading `(?!\G)` and similar
  if (isNegatedSearchStart(firstElIn)) {
    // Remove the lookaround
    firstElIn.parent.elements.shift();
    return {name: 'not_search_start'};
  }
  const negGIndex = singleAltIn.elements.findIndex(el => isNegatedSearchStart(el));
  if (negGIndex > -1 && singleAltIn.elements.every(el => el.type === AstTypes.Assertion)) {
    // Remove the lookaround
    singleAltIn.elements.splice(negGIndex, 1);
    return {name: 'not_search_start'};
  }

  // ## Strategy `after_search_start_or_subpattern`: Support leading `(?<=\G|…)` and similar
  // Note: Leading `(?<=\G)` without other alts is supported without the need for a subclass
  if (
    firstElIn.kind === AstAssertionKinds.lookbehind &&
    !firstElIn.negate &&
    firstElIn.alternatives.length > 1
  ) {
    const siblingAlts = [];
    let hasGAlt = false;
    firstElIn.alternatives.forEach(alt => {
      if (alt.elements.length === 1 && alt.elements[0].kind === AstAssertionKinds.search_start) {
        hasGAlt = true;
      } else {
        siblingAlts.push(alt);
      }
    });
    if (hasGAlt && siblingAlts.length) {
      let supported = true;
      if (siblingAlts.some(alt => alt.elements.some(el => {
        // Check for nodes that are or can include captures
        return el.type === AstTypes.CapturingGroup || el.type === AstTypes.Group || el.type === AstTypes.Subroutine || isLookaround(el);
      }))) {
        if (accuracy === 'loose') {
          supported = false;
        } else {
          throw new Error(r`Uses "\G" in a way that's unsupported`);
        }
      }
      if (supported) {
        // [HACK] Replace the lookbehind with an emulation marker since it isn't easy from here to
        // acurately extract what will later become the generated subpattern
        const emulationGroup = adoptAndSwapKids(createGroup(), [
          adoptAndSwapKids(createAlternative(), [createUnicodeProperty('<<', {skipPropertyNameValidation: true})]),
          ...siblingAlts,
          adoptAndSwapKids(createAlternative(), [createUnicodeProperty('>>', {skipPropertyNameValidation: true})]),
        ]);
        emulationGroup.parent = firstElIn.parent;
        firstElIn.parent.elements[0] = emulationGroup;
        return {name: 'after_search_start_or_subpattern'};
      }
    }
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
