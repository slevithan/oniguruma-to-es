import {getOrCreate, throwIfNot} from './utils.js';

/**
@typedef {{
  hiddenCaptures?: Array<number>;
  lazyCompile?: boolean;
  strategy?: string | null;
  transfers?: Array<[number, Array<number>]>;
}} EmulatedRegExpOptions
*/

/**
Works the same as JavaScript's native `RegExp` constructor in all contexts, but can be given
results from `toRegExpDetails` to produce the same result as `toRegExp`.
*/
class EmulatedRegExp extends RegExp {
  /**
  @type {Map<number, {
    hidden?: true;
    transferTo?: number;
  }>}
  */
  #captureMap = new Map();

  /**
  @type {Map<number, string> | null}
  */
  #nameMap = null;

  /**
  @type {string | null}
  */
  #strategy = null;

  /**
  Can be used to serialize the instance.
  @type {EmulatedRegExpOptions}
  */
  rawOptions = {};

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
        this.#nameMap = pattern.#nameMap;
        this.#strategy = pattern.#strategy;
        this.rawOptions = pattern.rawOptions;
      }
    } else {
      super(pattern, flags);
      this.rawOptions = options ?? {};
      const opts = {
        hiddenCaptures: [],
        strategy: null,
        transfers: [],
        ...options,
      };
      this.#captureMap = createCaptureMap(opts.hiddenCaptures, opts.transfers);
      this.#strategy = opts.strategy;
    }
  }

  /**
  Called internally by all String/RegExp methods that use regexes.
  @override
  @param {string} str
  @returns {RegExpExecArray | null}
  */
  exec(str) {
    const useLastIndex = this.global || this.sticky;
    const pos = this.lastIndex;

    if (this.#strategy === 'clip_search' && useLastIndex && pos) {
      // Reset since this tests on a sliced string that we want to match at the start of
      this.lastIndex = 0;
      // Slicing the string can lead to mismatches when three edge cases are stacked on each other:
      // 1. An uncommon use of `\G` that relies on `clip_search`, combined with...
      // 2. Lookbehind that searches behind the search start (not match start) position...
      // 3. During a search when the regex's `lastIndex` isn't `0`.
      // The `clip_search` strategy is therefore only allowed when lookbehind isn't present, if
      // using strict `accuracy`
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
    const mappedNums = [0];
    for (let i = 1; i < matchCopy.length; i++) {
      const {hidden, transferTo} = this.#captureMap.get(i) ?? {};
      if (hidden) {
        mappedNums.push(null);
      } else {
        mappedNums.push(match.length);
        match.push(matchCopy[i]);
        if (this.hasIndices) {
          match.indices.push(indicesCopy[i]);
        }
      }
      // Only transfer if the capture participated in the match
      if (transferTo && matchCopy[i] !== undefined) {
        const to = throwIfNot(mappedNums[transferTo]);
        match[to] = matchCopy[i];
        if (this.hasIndices) {
          match.indices[to] = indicesCopy[i];
        }
        if (match.groups) {
          if (!this.#nameMap) {
            // Generate and cache the first time it's needed
            this.#nameMap = createNameMap(this.source);
          }
          const name = this.#nameMap.get(transferTo);
          if (name) {
            match.groups[name] = matchCopy[i];
            if (this.hasIndices) {
              match.indices.groups[name] = indicesCopy[i];
            }
          }
        }
      }
    }
    return match;
  }
}

class LazyRegExp extends RegExp {
  _pattern;
  _flags;
  _regexp;
  rawOptions = {};

  get source() {
    return this._pattern;
  }

  /**
  @param {string} pattern
  @param {string} [flags]
  @param {EmulatedRegExpOptions} [options]
  */
  constructor(pattern, flags, options) {
    super('', flags);
    this._pattern = pattern;
    this._flags = flags;
    this.rawOptions = options ?? {};
  }

  exec(str) {
    if (!this._regexp) {
      this._regexp = new EmulatedRegExp(this._pattern, this._flags, this.rawOptions);
    }
    this._regexp.lastIndex = this.lastIndex;
    const match = this._regexp.exec(str);
    this.lastIndex = this._regexp.lastIndex;
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
Build the capturing group map, with hidden/transfer groups marked to indicate their submatches
should get special handling in match results.
@param {Array<number>} hiddenCaptures
@param {Array<[number, Array<number>]>} transfers
@returns {Map<number, {
  hidden?: true;
  transferTo?: number;
}>}
*/
function createCaptureMap(hiddenCaptures, transfers) {
  const captureMap = new Map();
  for (const num of hiddenCaptures) {
    captureMap.set(num, {
      hidden: true,
    });
  }
  for (const [to, from] of transfers) {
    for (const num of from) {
      getOrCreate(captureMap, num, {}).transferTo = to;
    }
  }
  return captureMap;
}

/**
@param {string} pattern
@returns {Map<number, string>}
*/
function createNameMap(pattern) {
  const re = /(?<capture>\((?:\?<(?![=!])(?<name>[^>]+)>|(?!\?)))|\\?./gsu;
  const map = new Map();
  let numCharClassesOpen = 0;
  let numCaptures = 0;
  let match;
  while ((match = re.exec(pattern))) {
    const {0: m, groups: {capture, name}} = match;
    // Relies on no unescaped literal `[` in char classes (valid in JS if not using flag v), but
    // this library's generator never produces unescaped literal `[` even with `target` ES2018 (see
    // `CharClassEscapeChars`)
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (capture) {
        numCaptures++;
        if (name) {
          map.set(numCaptures, name);
        }
      }
    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }
  return map;
}

export {
  EmulatedRegExp,
  LazyRegExp,
};
