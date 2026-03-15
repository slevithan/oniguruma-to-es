import {EsVersion, Target} from './options.js';

const cp = String.fromCodePoint;
const r = String.raw;

const envFlags = {};
// Use `globalThis` to prevent env-testing fns from being replaced with constants during bundling
// with Rolldown; see <github.com/slevithan/oniguruma-to-es/issues/42>
const globalRegExp = globalThis.RegExp;
envFlags.flagGroups = (() => {
  try {
    new globalRegExp('(?i:)');
  } catch {
    return false;
  }
  return true;
})();
envFlags.unicodeSets = (() => {
  try {
    // Check for flag v support and also that nested classes can be parsed
    // See <github.com/slevithan/oniguruma-to-es/pull/41>
    new globalRegExp('[[]]', 'v');
  } catch {
    return false;
  }
  return true;
})();
// Detect WebKit bug: <github.com/slevithan/oniguruma-to-es/issues/30>
envFlags.bugFlagVLiteralHyphenIsRange = envFlags.unicodeSets ? (() => {
  try {
    new globalRegExp(r`[\d\-a]`, 'v');
  } catch {
    return true;
  }
  return false;
})() : false;
// Detect WebKit bug: <github.com/slevithan/oniguruma-to-es/issues/38>
envFlags.bugNestedClassIgnoresNegation = envFlags.unicodeSets && new globalRegExp('[[^a]]', 'v').test('a');

function getNewCurrentFlags(current, {enable, disable}) {
  return {
    dotAll: !disable?.dotAll && !!(enable?.dotAll || current.dotAll),
    ignoreCase: !disable?.ignoreCase && !!(enable?.ignoreCase || current.ignoreCase),
  };
}

function getOrInsert(map, key, defaultValue) {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key);
}

/**
@param {keyof Target} target
@param {keyof Target} min
@returns {boolean}
*/
function isMinTarget(target, min) {
  return EsVersion[target] >= EsVersion[min];
}

function throwIfNullish(value, msg) {
  if (value == null) {
    throw new Error(msg ?? 'Value expected');
  }
  return value;
}

export {
  cp,
  envFlags,
  getNewCurrentFlags,
  getOrInsert,
  isMinTarget,
  r,
  throwIfNullish,
};
