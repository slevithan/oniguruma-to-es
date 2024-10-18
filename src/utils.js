const r = String.raw;

const Target = /** @type {const} */ ({
  ES2018: 'ES2018',
  ES2024: 'ES2024',
  ESNext: 'ESNext',
});

const TargetNum = {
  ES2018: 2018,
  ES2024: 2024,
  ESNext: 2025,
};

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
  getOrCreate,
  r,
  Target,
  TargetNum,
  throwIfNot,
};
