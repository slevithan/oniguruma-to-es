import {compile} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Backreference', () => {
  describe('numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toMatchWithAllTargets(r`(a)\1`);
    });

    it('should throw if not enough captures to the left', () => {
      expect(() => compile(r`\1`)).toThrow();
      expect(() => compile(r`\1()`)).toThrow();
      expect(() => compile(r`\2`)).toThrow();
      expect(() => compile(r`()\2`)).toThrow();
      expect(() => compile(r`()\2()`)).toThrow();
    });

    it('should treat escaped number as octal if > 1 digit and not enough captures to the left', () => {
      expect(`123456789${String.fromCodePoint(0o10)}`).toMatchWithAllTargets(r`(1)(2)(3)(4)(5)(6)(7)(8)(9)\10`);
      expect('\u{1}8').toMatchWithAllTargets(r`()\18`);
    });

    it('should treat escaped number as identity escape if > 1 digit, not enough captures to the left, and not octal', () => {
      expect('80').toMatchWithAllTargets(r`()\80`);
    });

    it('should treat leading 0s as octal', () => {
      expect('a\u{1}').toMatchWithAllTargets(r`(a)\01`);
    });

    it('should allow 3 digit backrefs', () => {
      expect('aa').toMatchWithAllTargets(r`${'()'.repeat(99)}(a)\100`);
    });

    it('should throw for mixed named capture and numbered backrefs', () => {
      expect(() => compile(r`(?<a>)\1`)).toThrow();
    });
  });

  describe('enclosed numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toMatchWithAllTargets(r`(a)\k<1>`);
      expect('aa').toMatchWithAllTargets(r`(a)\k'1'`);
    });

    it('should throw if not enough captures to the left', () => {
      expect(() => compile(r`\k'1'`)).toThrow();
      expect(() => compile(r`\k<1>`)).toThrow();
      expect(() => compile(r`\k<1>()`)).toThrow();
      expect(() => compile(r`\k<2>`)).toThrow();
      expect(() => compile(r`()\k<2>`)).toThrow();
      expect(() => compile(r`()\k<2>()`)).toThrow();
    });

    it('should allow leading 0s', () => {
      expect('aa').toMatchWithAllTargets(r`(a)\k<01>`);
      expect('aa').toMatchWithAllTargets(r`(a)\k'01'`);
      expect('aa').toMatchWithAllTargets(r`(a)\k<000000000000001>`);
      expect('aa').toMatchWithAllTargets(r`(a)\k'000000000000001'`);
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => compile(r`(a)\k< 1 >`)).toThrow();
      expect(() => compile(r`(a)\k' 1 '`)).toThrow();
    });

    it('should allow 3 digit backrefs', () => {
      const caps99 = '()'.repeat(99);
      expect('aa').toMatchWithAllTargets(r`${caps99}(a)\k<100>`);
      expect('aa').toMatchWithAllTargets(r`${caps99}(a)\k'100'`);
    });

    it('should throw for mixed named capture and numbered backrefs', () => {
      expect(() => compile(r`(?<a>)\k<1>`)).toThrow();
      expect(() => compile(r`(?<a>)\k'1'`)).toThrow();
    });
  });

  // TODO: Rest

  // describe('relative backref number', () => {
  //   it('should', () => {
  //     expect('').toMatchWithAllTargets(r``);
  //   });
  // });

  // describe('enclosed relative backref number', () => {
  //   it('should', () => {
  //     expect('').toMatchWithAllTargets(r``);
  //   });
  // });

  // describe('nameed backref', () => {
  //   it('should', () => {
  //     expect('').toMatchWithAllTargets(r``);
  //   });
  // });
});
