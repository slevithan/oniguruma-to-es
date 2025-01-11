import {AstAssertionKinds, AstTypes} from './parse.js';
import {hasOnlyChild, isAlwaysZeroLength, isLookaround} from './utils-ast.js';
import {RegExpSubclass} from 'regex/internals';

/**
@typedef {{
  strategy?: string | null;
  useEmulationGroups?: boolean;
}} EmulatedRegExpOptions
*/

/**
Works the same as JavaScript's native `RegExp` constructor in all contexts, but can be given
results from `toDetails` to produce the same result as `toRegExp`.
@augments RegExp
*/
class EmulatedRegExp extends RegExpSubclass {
  /**
  @private
  @type {string | null}
  */
  #strategy;
  /**
  Can be used to serialize the arguments used to create the instance.
  @type {{
    pattern: string;
    flags: string;
    options: EmulatedRegExpOptions;
  }}
  */
  rawArgs;
  /**
  @overload
  @param {string} pattern
  @param {string} [flags]
  @param {EmulatedRegExpOptions} [options]
  */
  /**
  @overload
  @param {EmulatedRegExp} pattern
  @param {string} [flags]
  */
  constructor(pattern, flags, options) {
    // Argument `options` isn't provided when regexes are copied via `new EmulatedRegExp(regexp)`,
    // including as part of the internal handling of string methods `matchAll` and `split`
    if (pattern instanceof RegExp) {
      if (options) {
        throw new Error('Cannot provide options when copying a regexp');
      }
      super(pattern, flags);
      if (pattern instanceof EmulatedRegExp) {
        this.#strategy = pattern.#strategy;
        this.rawArgs = pattern.rawArgs;
      } else {
        this.#strategy = null;
        this.rawArgs = {
          pattern: pattern.source,
          flags: pattern.flags,
          options: {},
        };
      }
      if (flags !== undefined) {
        this.rawArgs.flags = flags;
      }
    } else {
      const opts = {
        strategy: null,
        useEmulationGroups: false,
        ...options,
      };
      super(pattern, flags, {useEmulationGroups: opts.useEmulationGroups});
      this.#strategy = opts.strategy;
      this.rawArgs = {
        pattern,
        flags: flags ?? '',
        options: {
          ...(opts.strategy ? {strategy: opts.strategy} : null),
          ...(opts.useEmulationGroups ? {useEmulationGroups: true} : null),
        },
      };
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
        adjustMatchDetails(str, this, match, pos);
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

function adjustMatchDetails(str, re, match, offset) {
  match.input = str;
  match.index += offset;
  re.lastIndex += offset;
  if (re.hasIndices) {
    const matchIndices = match.indices;
    for (let i = 0; i < matchIndices.length; i++) {
      const arr = matchIndices[i];
      // Replace the array rather than updating values since the keys of `match.indices` and
      // `match.indices.groups` share their value arrays by reference. Need to be precise in case
      // they were previously altered separately
      matchIndices[i] = [arr[0] + offset, arr[1] + offset];
    }
    const groupIndices = matchIndices.groups;
    if (groupIndices) {
      Object.keys(groupIndices).forEach(key => {
        const arr = groupIndices[key];
        groupIndices[key] = [arr[0] + offset, arr[1] + offset];
      });
    }
  }
}

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
    if (!isAlwaysZeroLength(el)) {
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

function isLoneGLookaround(node, options) {
  return (
    isLookaround(node) &&
    node.negate === options.negate &&
    hasOnlyChild(node, kid => kid.kind === AstAssertionKinds.search_start)
  );
}

export {
  applySubclassStrategies,
  EmulatedRegExp,
  isLoneGLookaround,
};
