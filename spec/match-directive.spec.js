import {toDetails, toRegExp} from '../dist/esm/index.js';
import {r} from '../src/utils.js';
import {maxTestTargetForFlagGroups} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Directive', () => {
  // TODO: Add me
  // describe('flags', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('keep', () => {
    it('should reset the match start position', () => {
      expect(toRegExp(r`a\Kb`).exec('ab')[0]).toBe('b');
      expect(['a', 'b']).not.toFindMatch(r`a\Kb`);
    });

    it('should allow with a leading flag directive', () => {
      expect(toRegExp(r`(?x) a \K b`).exec('ab')[0]).toBe('b');
      expect(['a', 'b']).not.toFindMatch({
        pattern: r`(?i)a\Kb`,
        maxTestTarget: maxTestTargetForFlagGroups,
      });
    });

    it('should allow within a pattern-wrapping noncapturing nonquantified consumptive group', () => {
      expect(toRegExp(r`(?:a\Kb)`).exec('ab')[0]).toBe('b');
      expect(toRegExp(r`(?>a\Kb)`).exec('ab')[0]).toBe('b');
      expect(toRegExp(r`(?i:a\Kb)`).exec('ab')[0]).toBe('b');
    });

    it('should throw if used within a pattern-wrapping lookaround', () => {
      expect(() => toDetails(r`(?=a\Kb)`)).toThrow();
      expect(() => toDetails(r`(?<=a\Kb)`)).toThrow();
    });

    // Not emulatable
    it('should throw if used within a pattern-wrapping capturing group', () => {
      expect(() => toDetails(r`(a\Kb)`)).toThrow();
      expect(() => toDetails(r`(?<n>a\Kb)`)).toThrow();
    });

    // Not emulatable
    it('should throw if used within a pattern-wrapping quantified group', () => {
      expect(() => toDetails(r`(?:a\Kb)+`)).toThrow();
    });

    it('should throw if used within a non-pattern-wrapping group', () => {
      expect(() => toDetails(r`(?:a\Kb)c`)).toThrow();
      expect(() => toDetails(r`a(?:b\Kc)`)).toThrow();
      expect(() => toDetails(r`(a\Kb)c`)).toThrow();
      expect(() => toDetails(r`(?<n>a\Kb)c`)).toThrow();
      expect(() => toDetails(r`(?>a\Kb)c`)).toThrow();
      expect(() => toDetails(r`(?i:a\Kb)c`)).toThrow();
      expect(() => toDetails(r`(?=a\Kb)c`)).toThrow();
      expect(() => toDetails(r`(?<=a\Kb)c`)).toThrow();
    });

    it('should allow multiple uses', () => {
      expect(toRegExp(r`a\Kb\Kc`).exec('abc')[0]).toBe('c');
      expect(['c', 'bc']).not.toFindMatch(r`a\Kb`);
    });

    // Documenting current behavior
    it('should throw if top-level alternation present', () => {
      // `\K` is emulatable at least within top-level alternation, but it's tricky. Ex: `ab\Kc|a`
      // is equivalent to `(?<=ab)c|a(?!bc)`, not simply `(?<=ab)c|a`
      expect(() => toDetails(r`a\Kb|c`)).toThrow();
      expect(() => toDetails(r`a|b\Kc`)).toThrow();
    });
  });
});
