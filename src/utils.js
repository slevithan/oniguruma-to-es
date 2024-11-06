const cp = String.fromCodePoint;
const r = String.raw;

const EmulationMode = /** @type {const} */ ({
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
  EmulationMode,
  EsVersion,
  getNewCurrentFlags,
  getOrCreate,
  isMinTarget,
  r,
  Target,
  throwIfNot,
};
