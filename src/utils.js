const r = String.raw;

function getOrCreate(map, key, defaultValue) {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }
  return map.get(key);
}

const Target = {
  ES2018: 'ES2018',
  ES2024: 'ES2024',
  ESNext: 'ESNext',
};

function hasMinTarget(target, minTarget) {
  const value = {
    ES2018: 2018,
    ES2024: 2024,
    ESNext: 2025,
  };
  return value[target] >= value[minTarget];
}

function throwIfNot(value, msg) {
  if (!value) {
    throw new Error(msg ?? 'Value expected');
  }
  return value;
}

export {
  getOrCreate,
  hasMinTarget,
  r,
  Target,
  throwIfNot,
};
