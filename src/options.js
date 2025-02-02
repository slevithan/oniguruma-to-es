import {envSupportsFlagGroups, envSupportsFlagV} from './utils.js';

const Accuracy = /** @type {const} */ ({
  default: 'default',
  strict: 'strict',
});

const EsVersion = {
  ES2025: 2025,
  ES2024: 2024,
  ES2018: 2018,
};

const Target = /** @type {const} */ ({
  auto: 'auto',
  ES2025: 'ES2025',
  ES2024: 'ES2024',
  ES2018: 'ES2018',
});

/**
Returns a complete set of options, with default values set for options that weren't provided.
@param {import('.').ToRegExpOptions} [options]
@returns {Required<import('.').ToRegExpOptions>}
*/
function getOptions(options) {
  if (options?.target !== undefined && !Target[options.target]) {
    throw new Error(`Unexpected target "${options.target}"`)
  }
  // Set default values
  const opts = {
    // Sets the level of emulation rigor/strictness.
    accuracy: 'default',
    // Disables advanced emulation that relies on returning a `RegExp` subclass, resulting in
    // certain patterns not being emulatable.
    avoidSubclass: false,
    // Oniguruma flags; a string with `i`, `m`, `x`, `D`, `S`, `W` in any order (all optional).
    // Oniguruma's `m` is equivalent to JavaScript's `s` (`dotAll`).
    flags: '',
    // Include JavaScript flag `g` (`global`) in the result.
    global: false,
    // Include JavaScript flag `d` (`hasIndices`) in the result.
    hasIndices: false,
    // Pattern length threshold for delaying regex construction until first use.
    lazyCompileMin: Infinity,
    // JavaScript version used for generated regexes. Using `auto` detects the best value based on
    // your environment. Later targets allow faster processing, simpler generated source, and
    // support for additional features.
    target: 'auto',
    // Disables optimizations that simplify the pattern when it doesn't change the meaning.
    verbose: false,
    ...options,
    // Advanced options that override standard behavior, error checking, and flags when enabled.
    rules: {
      // Useful with TextMate grammars that merge backreferences across patterns.
      allowOrphanBackrefs: false,
      // Use ASCII-based `\b` and `\B`, which increases search performance of generated regexes.
      asciiWordBoundaries: false,
      // Allow unnamed captures and numbered calls (backreferences and subroutines) when using
      // named capture. This is Oniguruma option `ONIG_OPTION_CAPTURE_GROUP`; on by default in
      // `vscode-oniguruma`.
      captureGroup: false,
      // Change the recursion depth limit from Oniguruma's `20` to an integer `2`–`20`.
      recursionLimit: 20,
      // `^` as `\A`; `$` as`\Z`. Improves search performance of generated regexes without changing
      // meaning if searching line by line. This is Oniguruma option `ONIG_OPTION_SINGLELINE`.
      singleline: false,
      ...(options?.rules),
    },
  };
  if (opts.target === 'auto') {
    opts.target = envSupportsFlagGroups ? 'ES2025' : (envSupportsFlagV ? 'ES2024' : 'ES2018');
  }
  return opts;
}

export {
  Accuracy,
  EsVersion,
  getOptions,
  Target,
};
