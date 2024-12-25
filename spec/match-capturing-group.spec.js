import {toDetails} from '../dist/index.mjs';
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
    it('should keep only the first of duplicate names per alternation path with target ES2025', () => {
      const opts = {
        target: 'ES2025',
        verbose: true,
      };
      const tests = [
        ['(?<a>)(?<a>)', '(?<a>)()'],
        ['(?<a>)|(?<a>)', '(?<a>)|(?<a>)'],
        ['((?<a>)|(?<a>))', '(?:(?<a>)|(?<a>))'],
        ['(?<a>)(((?<a>)))', '(?<a>)(?:(?:()))'],
        ['(((?<a>)))(?<a>)', '(?:(?:(?<a>)))()'],
        ['(?<a>)|(((?<a>)))', '(?<a>)|(?:(?:(?<a>)))'],
        ['(((?<a>)))|(?<a>)', '(?:(?:(?<a>)))|(?<a>)'],
        ['(?<a>(?<a>))', '(?<a>())'],
        ['(?<a>(?<a>))|(?<a>)', '(?<a>())|(?<a>)'],
        ['(?<a>)(?<a>)(|(?<a>))(?<a>)', '(?<a>)()(?:|())()'],
        ['((?<a>)(?<a>))(((?<a>)|(?<a>)))((?<a>))', '(?:(?<a>)())(?:(?:()|()))(?:())'],
        ['(?<a>)(?<a>)((?<a>)|(?<a>))', '(?<a>)()(?:()|())'],
        ['((?<a>)|(?<a>))(?<a>)(?<a>)', '(?:(?<a>)|(?<a>))()()'],
      ];
      for (const [pattern, output] of tests) {
        expect(toDetails(pattern, opts).pattern).toBe(output);
      }
    });

    it('should keep only the first of duplicate names with target < ES2025', () => {
      const opts = {
        target: 'ES2024',
        verbose: true,
      };
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
        expect(toDetails(pattern, opts).pattern).toBe(output);
      }
    });

    // TODO: Add remaining
  });
});
