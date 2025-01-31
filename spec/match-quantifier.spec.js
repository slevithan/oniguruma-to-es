import {toRegExpDetails} from '../dist/esm/index.js';
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

  describe('possessive', () => {
    it('should not remember backtracking positions for repeated tokens', () => {
      // `++`
      expect('aaa').not.toFindMatch('a++.');
      expect('aaa1').toExactlyMatch('a++1');
      expect('aaa').not.toFindMatch(r`\u0061++.`);
      expect('aaa1').toExactlyMatch(r`\u0061++1`);
      // `*+`
      expect('aaa').not.toFindMatch('a*+.');
      expect('aaa1').toExactlyMatch('a*+1');
      // `?+`
      expect('a').not.toFindMatch('a?+.');
      expect('a1').toExactlyMatch('a?+1');
    });

    it('should not make interval quantifiers possessive with + suffix', () => {
      expect('aaa').toExactlyMatch('a{1,}+.');
    });

    it('should make interval quantifiers possessive with reversed range', () => {
      // Non-possessive
      expect('aaa').toExactlyMatch('a{1,10}.');
      // Possessive
      expect('aaa').not.toFindMatch('a{10,1}.');
      expect('aaa1').toExactlyMatch('a{10,1}1');
    });

    it('should work for character classes', () => {
      expect('aaa').not.toFindMatch('[a-z]++.');
      expect('aaa1').toExactlyMatch('[a-z]++1');
    });

    it('should work for groups', () => {
      expect('aaaa').not.toFindMatch('(a(a?))++.');
      expect('aaaa1').toExactlyMatch('(a(a?))++1');
    });

    it('should work for multiple possessive quantifiers', () => {
      expect('ab').toExactlyMatch('a++b++');
      expect('ab').toExactlyMatch('[a]++[b]++');
      expect('ab').toExactlyMatch('(a)++(b)++');
    });

    it('should work for nested possessive quantifiers', () => {
      expect('ababb').toExactlyMatch('(ab++)++');
      expect('ababb').toExactlyMatch('(a(b)++)++');
    });

    it('should be literal within character classes', () => {
      expect('*').toExactlyMatch('[.*+]');
    });
  });

  // TODO: Add me
  // describe('chaining', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('quantifiability', () => {
    it('should throw at start of pattern, group, or alternative', () => {
      expect(() => toRegExpDetails(r`+`)).toThrow();
      expect(() => toRegExpDetails(r`(+)`)).toThrow();
      expect(() => toRegExpDetails(r`|+`)).toThrow();
      expect(() => toRegExpDetails(r`(|+)`)).toThrow();
      expect(() => toRegExpDetails(r`(+|)`)).toThrow();
    });

    it('should throw if quantifying an assertion', () => {
      expect(() => toRegExpDetails(r`\A+`)).toThrow();
      expect(() => toRegExpDetails(r`\z+`)).toThrow();
      expect(() => toRegExpDetails(r`\Z+`)).toThrow();
      expect(() => toRegExpDetails(r`^+`)).toThrow();
      expect(() => toRegExpDetails(r`$+`)).toThrow();
      expect(() => toRegExpDetails(r`\G+`)).toThrow();
      expect(() => toRegExpDetails(r`\b+`)).toThrow();
      expect(() => toRegExpDetails(r`\B+`)).toThrow();
      expect(() => toRegExpDetails(r`(?=)+`)).toThrow();
      expect(() => toRegExpDetails(r`(?!)+`)).toThrow();
      expect(() => toRegExpDetails(r`(?<=)+`)).toThrow();
      expect(() => toRegExpDetails(r`(?<!)+`)).toThrow();
    });

    it('should throw if quantifying a directive', () => {
      expect(() => toRegExpDetails(r`\K+`)).toThrow();
      expect(() => toRegExpDetails(r`(?i)+`)).toThrow();
      expect(() => toRegExpDetails(r`(?-i)+`)).toThrow();
      expect(() => toRegExpDetails(r`(?i-m)+`)).toThrow();
    });
  });
});
