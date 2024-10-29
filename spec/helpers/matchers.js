import {toRegExp} from '../../dist/index.mjs';
import {EsVersion} from '../../src/utils.js';

function getArgs(actual, expected) {
  const pattern = typeof expected === 'string' ? expected : expected.pattern;
  const flags = expected.flags ?? '';
  const strings = Array.isArray(actual) ? actual : [actual];
  let targets = ['ES2018', 'ES2024', 'ESNext'];
  if (expected.targetMax) {
    targets = targets.filter(target => EsVersion[target] <= EsVersion[expected.targetMax]);
  }
  return {
    pattern,
    flags,
    strings,
    targets,
  };
}

function matchedFullStr(match, str) {
  return !!match && match.index === 0 && match[0].length === str.length;
}

// Expects `negate` to be set by `negativeCompare` and doesn't rely on Jasmine's automatic matcher
// negation because when negated we don't want to early return `true` when looping over the array
// of strings and one is found to not match; they all need to not match
function matchWithAllTargets({pattern, flags, strings, targets}, {exact, negate}) {
  for (const target of targets) {
    const re = toRegExp(pattern, flags, {target});
    for (const str of strings) {
      // In case `flags` included `y`
      re.lastIndex = 0;
      const match = re.exec(str);
      const failed = negate ?
        ((exact && matchedFullStr(match, str)) || (!exact && match)) :
        ((exact && !matchedFullStr(match, str)) || (!exact && !match));
      if (failed) {
        return {
          pass: false,
          message: `Expected "${pattern}" ${negate ? 'not ' : ''}to ${exact ? 'exactly ' : ''}match "${str}" with ${flags ? `flags "${flags}" and ` : ''}target ${target}`,
        };
      }
    }
  }
  return {pass: true};
}

export const matchers = {
  toFindMatch() {
    return {
      compare(actual, expected) {
        return matchWithAllTargets(getArgs(actual, expected), {exact: false});
      },
      negativeCompare(actual, expected) {
        return matchWithAllTargets(getArgs(actual, expected), {exact: false, negate: true});
      },
    };
  },
  toExactlyMatch() {
    return {
      compare(actual, expected) {
        return matchWithAllTargets(getArgs(actual, expected), {exact: true});
      },
      negativeCompare(actual, expected) {
        return matchWithAllTargets(getArgs(actual, expected), {exact: true, negate: true});
      },
    };
  },
};
