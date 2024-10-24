const cp = String.fromCodePoint;
const r = String.raw;

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

function getOrCreate(map, key, defaultValue) {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key);
}

function throwIfNot(value, msg) {
  if (!value) {
    throw new Error(msg ?? 'Value expected');
  }
  return value;
}

export {
  cp,
  EsVersion,
  getOrCreate,
  r,
  Target,
  throwIfNot,
};
