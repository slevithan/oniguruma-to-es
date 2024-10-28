import {toRegExp} from '../../dist/index.mjs';
import {Target} from '../../src/utils.js';

const targets = Object.keys(Target);

export const matchers = {
  toMatchWithAllTargets() {
    return {
      compare(actual, expected) {
        const pattern = typeof expected === 'string' ? expected : expected.pattern;
        const flags = expected?.flags ?? '';
        for (const target of targets) {
          const re = toRegExp(pattern, flags, {target});
          if (!re.test(actual)) {
            return {
              pass: false,
              message: `Expected "${actual}" to match "${pattern}" with ${flags ? `flags "${flags}" and ` : ''}target ${target}`,
            };
          }
        }
        return {pass: true};
      },
    };
  },
};
