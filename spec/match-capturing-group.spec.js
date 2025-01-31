import {toRegExp, toRegExpDetails} from '../dist/esm/index.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CapturingGroup', () => {
  // TODO: Add me
  // describe('numbered', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch('');
  //   });
  // });

  describe('named', () => {
    it('should preserve the name only for the first instance of duplicate names', () => {
      const tests = [
        ['(?<a>)(?<a>)', '(?<a>)()'],
        ['(?<a>)|(?<a>)', '(?<a>)|()'],
        ['((?<a>)|(?<a>))', '(?:(?<a>)|())'],
        ['(?<a>)(((?<a>)))', '(?<a>)(?:(?:()))'],
        ['(((?<a>)))(?<a>)', '(?:(?:(?<a>)))()'],
        ['(?<a>)|(((?<a>)))', '(?<a>)|(?:(?:()))'],
        ['(((?<a>)))|(?<a>)', '(?:(?:(?<a>)))|()'],
        ['(?<a>(?<a>))', '(?<a>())'],
        ['(?<a>(?<a>))|(?<a>)', '(?<a>())|()'],
        ['(?<a>)(?<a>)(|(?<a>))(?<a>)', '(?<a>)()(?:|())()'],
        ['((?<a>)(?<a>))(((?<a>)|(?<a>)))((?<a>))', '(?:(?<a>)())(?:(?:()|()))(?:())'],
        ['(?<a>)(?<a>)((?<a>)|(?<a>))', '(?<a>)()(?:()|())'],
        ['((?<a>)|(?<a>))(?<a>)(?<a>)', '(?:(?<a>)|())()()'],
      ];
      for (const [pattern, output] of tests) {
        expect(toRegExpDetails(pattern, {verbose: true}).pattern).toBe(output);
      }
    });

    it('should store subpattern values from the first instance of duplicate names', () => {
      const match = toRegExp('(?<n>.)(?<n>.)').exec('ab');
      expect(match.groups.n).toBe('a');
      expect([...match]).toEqual(['ab', 'a', 'b']);
    });

    // Matches Oniguruma behavior; ES2025 (which allows duplicate names across mutually exclusive
    // alternation) differs since it would store the matched value from the participating group
    it('should store subpattern values from the first instance of duplicate names in separate alternation paths', () => {
      const re = toRegExp('(?<n>a)(?<n>b)|(?<n>c)(?<n>d)');

      const match1 = re.exec('ab');
      expect(match1.groups.n).toBe('a');
      expect([...match1]).toEqual(['ab', 'a', 'b', undefined, undefined]);

      const match2 = re.exec('cd');
      expect(match2.groups.n).toBe(undefined);
      expect([...match2]).toEqual(['cd', undefined, undefined, 'c', 'd']);
    });

    // TODO: Add remaining
  });
});
