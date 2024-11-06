import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Quantifier', () => {
  // TODO: Add me
  // describe('greedy', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  // TODO: Add me
  // describe('lazy', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  // TODO: Add me
  // describe('possessive', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('quantifiability', () => {
    it('should throw at start of pattern, group, or alternative', () => {
      expect(() => toDetails(r`+`)).toThrow();
      expect(() => toDetails(r`(+)`)).toThrow();
      expect(() => toDetails(r`|+`)).toThrow();
      expect(() => toDetails(r`(|+)`)).toThrow();
      expect(() => toDetails(r`(+|)`)).toThrow();
    });

    it('should throw if quantifying an assertion', () => {
      expect(() => toDetails(r`\A+`)).toThrow();
      expect(() => toDetails(r`\z+`)).toThrow();
      expect(() => toDetails(r`\Z+`)).toThrow();
      expect(() => toDetails(r`^+`)).toThrow();
      expect(() => toDetails(r`$+`)).toThrow();
      expect(() => toDetails(r`\G+`)).toThrow();
      expect(() => toDetails(r`\b+`)).toThrow();
      expect(() => toDetails(r`\B+`)).toThrow();
      expect(() => toDetails(r`(?=)+`)).toThrow();
      expect(() => toDetails(r`(?!)+`)).toThrow();
      expect(() => toDetails(r`(?<=)+`)).toThrow();
      expect(() => toDetails(r`(?<!)+`)).toThrow();
    });

    it('should throw if quantifying a directive', () => {
      expect(() => toDetails(r`\K+`)).toThrow();
      expect(() => toDetails(r`(?i)+`)).toThrow();
      expect(() => toDetails(r`(?-i)+`)).toThrow();
      expect(() => toDetails(r`(?i-m)+`)).toThrow();
    });
  });
});
