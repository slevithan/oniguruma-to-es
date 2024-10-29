import {compile} from '../dist/index.mjs';
import {cp, r} from '../src/utils.js';
import {duplicateCaptureNamesSupported} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Backreference', () => {
  describe('numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\1`);
    });

    it('should throw if not enough captures to the left', () => {
      expect(() => compile(r`\1`)).toThrow();
      expect(() => compile(r`\1()`)).toThrow();
      expect(() => compile(r`\2`)).toThrow();
      expect(() => compile(r`()\2`)).toThrow();
      expect(() => compile(r`()\2()`)).toThrow();
    });

    it('should treat escaped number as octal if > 1 digit and not enough captures to the left', () => {
      expect(`123456789${cp(0o10)}`).toExactlyMatch(r`(1)(2)(3)(4)(5)(6)(7)(8)(9)\10`);
      expect('\u{1}8').toExactlyMatch(r`()\18`);
    });

    it('should treat escaped number as identity escape if > 1 digit, not enough captures to the left, and not octal', () => {
      expect('80').toExactlyMatch(r`()\80`);
    });

    it('should treat numbers with leading 0s as octal', () => {
      expect('a\u{1}').toExactlyMatch(r`(a)\01`);
    });

    it('should allow 3-digit backrefs', () => {
      expect('aa').toExactlyMatch(r`${'()'.repeat(99)}(a)\100`);
    });

    it('should throw for mixed named capture and numbered backrefs', () => {
      expect(() => compile(r`(?<a>)\1`)).toThrow();
    });
  });

  describe('enclosed numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\k<1>`);
      expect('aa').toExactlyMatch(r`(a)\k'1'`);
    });

    it('should throw if not enough captures to the left', () => {
      expect(() => compile(r`\k<1>`)).toThrow();
      expect(() => compile(r`\k'1'`)).toThrow();
      expect(() => compile(r`\k<1>()`)).toThrow();
      expect(() => compile(r`\k<2>`)).toThrow();
      expect(() => compile(r`()\k<2>`)).toThrow();
      expect(() => compile(r`()\k<2>()`)).toThrow();
    });

    it('should throw for group 0', () => {
      expect(() => compile(r`()\k<0>`)).toThrow();
      expect(() => compile(r`()\k'0'`)).toThrow();
    });

    it('should allow leading 0s', () => {
      expect('aa').toExactlyMatch(r`(a)\k<01>`);
      expect('aa').toExactlyMatch(r`(a)\k'01'`);
      expect('aa').toExactlyMatch(r`(a)\k<000000000000001>`);
      expect('aa').toExactlyMatch(r`(a)\k'000000000000001'`);
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => compile(r`()\k< 1 >`)).toThrow();
      expect(() => compile(r`()\k' 1 '`)).toThrow();
    });

    it('should allow 3-digit backrefs', () => {
      const caps99 = '()'.repeat(99);
      expect('aa').toExactlyMatch(r`${caps99}(a)\k<100>`);
      expect('aa').toExactlyMatch(r`${caps99}(a)\k'100'`);
    });

    it('should allow 4-digit backrefs', () => {
      expect('aa').toExactlyMatch(r`${'()'.repeat(999)}(a)\k<1000>`);
    });

    it('should throw for mixed named capture and numbered backrefs', () => {
      expect(() => compile(r`(?<a>)\k<1>`)).toThrow();
      expect(() => compile(r`(?<a>)\k'1'`)).toThrow();
    });
  });

  describe('relative backref number', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\k<-1>`);
      expect('aa').toExactlyMatch(r`(a)\k'-1'`);
    });

    it('should throw if not enough captures to the left', () => {
      expect(() => compile(r`\k<-1>`)).toThrow();
      expect(() => compile(r`\k'-1'`)).toThrow();
      expect(() => compile(r`\k<-1>()`)).toThrow();
      expect(() => compile(r`\k<-2>`)).toThrow();
      expect(() => compile(r`()\k<-2>`)).toThrow();
      expect(() => compile(r`()\k<-2>()`)).toThrow();
    });

    it('should throw for negative 0', () => {
      expect(() => compile(r`()\k<-0>`)).toThrow();
      expect(() => compile(r`()\k'-0'`)).toThrow();
    });

    it('should allow leading 0s', () => {
      expect('aa').toExactlyMatch(r`(a)\k<-01>`);
      expect('aa').toExactlyMatch(r`(a)\k'-01'`);
      expect('aa').toExactlyMatch(r`(a)\k<-000000000000001>`);
      expect('aa').toExactlyMatch(r`(a)\k'-000000000000001'`);
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => compile(r`()\k< -1 >`)).toThrow();
      expect(() => compile(r`()\k' -1 '`)).toThrow();
    });

    it('should allow 3-digit numbers', () => {
      const caps99 = '()'.repeat(99);
      expect('aa').toExactlyMatch(r`(a)${caps99}\k<-100>`);
      expect('aa').toExactlyMatch(r`(a)${caps99}\k'-100'`);
    });

    it('should allow 4-digit numbers', () => {
      expect('aa').toExactlyMatch(r`(a)${'()'.repeat(999)}\k<-1000>`);
    });

    it('should throw for mixed named capture and relative numbered backrefs', () => {
      expect(() => compile(r`(?<a>)\k<-1>`)).toThrow();
      expect(() => compile(r`(?<a>)\k'-1'`)).toThrow();
    });

    it('should throw for forward relative numbers', () => {
      expect(() => compile(r`()\k<+1>()`)).toThrow();
      expect(() => compile(r`()\k'+1'()`)).toThrow();
    });
  });

  describe('named backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(?<n>a)\k<n>`);
      expect('aa').toExactlyMatch(r`(?'n'a)\k'n'`);
      expect('aa').toExactlyMatch(r`(?'n'a)\k<n>`);
      expect('aa').toExactlyMatch(r`(?<n>a)\k'n'`);
    });

    it('should throw if capture is not to the left', () => {
      expect(() => compile(r`\k<n>`)).toThrow();
      expect(() => compile(r`\k'n'`)).toThrow();
      expect(() => compile(r`\k<n>(?<n>)`)).toThrow();
      expect(() => compile(r`\k'n'(?'n')`)).toThrow();
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => compile(r`(?<n>)\k< n >`)).toThrow();
      expect(() => compile(r`(?'n')\k' n '`)).toThrow();
    });

    it('should throw for invalid names', () => {
      expect(() => compile(r`(?<n-n>)\k<n-n>`)).toThrow();
      expect(() => compile(r`(?<n+n>)\k<n+n>`)).toThrow();
    });

    it('should reference the group to the left when there are duplicate names to the right', () => {
      expect('aab').toExactlyMatch(r`(?<n>a)\k<n>(?<n>b)`);
      expect('aa').toExactlyMatch({
        pattern: r`(?<n>a)\k<n>|(?<n>b)`,
        targetMax: duplicateCaptureNamesSupported ? null : 'ES2024',
      });
    });

    it('should multiplex for duplicate names to the left', () => {
      expect([
        'aba', 'abb',
      ]).toExactlyMatch(r`(?<n>a)(?<n>b)\k<n>`);
      expect([
        'abca', 'abcb', 'abcc',
      ]).toExactlyMatch(r`(?<n>a)(?<n>b)(?<n>c)\k<n>`);
    });

    // TODO: Subroutine backrefs
  });
});
