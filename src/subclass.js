import {getOrCreate} from './utils.js';

/**
@typedef {{
  captureTransfers?: Array<[number | string, number]>;
  hiddenCaptureNums?: Array<number>;
  strategy?: string | null;
}} EmulatedRegExpOptions
*/

/**
Works the same as JavaScript's native `RegExp` constructor in all contexts, but can be given
results from `toDetails` to produce the same result as `toRegExp`.
*/
class EmulatedRegExp extends RegExp {
  /**
  @private
  @type {Map<number, {
    hidden?: true;
    transferToNum?: number;
    transferToName?: string;
  }>}
  */
  #captureMap;
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
        this.#captureMap = pattern.#captureMap;
        this.#strategy = pattern.#strategy;
        this.rawArgs = {...pattern.rawArgs};
      } else {
        this.#captureMap = new Map();
        this.#strategy = null;
        this.rawArgs = {
          pattern: pattern.source,
          flags: pattern.flags,
          options: {},
        };
      }
      if (flags !== undefined) {
        // Flags were explicitly changed while copying
        this.rawArgs.flags = flags;
      }
    } else {
      super(pattern, flags);
      const opts = {
        captureTransfers: [],
        hiddenCaptureNums: [],
        strategy: null,
        ...options,
      };
      this.#captureMap = createCaptureMap(opts.hiddenCaptureNums, opts.captureTransfers);
      this.#strategy = opts.strategy;
      this.rawArgs = {
        pattern,
        flags: flags ?? '',
        options: {
          ...(opts.captureTransfers.length && {captureTransfers: opts.captureTransfers}),
          ...(opts.hiddenCaptureNums.length && {hiddenCaptureNums: opts.hiddenCaptureNums}),
          ...(opts.strategy && {strategy: opts.strategy}),
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
      const match = this.#execCore(str.slice(pos));
      if (match) {
        adjustMatchDetailsForOffset(match, this, str, pos);
        this.lastIndex += pos;
      }
      return match;
    }

    return this.#execCore(str);
  }

  /**
  Adds support for hidden and transfer captures.
  @param {string} str
  @returns
  */
  #execCore(str) {
    const match = super.exec(str);
    if (!match || !this.#captureMap.size) {
      return match;
    }
    const matchCopy = [...match];
    // Empty all but the first value of the array while preserving its other properties
    match.length = 1;
    let indicesCopy;
    if (this.hasIndices) {
      indicesCopy = [...match.indices];
      match.indices.length = 1;
    }
    // TODO: Review and cleanup this code?
    // TODO: Can I avoid creating `newNums`?
    const newNums = [0];
    for (let i = 1; i < matchCopy.length; i++) {
      const data = this.#captureMap.get(i) ?? {};
      // TODO: Move the rest behind a function?
      if (data.hidden) {
        newNums.push(null);
      } else {
        newNums.push(match.length);
        match.push(matchCopy[i]);
        if (this.hasIndices) {
          match.indices.push(indicesCopy[i]);
        }
      }
      // TODO: Can subclass `RegExpSubclass` if it provides an `adjustedNums` and matchCopy?
      const {transferToNum, transferToName} = data;
      if (transferToNum) {
        // TODO: Can this be null and is that a problem?
        const adjustedNum = newNums[transferToNum];
        match[adjustedNum] = matchCopy[i];
        if (this.hasIndices) {
          match.indices[adjustedNum] = indicesCopy[i];
        }
      }
      if (transferToName) {
        match.groups[transferToName] = matchCopy[i];
        if (this.hasIndices) {
          match.indices.groups[transferToName] = indicesCopy[i];
        }
      }
    }
    return match;
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

/**
Build the capturing group map, with emulation groups marked to indicate their submatches shouldn't
appear in results.
@param {Array<number>} hiddenCaptureNums
@param {Array<[number | string, number]>} captureTransfers
@returns {Map<number, {
  hidden?: true;
  transferToNum?: number;
  transferToName?: string;
}>}
*/
function createCaptureMap(hiddenCaptureNums, captureTransfers) {
  const captureMap = new Map();
  for (const num of hiddenCaptureNums) {
    captureMap.set(num, {
      hidden: true,
    });
  }
  for (const [to, from] of captureTransfers) {
    const data = getOrCreate(captureMap, from, {});
    if (typeof to === 'string') {
      data.transferToName = to;
    } else {
      data.transferToNum = to;
    }
  }
  return captureMap;
}

export {
  EmulatedRegExp,
};
