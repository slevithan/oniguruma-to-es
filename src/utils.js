import {EsVersion, Target} from './options.js';

const cp = String.fromCodePoint;
const r = String.raw;

const envSupportsFlagGroups = (() => {
  try {
    new RegExp('(?i:)');
  } catch {
    return false;
  }
  return true;
})();

const envSupportsFlagV = (() => {
  try {
    new RegExp('', 'v');
  } catch {
    return false;
  }
  return true;
})();

function getNewCurrentFlags(current, {enable, disable}) {
  return {
    dotAll: !disable?.dotAll && !!(enable?.dotAll || current.dotAll),
    ignoreCase: !disable?.ignoreCase && !!(enable?.ignoreCase || current.ignoreCase),
  };
}

function getOrCreate(map, key, defaultValue) {
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
  envSupportsFlagGroups,
  envSupportsFlagV,
  getNewCurrentFlags,
  getOrCreate,
  isMinTarget,
  r,
  throwIfNot,
};
