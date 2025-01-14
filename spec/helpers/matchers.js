import {toRegExp} from '../../dist/esm/index.js';
import {EsVersion} from '../../src/options.js';

function getArgs(actual, expected) {
  const max = expected.maxTestTarget;
  const min = expected.minTestTarget;
  const targets = ['ES2018', 'ES2024', 'ES2025'];
  const targeted = targets.
    filter(target => !max || EsVersion[target] <= EsVersion[max]).
    filter(target => !min || (min !== Infinity && EsVersion[target] >= EsVersion[min]));
  return {
    pattern: typeof expected === 'string' ? expected : expected.pattern,
    flags: expected.flags ?? '',
    accuracy: expected.accuracy ?? 'default',
    avoidSubclass: expected.avoidSubclass ?? false,
    rules: expected.rules ?? {},
    strings: Array.isArray(actual) ? actual : [actual],
    targets: targeted,
  };
}

function wasFullStrMatch(match, str) {
  return !!match && match.index === 0 && match[0].length === str.length;
}

// Expects `negate` to be set by `negativeCompare` and doesn't rely on Jasmine's automatic matcher
// negation because when negated we don't want to early return `true` when looping over the array
// of strings and one is found to not match; they all need to not match
function matchWithAllTargets({pattern, flags, accuracy, avoidSubclass, rules, strings, targets}, {exact, negate}) {
  for (const target of targets) {
    const re = toRegExp(pattern, {accuracy, avoidSubclass, flags, rules, target});
    for (const str of strings) {
      // In case the regex includes flag g or y
      re.lastIndex = 0;
      const match = re.exec(str);
      const failed = negate ?
        ((exact && wasFullStrMatch(match, str)) || (!exact && match)) :
        ((exact && !wasFullStrMatch(match, str)) || (!exact && !match));
      if (failed) {
        return {
          pass: false,
          message: `Expected "${pattern}" ${flags ? `(flags ${flags}) ` : ''}${negate ? 'not ' : ''}to ${exact ? 'exactly match' : 'match within'} "${str}" (${target})`,
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
