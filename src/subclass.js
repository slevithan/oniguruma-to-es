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
          ...(opts.strategy && {strategy: opts.strategy}),
          ...(opts.useEmulationGroups && {useEmulationGroups: true}),
        },
      };
    }
  }
  /**
  Called internally by all String/RegExp methods that use regexes. Provides special case handling
  that requires coupling with pattern changes during transpilation.
  @override
  @param {string} str
  @returns {RegExpExecArray | null}
  */
  exec(str) {
    const exec = super.exec;
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;

    // Support uncommon and otherwise-unsupported uses of `\G`
    if (this.#strategy === 'search_start_clip' && useLastIndex && pos) {
      // Reset since this tests on a sliced string that we want to match at the start of
      this.lastIndex = 0;
      // Slicing the string can lead to mismatches when three edge cases are stacked on each other:
      // 1. An uncommon use of `\G` that relies on subclass-based emulation, combined with...
      // 2. Lookbehind that searches behind the search start (not match start) position...
      // 3. During a search when the regex's `lastIndex` isn't `0`.
      // The `search_start_clip` strategy is therefore only allowed with strict `accuracy` when
      // lookbehind isn't present
      const match = exec.call(this, str.slice(pos));
      if (match) {
        adjustMatchDetailsForOffset(match, this, str, pos);
        this.lastIndex += pos;
      }
      return match;
    }

    return exec.call(this, str);
  }
}

function adjustMatchDetailsForOffset(match, re, input, offset) {
  match.input = input;
  match.index += offset;
  if (re.hasIndices) {
    const indices = match.indices;
    for (let i = 0; i < indices.length; i++) {
      const arr = indices[i];
      if (arr) {
        // Replace the array rather than updating values since the keys of `match.indices` and
        // `match.indices.groups` share their value arrays by reference. Need to be precise in case
        // they were previously altered separately
        indices[i] = [arr[0] + offset, arr[1] + offset];
      }
    }
    const groupIndices = indices.groups;
    if (groupIndices) {
      Object.keys(groupIndices).forEach(key => {
        const arr = groupIndices[key];
        if (arr) {
          groupIndices[key] = [arr[0] + offset, arr[1] + offset];
        }
      });
    }
  }
}

export {
  EmulatedRegExp,
};
