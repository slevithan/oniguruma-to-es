import {toDetails, toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Recursion', () => {
  it('should throw if recursion used with strict accuracy', () => {
    expect(() => toDetails(r`a\g<0>?`, {accuracy: 'strict'})).toThrow();
    expect(() => toDetails('', {accuracy: 'strict'})).not.toThrow();
  });

  it('should throw if recursion used with null maxRecursionDepth', () => {
    expect(() => toDetails(r`a\g<0>?`, {maxRecursionDepth: null})).toThrow();
    expect(() => toDetails('', {maxRecursionDepth: null})).not.toThrow();
  });

  it('should throw if maxRecursionDepth is not null or an integer 2-100', () => {
    for (const value of [-2, 0, 1, 2.5, 101, Infinity, '2', '', undefined, NaN, false]) {
      expect(() => toDetails('', {maxRecursionDepth: value})).toThrow();
    }
  });

  describe('global', () => {
    it('should match direct recursion', () => {
      expect('aaabbb').toExactlyMatch(r`a\g<0>?b`);
      expect('test aaaaaabbb').toFindMatch(r`a\g<0>?b`);
      expect('aaabbb').toExactlyMatch(r`(?<n>a\g<0>?b)`);

      const pattern = r`<(?:[^<>]|\g<0>)*>`;
      expect([
        '<>', '<<>>', '<a<b<c>d>e>', '<<<<<<a>>>bc>>>',
      ]).toExactlyMatch(pattern);
      expect(
        'test > <balanced <<brackets>>> <> <<a>> < <b>'.match(toRegExp(pattern, {global: true}))
      ).toEqual(['<balanced <<brackets>>>', '<>', '<<a>>', '<b>']);
    });

    it('should throw for multiple direct, overlapping recursions', () => {
      expect(() => toDetails(r`a\g<0>?\g<0>?`)).toThrow();
    });

    it('should throw for leading 0s', () => {
      expect(() => toDetails(r`a\g<00>?`)).toThrow();
    });
  });

  describe('numbered', () => {
    it('should match direct recursion', () => {
      expect('aaa').toExactlyMatch(r`(a\g<1>?)`);
      expect('aaabbb').toExactlyMatch(r`\A(a\g<1>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(a\g<1>?b)\z`);
    });

    it('should throw for indirect recursion', () => {
      expect(() => toDetails(r`(a\g<2>(\g<1>?))`)).toThrow();
    });
  });

  describe('relative numbered', () => {
    it('should match direct recursion', () => {
      expect('aaa').toExactlyMatch(r`(a\g<-1>?)`);
      expect('aaabbb').toExactlyMatch(r`\A(a\g<-1>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(a\g<-1>?b)\z`);
    });

    it('should throw for indirect recursion', () => {
      expect(() => toDetails(r`(a\g<+1>(\g<-2>?))`)).toThrow();
    });

    it('should throw for relative 0', () => {
      expect(() => toDetails(r`a\g<-0>?`)).toThrow();
      expect(() => toDetails(r`a\g<+0>?`)).toThrow();
    });
  });

  describe('named', () => {
    it('should match direct recursion', () => {
      expect('aaabbb').toExactlyMatch(r`\A(?<r>a\g<r>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(?<r>a\g<r>?b)\z`);
    });

    it('should throw for multiple direct, overlapping recursions', () => {
      expect(() => toDetails(r`a\g<0>?(?<r>a\g<r>?)`)).toThrow();
      expect(() => toDetails(r`(?<r>a\g<r>?\g<r>?)`)).toThrow();
    });

    // Current limitation of `regex-recursion`
    it('should throw for multiple direct, non-overlapping recursions', () => {
      expect(() => toDetails(r`(?<r1>a\g<r1>?)(?<r2>a\g<r2>?)`)).toThrow();
    });

    it('should throw for multiple indirect, overlapping recursions', () => {
      expect(() => toDetails(r`(?<a>\g<b>(?<b>a\g<a>?))`)).toThrow();
    });

    // Current limitation of `regex-recursion`
    it('should throw for multiple indirect, non-overlapping recursions', () => {
      expect(() => toDetails(r`(?<a>\g<b>)(?<b>a\g<a>?)`)).toThrow();
      expect(() => toDetails(r`\g<a>(?<a>\g<b>)(?<b>a\g<a>?)`)).toThrow();
      expect(() => toDetails(r`(?<a>\g<b>)(?<b>\g<c>)(?<c>a\g<a>?)`)).toThrow();
    });
  });
});
