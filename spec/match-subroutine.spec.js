import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Subroutine', () => {
  // TODO: Test that subroutines use the flags that apply to their reffed group

  describe('numbered', () => {
    it('should match the expression within the referenced group', () => {
      expect('aa').toExactlyMatch(r`(a)\g<1>`);
      expect('aa').toExactlyMatch(r`(a)\g'1'`);
      expect('babab').toExactlyMatch(r`b(a)b\g<1>b`);
    });

    it('should allow a subroutine to come before the referenced group', () => {
      expect('aa').toExactlyMatch(r`\g<1>(a)`);
      expect('aa').toExactlyMatch(r`(\g<2>(a))`);
    });

    it('should throw if referencing a missing group', () => {
      expect(() => toDetails(r`\g<1>`)).toThrow();
      expect(() => toDetails(r`()\g<2>`)).toThrow();
      expect(() => toDetails(r`(\g<2>)`)).toThrow();
    });

    it('should throw if referencing a named group by number', () => {
      expect(() => toDetails(r`(?<a>)\g<1>`)).toThrow();
      expect(() => toDetails(r`\g<1>(?<a>)`)).toThrow();
    });

    it('should allow referencing groups that contain subroutines', () => {
      expect('ababa').toExactlyMatch(r`(a)(b\g<1>)\g<2>`);
      expect('ababa').toExactlyMatch(r`(a)\g<2>(b\g<1>)`);
      expect('baaba').toExactlyMatch(r`\g<2>(a)(b\g<1>)`);
      expect('abcbcc').toExactlyMatch(r`(a\g<2>)(b\g<3>)(c)`);
    });
  });

  describe('relative numbered', () => {
    it('should match the expression within the referenced group', () => {
      expect('aa').toExactlyMatch(r`(a)\g<-1>`);
      expect('aa').toExactlyMatch(r`(a)\g'-1'`);
      expect('babab').toExactlyMatch(r`b(a)b\g<-1>b`);
    });

    it('should allow a subroutine to come before the referenced group', () => {
      expect('aa').toExactlyMatch(r`\g<+1>(a)`);
      expect('aa').toExactlyMatch(r`\g'+1'(a)`);
      expect('aa').toExactlyMatch(r`(\g<+1>(a))`);
    });

    it('should throw if referencing a missing group', () => {
      expect(() => toDetails(r`\g<-1>`)).toThrow();
      expect(() => toDetails(r`\g<+1>`)).toThrow();
      expect(() => toDetails(r`()\g<-2>`)).toThrow();
      expect(() => toDetails(r`()\g<+1>`)).toThrow();
      expect(() => toDetails(r`(\g<-2>)`)).toThrow();
      expect(() => toDetails(r`(\g<+1>)`)).toThrow();
    });

    it('should throw if referencing a named group by relative number', () => {
      expect(() => toDetails(r`(?<a>)\g<-1>`)).toThrow();
      expect(() => toDetails(r`\g<+1>(?<a>)`)).toThrow();
    });

    it('should allow referencing groups that contain subroutines', () => {
      expect('ababa').toExactlyMatch(r`(a)(b\g<-2>)\g<-1>`);
      expect('ababa').toExactlyMatch(r`(a)\g<+1>(b\g<-2>)`);
      expect('baaba').toExactlyMatch(r`\g<+2>(a)(b\g<-2>)`);
      expect('abcbcc').toExactlyMatch(r`(a\g<+1>)(b\g<+1>)(c)`);
    });
  });

  describe('named', () => {
    it('should match the expression within the referenced group', () => {
      expect('aa').toExactlyMatch(r`(?<a>a)\g<a>`);
      expect('aa').toExactlyMatch(r`(?<a>a)\g'a'`);
      expect('babab').toExactlyMatch(r`b(?<a>a)b\g<a>b`);
    });

    it('should allow a subroutine to come before the referenced group', () => {
      expect('aa').toExactlyMatch(r`\g<a>(?<a>a)`);
      expect('aa').toExactlyMatch(r`(?<a>\g<b>(?<b>a))`);
    });
  
    it('should throw if referencing a missing group', () => {
      expect(() => toDetails(r`\g<a>`)).toThrow();
      expect(() => toDetails(r`(?<a>)\g<b>`)).toThrow();
      expect(() => toDetails(r`(?<a>\g<b>)`)).toThrow();
    });

    it('should throw if referencing a duplicate group name', () => {
      expect(() => toDetails(r`(?<a>)(?<a>)\g<a>`)).toThrow();
      expect(() => toDetails(r`(?<a>)\g<a>(?<a>)`)).toThrow();
      expect(() => toDetails(r`\g<a>(?<a>)(?<a>)`)).toThrow();
      expect(() => toDetails(r`(?<a>(?<a>))\g<a>`)).toThrow();
      expect(() => toDetails(r`(?<a>)(?<a>\g<a>?)`)).toThrow();
      expect(() => toDetails(r`(?<a>(?<a>\g<a>?))`)).toThrow();
    });

    it('should allow referencing groups that contain subroutines', () => {
      expect('ababa').toExactlyMatch(r`(?<a>a)(?<b>b\g<a>)\g<b>`);
      expect('ababa').toExactlyMatch(r`(?<a>a)\g<b>(?<b>b\g<a>)`);
      expect('baaba').toExactlyMatch(r`\g<b>(?<a>a)(?<b>b\g<a>)`);
      expect('abcbcc').toExactlyMatch(r`(?<a>a\g<b>)(?<b>b\g<c>)(?<c>c)`);
    });
  });
});
