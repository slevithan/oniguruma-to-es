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

  it('should throw if maxRecursionDepth is not null or an integer 2-20', () => {
    for (const value of [-2, 0, 1, 2.5, 21, Infinity, '2', '', undefined, NaN, false]) {
      expect(() => toDetails('', {maxRecursionDepth: value})).toThrow();
    }
  });

  it('should allow maxRecursionDepth 2-20', () => {
    for (let i = 2; i <= 20; i++) {
      expect('a'.repeat(i)).toExactlyMatch({
        pattern: r`(a)\g<0>?`,
        maxRecursionDepth: i,
      });
    }
  });

  // Documenting current behavior
  it('should throw if backref used with recursion when the recursed subpattern contains captures', () => {
    expect(() => toDetails(r`(a)\1\g<0>?`)).toThrow();
    expect(() => toDetails(r`((a)\g<1>?)\k<1>`)).toThrow();
    expect(() => toDetails(r`((a)\g<1>?)()\k<3>`)).toThrow();
  });

  it('should match backref used with recursion when the recursed subpattern contains no captures', () => {
    expect('aaabaaa').toExactlyMatch(r`(a\g<1>?)b\k<1>`);
    expect('aaabaaa').toExactlyMatch(r`(?<a>a\g<a>?)b\k<a>`);
    expect('aaabb').toExactlyMatch(r`(?<a>a\g<a>?)(?<b>b)\k<b>`);
  });

  describe('global', () => {
    it('should match direct recursion', () => {
      expect('aaabbb').toExactlyMatch(r`a\g<0>?b`);
      expect('test aaaaaabbb').toFindMatch(r`a\g<0>?b`);
      expect('aaabbb').toExactlyMatch(r`(?<n>a\g<0>?b)`);

      const pattern = r`<(?:[^<>]|\g<0>)*>`;
      expect([
        '<>', '<<>>', '<a<b<c>d>e>', '<<<<<a>>bc>>>',
      ]).toExactlyMatch(pattern);
      expect(
        'test > <balanced <<brackets>>> <> <<a>> < <b>'.match(toRegExp(pattern, {global: true}))
      ).toEqual(['<balanced <<brackets>>>', '<>', '<<a>>', '<b>']);
    });

    it('should throw for leading 0s', () => {
      expect(() => toDetails(r`a\g<00>?`)).toThrow();
    });

    it('should throw for relative 0', () => {
      expect(() => toDetails(r`a\g<-0>?`)).toThrow();
      expect(() => toDetails(r`a\g<+0>?`)).toThrow();
    });

    it('should throw for overlapping recursions', () => {
      expect(() => toDetails(r`a\g<0>?\g<0>?`)).toThrow();
    });

    it('should exclude duplicated captures from result subpatterns', () => {
      expect(toRegExp(r`(a)\g<0>?`, {avoidSubclass: true, maxRecursionDepth: 2}).exec('aa')).toHaveSize(3);
      expect(toRegExp(r`(a)\g<0>?`).exec('aa')).toHaveSize(2);
      expect(toRegExp(r`(?<a>a)\g<0>?`).exec('aa')).toHaveSize(2);
    });
  });

  describe('numbered', () => {
    it('should match direct recursion', () => {
      expect('aaa').toExactlyMatch(r`(a\g<1>?)`);
      expect('aaabbb').toExactlyMatch(r`\A(a\g<1>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(a\g<1>?b)\z`);
    });

    it('should match direct, non-overlapping recursions', () => {
      expect('aabbcccddd').toExactlyMatch(r`(a\g<1>?b)(c\g<2>?d)`);
    });

    it('should throw for overlapping recursions', () => {
      expect(() => toDetails(r`(a\g<2>(\g<1>?))`)).toThrow();
    });

    it('should exclude duplicated captures from result subpatterns', () => {
      expect(toRegExp(r`\A((a)\g<1>?)\z`, {avoidSubclass: true, maxRecursionDepth: 2}).exec('aa')).toHaveSize(4);
      expect(toRegExp(r`\A((a)\g<1>?)\z`).exec('aa')).toHaveSize(3);
      expect(toRegExp(r`\A((a)\g<1>?)\g<1>\z`).exec('aaaa')).toHaveSize(3);
    });
  });

  describe('relative numbered', () => {
    it('should match direct recursion', () => {
      expect('aaa').toExactlyMatch(r`(a\g<-1>?)`);
      expect('aaabbb').toExactlyMatch(r`\A(a\g<-1>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(a\g<-1>?b)\z`);
    });

    it('should match direct, non-overlapping recursions', () => {
      expect('aabbcccddd').toExactlyMatch(r`(a\g<-1>?b)(c\g<-1>?d)`);
    });

    it('should throw for overlapping recursions', () => {
      expect(() => toDetails(r`(a\g<+1>(\g<-2>?))`)).toThrow();
    });

    it('should exclude duplicated captures from result subpatterns', () => {
      expect(toRegExp(r`\A((a)\g<-2>?)\z`, {avoidSubclass: true, maxRecursionDepth: 2}).exec('aa')).toHaveSize(4);
      expect(toRegExp(r`\A((a)\g<-2>?)\z`).exec('aa')).toHaveSize(3);
      expect(toRegExp(r`\A((a)\g<-2>?)\g<-2>\z`).exec('aaaa')).toHaveSize(3);
    });
  });

  describe('named', () => {
    it('should match direct recursion', () => {
      expect('aaabbb').toExactlyMatch(r`\A(?<r>a\g<r>?b)\z`);
      expect('aaabb').not.toFindMatch(r`\A(?<r>a\g<r>?b)\z`);
    });

    it('should match direct, non-overlapping recursions', () => {
      expect('aabbcccddd').toExactlyMatch(r`(?<a>a\g<a>?b)(?<b>c\g<b>?d)`);
    });

    it('should match indirect, non-overlapping recursions', () => {
      expect('aabbaabb').toExactlyMatch(r`(?<a>a\g<a>?b)\g<a>`);
      expect('aabbaabb').toExactlyMatch(r`\g<a>(?<a>a\g<a>?b)`);
      expect('acacdbdb1cacabdbd').toExactlyMatch(r`(?<a>a\g<b>?b)1(?<b>c\g<a>?d)`);
      expect('acacdbdb1acacdbdb2cacabdbd').toExactlyMatch(r`\g<a>1(?<a>a\g<b>?b)2(?<b>c\g<a>?d)`);
      expect('aceacefdbfdb1ceaceabfdbfd2eaceacdbfdbf').toExactlyMatch(r`(?<a>a\g<b>?b)1(?<b>c\g<c>?d)2(?<c>e\g<a>?f)`);
    });

    it('should throw for overlapping recursions', () => {
      expect(() => toDetails(r`a\g<0>?(?<r>a\g<r>?)`)).toThrow();
      expect(() => toDetails(r`(?<r>a\g<r>?\g<r>?)`)).toThrow();
      expect(() => toDetails(r`(?<a>\g<b>(?<b>a\g<a>?))`)).toThrow();
    });

    it('should exclude duplicated captures from result subpatterns', () => {
      expect(toRegExp(r`\A(?<a>(?<b>a)\g<a>?)\z`, {avoidSubclass: true, maxRecursionDepth: 2}).exec('aa')).toHaveSize(4);
      expect(toRegExp(r`\A(?<a>(?<b>a)\g<a>?)\z`).exec('aa')).toHaveSize(3);
      expect(toRegExp(r`\A(?<a>(?<b>a)\g<a>?)\g<a>\z`).exec('aaaa')).toHaveSize(3);
    });

    it('should transfer subroutine captures on match results', () => {
      expect(toRegExp(r`(?<r>[aA]\g<r>?[bB]) \g<r>`).exec('aaabbb AAABBB').groups.r).toBe('AAABBB');
      expect(toRegExp(r`\g<r> (?<r>[aA]\g<r>?[bB])`).exec('aaabbb AAABBB').groups.r).toBe('AAABBB');
      expect(toRegExp(r`(?<r>[aA]([xX])\g<r>?[bB]) \g<r>`, {rules: {captureGroup: true}}).exec('axaxbb AXAXBB')[2]).toBe('X');
      expect(toRegExp(r`\g<r> (?<r>[aA]([xX])\g<r>?[bB])`, {rules: {captureGroup: true}}).exec('axaxbb AXAXBB')[2]).toBe('X');
    });
  });
});
