import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

describe('Group', () => {
  beforeEach(() => {
    jasmine.addMatchers(matchers);
  });

  describe('atomic', () => {
    it('should not remember backtracking positions within atomic groups', () => {
      expect('abc').not.toFindMatch(`a(?>bc|b)c`);
      expect('abcc').toExactlyMatch(`a(?>bc|b)c`);
      expect('aaaaaab').not.toFindMatch(`(?>a+)ab`);
      expect('aaaaaab').toExactlyMatch(`(?>a)+ab`);
    });

    it('should allow quantifying atomic groups', () => {
      expect('one two').toExactlyMatch(r`(?>\w+\s?)+`);
    });

    it('should work for multiple atomic groups', () => {
      expect('ab').toExactlyMatch(`(?>a)(?>b)`);
    });

    it('should work for nested atomic groups', () => {
      expect('integerrr+').toExactlyMatch(r`\b(?>int(?>eger+)?|insert)\b(?>.)`);
      expect('integerrr+').not.toFindMatch(r`\b(?>int(?>eger+)??|insert)\b(?>.)`);
    });

    it('should work when named capturing groups present', () => {
      expect('abcc').toExactlyMatch(`(?<n>)a(?>bc|b)c`);
      expect('abc').not.toFindMatch(`(?<n>)a(?>bc|b)c`);
      expect('abcc').toExactlyMatch(`a(?>(?<n>)bc|b)c`);
      expect('abc').not.toFindMatch(`a(?>(?<n>)bc|b)c`);
    });

    it('should work when unnamed capturing groups present', () => {
      expect('abcc').toExactlyMatch(`()a(?>bc|b)c`);
      expect('abc').not.toFindMatch(`()a(?>bc|b)c`);
      expect('abcc').toExactlyMatch(`a(?>()bc|b)c`);
      expect('abc').not.toFindMatch(`a(?>()bc|b)c`);
    });

    it('should work with numbered backreferences', () => {
      expect('aax').toExactlyMatch(r`(a)\1(?>x)`);
      expect('xaa').toExactlyMatch(r`(?>x(a)\1)`);
      expect('xaa').toExactlyMatch(r`(?>x)(a)\1`);
      expect('aaabababcabc').toExactlyMatch(r`(a)\1(?>\1(b)\1\2(?>\1\2))(c)\1\2\3`);
    });

    it('should handle regression cases', () => {
      expect('[').toExactlyMatch(r`(?>[\[])`);
    });
  });

  // TODO: Add me
  // describe('flags', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  // TODO: Add me
  // describe('noncapturing', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });
});
