import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Quantifier', () => {
  describe('greedy', () => {
    // TODO: Add me
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });

  describe('lazy', () => {
    // TODO: Add me
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });

  describe('possessive', () => {
    // TODO: Add me
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });

  describe('quantifiability', () => {
    it('should throw at start of pattern, group, or alternative', () => {
      expect(() => compile(r`+`)).toThrow();
      expect(() => compile(r`(+)`)).toThrow();
      expect(() => compile(r`|+`)).toThrow();
      expect(() => compile(r`(|+)`)).toThrow();
      expect(() => compile(r`(+|)`)).toThrow();
    });

    it('should throw if quantifying an assertion', () => {
      expect(() => compile(r`\A+`)).toThrow();
      expect(() => compile(r`\z+`)).toThrow();
      expect(() => compile(r`\Z+`)).toThrow();
      expect(() => compile(r`^+`)).toThrow();
      expect(() => compile(r`$+`)).toThrow();
      expect(() => compile(r`\G+`)).toThrow();
      expect(() => compile(r`\b+`)).toThrow();
      expect(() => compile(r`\B+`)).toThrow();
      expect(() => compile(r`(?=)+`)).toThrow();
      expect(() => compile(r`(?!)+`)).toThrow();
      expect(() => compile(r`(?<=)+`)).toThrow();
      expect(() => compile(r`(?<!)+`)).toThrow();
    });

    it('should throw if quantifying a directive', () => {
      expect(() => compile(r`\K+`)).toThrow();
      expect(() => compile(r`(?i)+`)).toThrow();
      expect(() => compile(r`(?-i)+`)).toThrow();
    });
  });
});
