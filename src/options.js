const Accuracy = /** @type {const} */ ({
  strict: 'strict',
  default: 'default',
  loose: 'loose',
});

const EsVersion = {
  ES2018: 2018,
  ES2024: 2024,
  ESNext: 2025,
};

const Target = /** @type {const} */ ({
  ES2018: 'ES2018',
  ES2024: 'ES2024',
  ESNext: 'ESNext',
});

/**
Returns a complete set of options, with default values set for options that weren't provided.
@param {import('.').Options} [options]
@returns {Required<import('.').Options>}
*/
function getOptions(options) {
  if (options?.target !== undefined && !EsVersion[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  // Set default values
  return {
    // Sets the level of emulation rigor/strictness.
    accuracy: 'default',
    // Prevents use of advanced emulation strategies that rely on returning a `RegExp` subclass,
    // resulting in certain patterns not being emulatable.
    avoidSubclass: false,
    // Oniguruma flags; a string with `i`, `m`, and `x` in any order (all optional). Oniguruma's
    // `m` is equivalent to JavaScript's `s` (`dotAll`).
    flags: '',
    // Include JavaScript flag `g` (`global`) in the result.
    global: false,
    // Include JavaScript flag `d` (`hasIndices`) in the result.
    hasIndices: false,
    // Specifies the recursion depth limit. Supported values are integers `2` to `100` and `null`.
    // If `null`, any use of recursion results in an error.
    maxRecursionDepth: 6,
    // Sets the JavaScript language version for generated patterns and flags. Later targets allow
    // faster processing, simpler generated source, and support for additional features.
    target: 'ES2024',
    // Leave disabled unless the regex will be used in a TextMate grammar processor that merges
    // backreferences across `begin` and `end` patterns.
    tmGrammar: false,
    // Disables optimizations that simplify the pattern when it doesn't change the meaning.
    verbose: false,
    ...options,
  };
}

export {
  Accuracy,
  EsVersion,
  getOptions,
  Target,
};
