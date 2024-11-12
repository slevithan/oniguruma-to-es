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
    it('should keep only the last of duplicate names per alternation path with target ES2025', () => {
      const opts = {
        target: 'ES2025',
        verbose: true,
      };
      const tests = [
        ['(?<a>)(?<a>)', '()(?<a>)'],
        ['(?<a>)|(?<a>)', '(?<a>)|(?<a>)'],
        ['((?<a>)|(?<a>))', '(?:(?<a>)|(?<a>))'],
        ['(?<a>)(((?<a>)))', '()(?:(?:(?<a>)))'],
        ['(((?<a>)))(?<a>)', '(?:(?:()))(?<a>)'],
        ['(?<a>)|(((?<a>)))', '(?<a>)|(?:(?:(?<a>)))'],
        ['(((?<a>)))|(?<a>)', '(?:(?:(?<a>)))|(?<a>)'],
        ['(?<a>(?<a>))', '((?<a>))'],
        ['(?<a>(?<a>))|(?<a>)', '((?<a>))|(?<a>)'],
        ['(?<a>)(?<a>)(|(?<a>))(?<a>)', '()()(?:|())(?<a>)'],
        ['((?<a>)(?<a>))(((?<a>)|(?<a>)))((?<a>))', '(?:()())(?:(?:()|()))(?:(?<a>))'],
        ['(?<a>)(?<a>)((?<a>)|(?<a>))', '()()(?:(?<a>)|(?<a>))'],
      ];
      for (const [pattern, output] of tests) {
        expect(toDetails(pattern, opts).pattern).toBe(output);
      }
    });

    it('should convert all but one duplicate name to an unnamed capture with target < ES2025', () => {
      const opts = {
        target: 'ES2024',
        verbose: true,
      };
      // Current behavior is to:
      // 1. First, keep only the last instance of the name per alternation path (like for ES2025).
      // 2. Next, strip duplicate names from all but the first alternative that includes it.
      // Keeping only the last instance per alternation path (step 1) is important for correctness,
      // but the choice of which path to keep the name for in step 2 is arbitrary. The current
      // approach of keeping the first remaining instance of the name rather than the last is
      // merely for implementation simplicity, and could change in the future
      const tests = [
        ['(?<a>)(?<a>)', '()(?<a>)'],
        ['(?<a>)|(?<a>)', '(?<a>)|()'],
        ['((?<a>)|(?<a>))', '(?:(?<a>)|())'],
        ['(?<a>)(((?<a>)))', '()(?:(?:(?<a>)))'],
        ['(((?<a>)))(?<a>)', '(?:(?:()))(?<a>)'],
        ['(?<a>)|(((?<a>)))', '(?<a>)|(?:(?:()))'],
        ['(((?<a>)))|(?<a>)', '(?:(?:(?<a>)))|()'],
        ['(?<a>(?<a>))', '((?<a>))'],
        ['(?<a>(?<a>))|(?<a>)', '((?<a>))|()'],
        ['(?<a>)(?<a>)(|(?<a>))(?<a>)', '()()(?:|())(?<a>)'],
        ['((?<a>)(?<a>))(((?<a>)|(?<a>)))((?<a>))', '(?:()())(?:(?:()|()))(?:(?<a>))'],
        ['(?<a>)(?<a>)((?<a>)|(?<a>))', '()()(?:(?<a>)|())'],
      ];
      for (const [pattern, output] of tests) {
        expect(toDetails(pattern, opts).pattern).toBe(output);
      }
    });

    // TODO: Add remaining
  });
});
