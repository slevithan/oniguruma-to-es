import {AstAssertionKinds, AstTypes, isLookaround} from './parse.js';
import {hasOnlyChild} from './utils.js';
import {RegExpSubclass} from 'regex/internals';

// Special case AST transformation handling that requires coupling with a `RegExp` subclass (see
// `EmulatedRegExp`). These changes add emulation support for some common patterns that are
// otherwise unsupportable. Only one subclass strategy is supported per pattern
function applySubclassStrategies(ast) {
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
  if (isLoneGLookaround(firstElIn, {negate: true})) {
    // Remove the `\G` and its containing negative lookaround
    firstElIn.parent.elements.shift();
    return 'not_search_start';
  }
  for (let i = 0; i < singleAltIn.elements.length; i++) {
    const el = singleAltIn.elements[i];
    if (!isZeroLengthNode(el)) {
      break;
    }
    if (isLoneGLookaround(el, {negate: true})) {
      // Remove the `\G` and its containing negative lookaround
      singleAltIn.elements.splice(i, 1);
      return 'not_search_start';
    }
  }

  return null;
}

/**
@typedef {{
  useEmulationGroups?: boolean;
  strategy?: string;
}} EmulatedRegExpOptions
*/

/**
Works the same as JavaScript's native `RegExp` constructor in all contexts, but can be given
results from `toDetails` to produce the same result as `toRegExp`.
@augments RegExp
*/
class EmulatedRegExp extends RegExpSubclass {
  #strategy;
  /**
  @param {string | EmulatedRegExp} pattern
  @param {string} [flags]
  @param {EmulatedRegExpOptions} [options]
  */
  constructor(pattern, flags, options) {
    const opts = {
      useEmulationGroups: false,
      strategy: null,
      ...options,
    };
    super(pattern, flags, {useEmulationGroups: opts.useEmulationGroups});
    if (opts.strategy) {
      this.#strategy = opts.strategy;
    // The third argument `options` isn't provided when regexes are copied as part of the internal
    // handling of string methods `matchAll` and `split`
    } else if (pattern instanceof EmulatedRegExp) {
      // Can read private properties of the existing object since it was created by this class
      this.#strategy = pattern.#strategy;
    }
  }
  /**
  Called internally by all String/RegExp methods that use regexes.
  @override
  @param {string} str
  @returns {RegExpExecArray | null}
  */
  exec(str) {
    // Special case handling that requires coupling with pattern changes for the specific strategy
    // in the transformer. These changes add emulation support for some common patterns that are
    // otherwise unsupportable. Only one subclass strategy is supported per pattern
    const exec = super.exec;
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;
    const strategy = this.#strategy;

    // ## Support leading `(^|\G)` and similar
    if (strategy === 'line_or_search_start' && useLastIndex && this.lastIndex) {
      // Reset since testing on a sliced string that we want to match at the start of
      this.lastIndex = 0;
      const match = exec.call(this, str.slice(pos));
      if (match) {
        match.input = str;
        match.index += pos;
        this.lastIndex += pos;
      }
      return match;
    }

    // ## Support leading `(?!\G)` and similar
    if (strategy === 'not_search_start') {
      let match = exec.call(this, str);
      if (match?.index === pos) {
        const globalRe = useLastIndex ? this : new RegExp(this.source, `g${this.flags}`);
        globalRe.lastIndex = match.index + 1;
        match = exec.call(globalRe, str);
      }
      return match;
    }

    return exec.call(this, str);
  }
}

function isLoneGLookaround(node, options) {
  return (
    isLookaround(node) &&
    node.negate === options.negate &&
    hasOnlyChild(node, kid => kid.kind === AstAssertionKinds.search_start)
  );
}

function isZeroLengthNode(node) {
  return (
    node.type === AstTypes.Assertion ||
    node.type === AstTypes.Directive ||
    (node.type === AstTypes.Quantifier && !node.min)
  );
}

export {
  applySubclassStrategies,
  EmulatedRegExp,
  isLoneGLookaround,
  isZeroLengthNode,
};
