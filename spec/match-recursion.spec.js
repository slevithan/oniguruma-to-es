import {compile, toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Recursion', () => {
  describe('global', () => {
    it('should match an equal number of two different subpatterns', () => {
      expect('aaabbb').toExactlyMatch(r`a\g<0>?b`);
      expect('test aaaaaabbb').toFindMatch(r`a\g<0>?b`);
      expect('aaabbb').toExactlyMatch(r`(?<n>a\g<0>?b)`);
    });

    it('should match balanced brackets', () => {
      const pattern = r`<(?:[^<>]|\g<0>)*>`;
      expect([
        '<>', '<<>>', '<a<b<c>d>e>', '<<<<<<a>>>bc>>>',
      ]).toExactlyMatch(pattern);
      expect(
        'test > <balanced <<brackets>>> <> <<a>> < <b>'.match(toRegExp(pattern, 'g'))
      ).toEqual(['<balanced <<brackets>>>', '<>', '<<a>>', '<b>']);
    });

    it('should throw for multiple overlapping recursions', () => {
      expect(() => compile(r`a\g<0>?\g<0>?`)).toThrow();
    });

    it('should throw for leading 0s', () => {
      expect(() => compile(r`a\g<00>?`)).toThrow();
    });
  });

  describe('numbered', () => {
    // Current limitation of `regex-recursion`
    it('should throw for recursion by number', () => {
      expect(() => compile(r`(a\g<1>?)`)).toThrow();
      expect(() => compile(r`(a\g<2>(\g<1>?))`)).toThrow();
    });
  });

  describe('relative numbered', () => {
    it('should throw for relative 0', () => {
      expect(() => compile(r`a\g<-0>?`)).toThrow();
      expect(() => compile(r`a\g<+0>?`)).toThrow();
    });

    // Current limitation of `regex-recursion`
    it('should throw for recursion by number', () => {
      expect(() => compile(r`(a\g<-1>?)`)).toThrow();
      expect(() => compile(r`(a\g<+1>(\g<-2>?))`)).toThrow();
    });
  });

  describe('named', () => {
    it('should match an equal number of two different subpatterns', () => {
      expect('aaabbb').toExactlyMatch(r`\A(?<r>a\g<r>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(?<r>a\g<r>?b)\z`);
    });

    it('should throw for multiple direct, overlapping recursions', () => {
      expect(() => compile(r`a\g<0>?(?<r>a\g<r>?)`)).toThrow();
      expect(() => compile(r`(?<r>a\g<r>?\g<r>?)`)).toThrow();
    });

    // Current limitation of `regex-recursion`
    it('should throw for multiple direct, non-overlapping recursions', () => {
      // TODO: `regex-recursion` has a bug so using `toRegExp` instead of `compile`
      expect(() => toRegExp(r`(?<r1>a\g<r1>?)(?<r2>a\g<r2>?)`)).toThrow();
    });

    it('should throw for multiple indirect, overlapping recursions', () => {
      expect(() => compile(r`(?<a>\g<b>(?<b>a\g<a>?))`)).toThrow();
    });

    // Current limitation of `regex-recursion`
    it('should throw for multiple indirect, non-overlapping recursions', () => {
      expect(() => compile(r`(?<a>\g<b>)(?<b>a\g<a>?)`)).toThrow();
      expect(() => compile(r`\g<a>(?<a>\g<b>)(?<b>a\g<a>?)`)).toThrow();
      expect(() => compile(r`(?<a>\g<b>)(?<b>\g<c>)(?<c>a\g<a>?)`)).toThrow();
    });
  });
});
