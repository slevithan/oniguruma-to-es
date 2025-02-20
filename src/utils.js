import {EsVersion, Target} from './options.js';

const cp = String.fromCodePoint;
const r = String.raw;

const envFlags = {
  flagGroups: (() => {
    try {
      new RegExp('(?i:)');
    } catch {
      return false;
    }
    return true;
  })(),
  unicodeSets: (() => {
    try {
      new RegExp('', 'v');
    } catch {
      return false;
    }
    return true;
  })(),
};
// Detect WebKit bug: <github.com/slevithan/oniguruma-to-es/issues/30>
envFlags.literalHyphenIncorrectlyCreatesRange = (() => {
  if (!envFlags.unicodeSets) {
    return false;
  }
  try {
    new RegExp(r`[\d\-a]`, 'v');
  } catch {
    return true;
  }
  return false;
})();

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

function throwIfNot(value, msg) {
  if (!value) {
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
  throwIfNot,
};
