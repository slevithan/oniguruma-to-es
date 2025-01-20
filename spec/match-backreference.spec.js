import {toDetails} from '../dist/esm/index.js';
import {cp, r} from '../src/utils.js';
import {maxTestTargetForFlagGroups, minTestTargetForFlagGroups} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Backreference', () => {
  it(r`should match incomplete \k as identity escape`, () => {
    expect('k').toExactlyMatch(r`\k`);
  });

  it(r`should throw for incomplete \k< or \k'`, () => {
    expect(() => toDetails(r`\k<`)).toThrow();
    expect(() => toDetails(r`\k'`)).toThrow();
    expect(() => toDetails(r`(?<aa>)\k<aa`)).toThrow();
    expect(() => toDetails(r`()\k<1`)).toThrow();
  });

  describe('numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\1`);
    });

    it('should throw if group not defined', () => {
      expect(() => toDetails(r`\1`)).toThrow();
      expect(() => toDetails(r`()\2`)).toThrow();
      expect(() => toDetails(r`(()\3)`)).toThrow();
    });

    it('should throw if group not defined even when subroutines add captures', () => {
      expect(() => toDetails(r`()\g<1>\2`)).toThrow();
      expect(() => toDetails(r`\g<1>(()\3)`)).toThrow();
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
      expect(() => toDetails(r`(?<a>)\1`)).toThrow();
    });

    it('should ref the most recent of a capture/subroutine set without multiplexing', () => {
      expect('abb').toExactlyMatch(r`(\w)\g<1>\1`);
      expect('aba').not.toFindMatch(r`(\w)\g<1>\1`);
      expect('abb').toExactlyMatch(r`\g<1>(\w)\1`);
      expect('aba').not.toFindMatch(r`\g<1>(\w)\1`);
      expect('1233').toExactlyMatch(r`(([123]))\g<1>\g<1>\2`);
      expect(['1231', '1232']).not.toFindMatch(r`(([123]))\g<1>\g<1>\2`);
    });

    it('should continue to reference the correct group when subroutines add captures', () => {
      expect('aabb').toExactlyMatch(r`(a)\g<1>(b)\2`);
      expect('aaba').not.toFindMatch(r`(a)\g<1>(b)\2`);
    });

    it('should track independent captures when used in a group referenced by a subroutine', () => {
      expect(['aaaa', 'aabb', 'bbaa', 'bbbb']).toExactlyMatch(r`((\w)\2)\g<1>`);
      expect(['aaba', 'bbab']).not.toFindMatch(r`((\w)\2)\g<1>`);
    });

    describe('to nonparticipating group', () => {
      it('should not match if it references a not-yet-closed group', () => {
        expect('').not.toFindMatch(r`(\1)`);
        expect('').not.toFindMatch(r`(((\2)))`);
        expect(['a', 'aa']).not.toFindMatch(r`(a\1)`);
        expect('').not.toFindMatch(r`(\g<2>(\1))`);
        expect('').not.toFindMatch(r`(\g<2>(\2))`);
      });

      it('should not match references to groups not in the alternation path', () => {
        expect('').not.toFindMatch(r`(a)|\1`);
      });

      // For 1-9, else it becomes octal if not enough groups defined to the left, even if enough
      // groups defined to the right
      it('should throw for forward references to defined groups', () => {
        expect(() => toDetails(r`\1()`)).toThrow();
        expect(() => toDetails(r`()\2()`)).toThrow();
        expect(() => toDetails(r`(()\3)()`)).toThrow();
      });

      it('should throw for forward references to defined groups even when subroutines add captures', () => {
        expect(() => toDetails(r`\g<1>\1()`)).toThrow();
      });
    });
  });

  describe('enclosed numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\k<1>`);
      expect('aa').toExactlyMatch(r`(a)\k'1'`);
    });

    it('should throw if group not defined', () => {
      expect(() => toDetails(r`\k<1>`)).toThrow();
      expect(() => toDetails(r`()\k<2>`)).toThrow();
      expect(() => toDetails(r`(()\k<3>)`)).toThrow();
    });

    it('should throw if group not defined even when subroutines add captures', () => {
      expect(() => toDetails(r`()\g<1>\k<2>`)).toThrow();
      expect(() => toDetails(r`\g<1>(()\k<3>)`)).toThrow();
    });

    it('should throw for group 0', () => {
      expect(() => toDetails(r`()\k<0>`)).toThrow();
    });

    it('should allow leading 0s', () => {
      expect('aa').toExactlyMatch(r`(a)\k<01>`);
      expect('aa').toExactlyMatch(r`(a)\k<000000000000001>`);
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => toDetails(r`()\k< 1 >`)).toThrow();
      expect(() => toDetails(r`()\k' 1 '`)).toThrow();
    });

    it('should allow 3-digit backrefs', () => {
      expect('aa').toExactlyMatch(r`${'()'.repeat(99)}(a)\k<100>`);
    });

    it('should allow 4-digit backrefs', () => {
      expect('aa').toExactlyMatch(r`${'()'.repeat(999)}(a)\k<1000>`);
    });

    it('should throw for mixed named capture and numbered backrefs', () => {
      expect(() => toDetails(r`(?<a>)\k<1>`)).toThrow();
    });

    it('should ref the most recent of a capture/subroutine set without multiplexing', () => {
      expect('abb').toExactlyMatch(r`(\w)\g<1>\k<1>`);
      expect('aba').not.toFindMatch(r`(\w)\g<1>\k<1>`);
      expect('abb').toExactlyMatch(r`\g<1>(\w)\k<1>`);
      expect('aba').not.toFindMatch(r`\g<1>(\w)\k<1>`);
      expect('1233').toExactlyMatch(r`(([123]))\g<1>\g<1>\k<2>`);
      expect(['1231', '1232']).not.toFindMatch(r`(([123]))\g<1>\g<1>\k<2>`);
    });

    it('should continue to reference the correct group when subroutines add captures', () => {
      expect('aabb').toExactlyMatch(r`(a)\g<1>(b)\k<2>`);
      expect('aaba').not.toFindMatch(r`(a)\g<1>(b)\k<2>`);
    });

    it('should track independent captures when used in a group referenced by a subroutine', () => {
      expect(['aaaa', 'aabb', 'bbaa', 'bbbb']).toExactlyMatch(r`((\w)\k<2>)\g<1>`);
      expect(['aaba', 'bbab']).not.toFindMatch(r`((\w)\k<2>)\g<1>`);
    });

    describe('to nonparticipating group', () => {
      it('should not match if it references a not-yet-closed group', () => {
        expect('').not.toFindMatch(r`(\k<1>)`);
        expect('').not.toFindMatch(r`(((\k<2>)))`);
        expect(['a', 'aa']).not.toFindMatch(r`(a\k<1>)`);
        expect('').not.toFindMatch(r`(\g<2>(\k<1>))`);
        expect('').not.toFindMatch(r`(\g<2>(\k<2>))`);
      });

      it('should not match references to groups not in the alternation path', () => {
        expect('').not.toFindMatch(r`(a)|\k<1>`);
      });

      it('should throw for forward references to defined groups', () => {
        expect(() => toDetails(r`\k<1>()`)).toThrow();
        expect(() => toDetails(r`()\k<2>()`)).toThrow();
        expect(() => toDetails(r`(()\k<3>)()`)).toThrow();
      });

      it('should throw for forward references to defined groups even when subroutines add captures', () => {
        expect(() => toDetails(r`\g<1>\k<1>()`)).toThrow();
      });
    });
  });

  describe('enclosed relative numbered backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(a)\k<-1>`);
      expect('aa').toExactlyMatch(r`(a)\k'-1'`);
    });

    it('should throw for relative 0', () => {
      expect(() => toDetails(r`()\k<-0>`)).toThrow();
      expect(() => toDetails(r`()\k<-00>`)).toThrow();
      expect(() => toDetails(r`()\k<+0>`)).toThrow();
      expect(() => toDetails(r`()\k<+00>`)).toThrow();
    });

    it('should throw if group not defined', () => {
      expect(() => toDetails(r`\k<-1>`)).toThrow();
      expect(() => toDetails(r`()\k<-2>`)).toThrow();
      expect(() => toDetails(r`(()\k<-3>)`)).toThrow();
      expect(() => toDetails(r`\k<-1>()`)).toThrow();
      expect(() => toDetails(r`()\k<-2>()`)).toThrow();
      expect(() => toDetails(r`(()\k<-3>)()`)).toThrow();
    });

    it('should throw if group not defined with forward reference', () => {
      expect(() => toDetails(r`\k<+1>`)).toThrow();
      expect(() => toDetails(r`()\k<+1>`)).toThrow();
      expect(() => toDetails(r`\k<+2>()`)).toThrow();
    });

    it('should throw if group not defined even when subroutines add captures', () => {
      expect(() => toDetails(r`\g<1>\k<-1>()`)).toThrow();
      expect(() => toDetails(r`()\g<1>\k<-2>`)).toThrow();
      expect(() => toDetails(r`\g<1>(()\k<-3>)`)).toThrow();
    });

    it('should allow leading 0s', () => {
      expect('aa').toExactlyMatch(r`(a)\k<-01>`);
      expect('aa').toExactlyMatch(r`(a)\k<-000000000000001>`);
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => toDetails(r`()\k< -1 >`)).toThrow();
      expect(() => toDetails(r`()\k' -1 '`)).toThrow();
    });

    it('should allow 3-digit numbers', () => {
      expect('aa').toExactlyMatch(r`(a)${'()'.repeat(99)}\k<-100>`);
    });

    it('should allow 4-digit numbers', () => {
      expect('aa').toExactlyMatch(r`(a)${'()'.repeat(999)}\k<-1000>`);
    });

    it('should throw for mixed named capture and relative numbered backrefs', () => {
      expect(() => toDetails(r`(?<a>)\k<-1>`)).toThrow();
    });

    it('should ref the most recent of a capture/subroutine set without multiplexing', () => {
      expect('abb').toExactlyMatch(r`(\w)\g<1>\k<-1>`);
      expect('aba').not.toFindMatch(r`(\w)\g<1>\k<-1>`);
      expect('abb').toExactlyMatch(r`\g<1>(\w)\k<-1>`);
      expect('aba').not.toFindMatch(r`\g<1>(\w)\k<-1>`);
      expect('1233').toExactlyMatch(r`(([123]))\g<1>\g<-2>\k<-1>`);
      expect(['1231', '1232']).not.toFindMatch(r`(([123]))\g<1>\g<-2>\k<-1>`);
    });

    it('should continue to reference the correct group when subroutines add captures', () => {
      expect('aabb').toExactlyMatch(r`(a)\g<1>(b)\k<-1>`);
      expect('aaba').not.toFindMatch(r`(a)\g<1>(b)\k<-1>`);
    });

    it('should track independent captures when used in a group referenced by a subroutine', () => {
      expect(['aaaa', 'aabb', 'bbaa', 'bbbb']).toExactlyMatch(r`((\w)\k<-1>)\g<1>`);
      expect(['aaba', 'bbab']).not.toFindMatch(r`((\w)\k<-1>)\g<1>`);
    });

    describe('to nonparticipating group', () => {
      it('should not match if it references a not-yet-closed group', () => {
        expect('').not.toFindMatch(r`(\k<-1>)`);
        expect('').not.toFindMatch(r`(((\k<-2>)))`);
        expect(['a', 'aa']).not.toFindMatch(r`(a\k<-1>)`);
        expect('').not.toFindMatch(r`(\g<+1>(\k<-2>))`);
        expect('').not.toFindMatch(r`(\g<+1>(\k<-1>))`);
      });

      it('should not match references to groups not in the alternation path', () => {
        expect('').not.toFindMatch(r`(a)|\k<-1>`);
      });

      it('should throw for forward references to defined groups', () => {
        expect(() => toDetails(r`\k<+1>()`)).toThrow();
        expect(() => toDetails(r`\k'+1'()`)).toThrow();
        expect(() => toDetails(r`()\k<+1>()`)).toThrow();
      });
    });
  });

  describe('named backref', () => {
    it('should rematch the captured text', () => {
      expect('aa').toExactlyMatch(r`(?<n>a)\k<n>`);
      expect('aa').toExactlyMatch(r`(?<n>a)\k'n'`);
    });

    it('should throw if group not defined', () => {
      expect(() => toDetails(r`\k<n>`)).toThrow();
      expect(() => toDetails(r`(?<a>)\k<n>`)).toThrow();
      expect(() => toDetails(r`\g<n>\k<n>`)).toThrow();
    });

    it('should throw for surrounding whitespace', () => {
      expect(() => toDetails(r`(?<n>)\k< n >`)).toThrow();
      expect(() => toDetails(r`(?'n')\k' n '`)).toThrow();
    });

    it('should throw for invalid names', () => {
      // `-` and `+` are invalid in backref names despite being valid in group and subroutine names
      expect(() => toDetails(r`(?<n-n>)\k<n-n>`)).toThrow();
      expect(() => toDetails(r`(?<n+n>)\k<n+n>`)).toThrow();
    });

    it('should reference the group to the left when there are duplicate names to the right', () => {
      expect('aab').toExactlyMatch(r`(?<n>a)\k<n>(?<n>b)`);
      expect('aa').toExactlyMatch(r`(?<n>a)\k<n>|(?<n>b)`);
    });

    it('should multiplex for duplicate names to the left', () => {
      expect(['aba', 'abb']).toExactlyMatch(r`(?<n>a)(?<n>b)\k<n>`);
      expect(['aba', 'abb', 'ab']).toExactlyMatch(r`(?<n>a)(?<n>b)\k<n>?`);
      expect(['abca', 'abcb', 'abcc']).toExactlyMatch(r`(?<n>a)(?<n>b)(?<n>c)\k<n>`);
      expect(['aba', 'abb']).toExactlyMatch(r`(?<n>\w)(?<n>\w)\k<n>`);
      expect(['aab', 'abc']).not.toFindMatch(r`(?<n>\w)(?<n>\w)\k<n>`);
    });

    it('should increase multiplexing as duplicate names are added to the left', () => {
      expect(['aaba', 'aabb']).toExactlyMatch(r`(?<n>a)\k<n>(?<n>b)\k<n>`);
      expect(['aaba', 'aabb']).toExactlyMatch(r`((?<n>a)\k<n>)(?<n>b)\k<n>`);
      expect(['abba', 'abbb']).not.toFindMatch(r`(?<n>a)\k<n>(?<n>b)\k<n>`);
    });

    it('should ref the most recent of a capture/subroutine set without multiplexing', () => {
      expect('abb').toExactlyMatch(r`(?<a>\w)\g<a>\k<a>`);
      expect('aba').not.toFindMatch(r`(?<a>\w)\g<a>\k<a>`);
      expect('abb').toExactlyMatch(r`\g<a>(?<a>\w)\k<a>`);
      expect('aba').not.toFindMatch(r`\g<a>(?<a>\w)\k<a>`);
    });

    it('should continue to reference the correct group when subroutines add captures', () => {
      expect('aabb').toExactlyMatch(r`(?<a>a)\g<a>(?<b>b)\k<b>`);
      expect('aaba').not.toFindMatch(r`(?<a>a)\g<a>(?<b>b)\k<b>`);
    });

    it('should multiplex for duplicate names to the left but only use the most recent of an indirect capture/subroutine set', () => {
      expect([ // All possible matches
        '1010', '1011', '1020', '1022', '2010', '2011', '2020', '2022',
      ]).toExactlyMatch(r`(?<a>(?<b>[12]))(?<b>0)\g<a>\k<b>`);
      expect(['1021', '2012']).not.toFindMatch(r`(?<a>(?<b>[12]))(?<b>0)\g<a>\k<b>`);
      expect(['01230', '01233']).toExactlyMatch(r`(?<b>0)(?<a>(?<b>[123]))\g<a>\g<a>\k<b>`);
      expect(['01231', '01232']).not.toFindMatch(r`(?<b>0)(?<a>(?<b>[123]))\g<a>\g<a>\k<b>`);
      expect(['10230', '10233']).toExactlyMatch(r`(?<a>(?<b>[123]))(?<b>0)\g<a>\g<a>\k<b>`);
      expect(['10231', '10232']).not.toFindMatch(r`(?<a>(?<b>[123]))(?<b>0)\g<a>\g<a>\k<b>`);
      expect(['12300', '12303']).toExactlyMatch(r`(?<a>(?<b>[123]))\g<a>\g<a>(?<b>0)\k<b>`);
      expect(['12301', '12302']).not.toFindMatch(r`(?<a>(?<b>[123]))\g<a>\g<a>(?<b>0)\k<b>`);
    });

    it('should track independent captures when used in a group referenced by a subroutine', () => {
      expect(['aaaa', 'aabb', 'bbaa', 'bbbb']).toExactlyMatch(r`(?<a>(?<b>\w)\k<b>)\g<a>`);
      expect(['aaba', 'bbab']).not.toFindMatch(r`(?<a>(?<b>\w)\k<b>)\g<a>`);
    });

    describe('to nonparticipating group', () => {
      it('should not match if it references a not-yet-closed group', () => {
        expect('').not.toFindMatch(r`(?<a>\k<a>)`);
        expect('').not.toFindMatch(r`(?<a>(?<b>(?<c>\k<b>)))`);
        expect(['a', 'aa']).not.toFindMatch(r`(?<a>a\k<a>)`);
        expect('').not.toFindMatch(r`(?<a>\g<b>(?<b>\k<a>))`);
        expect('').not.toFindMatch(r`(?<a>\g<b>(?<b>\k<b>))`);
        expect('').not.toFindMatch(r`(?<a>(?<a>\k<a>))`);
        expect('aa').toExactlyMatch(r`(?<n>a)\k<n>|(?<n>b\k<n>)`);
        expect(['a', 'b', 'ba', 'bb']).not.toFindMatch(r`(?<n>a)\k<n>|(?<n>b\k<n>)`);
      });

      it('should preclude not-yet-closed groups when multiplexing', () => {
        expect('aa').toExactlyMatch(r`(?<a>a)(?<a>\k<a>)`);
        expect('aba').toExactlyMatch(r`(?<n>a)(?<n>b\k<n>)`);
        expect(['aa', 'bcb']).toExactlyMatch(r`(?<n>a)\k<n>|(?<n>b)(?<n>c\k<n>)`);
        expect(['a', 'bc', 'bca', 'bcc']).not.toFindMatch(r`(?<n>a)\k<n>|(?<n>b)(?<n>c\k<n>)`);
      });

      it('should not match references to groups not in the alternation path', () => {
        expect('').not.toFindMatch(r`(?<a>a)|\k<a>`);
      });

      it('should preclude groups not in the alternation path when multiplexing', () => {
        // This enforces Oniguruma logic where backrefs to nonparticipating groups fail to match
        // rather than JS logic where they match the empty string
        expect(['aa', 'bb']).toExactlyMatch(r`(?<n>a)\k<n>|(?<n>b)\k<n>`);
        expect(['a', 'b', 'ba']).not.toFindMatch(r`(?<n>a)\k<n>|(?<n>b)\k<n>`);
        expect(['aa', 'bcb', 'bcc']).toExactlyMatch(r`(?<n>a)\k<n>|(?<n>b)(?<n>c)\k<n>`);
        expect(['a', 'bc', 'bca']).not.toFindMatch(r`(?<n>a)\k<n>|(?<n>b)(?<n>c)\k<n>`);
      });

      it('should throw for forward references to defined groups', () => {
        expect(() => toDetails(r`\k<n>(?<n>)`)).toThrow();
        expect(() => toDetails(r`(?<a>(?<b>)\k<c>)(?<c>)`)).toThrow();
      });

      it('should throw for forward references to defined groups even when subroutines add captures', () => {
        expect(() => toDetails(r`\g<n>\k<n>(?<n>)`)).toThrow();
      });
    });
  });

  describe('case sensitivity', () => {
    it('should match case-insensitive backref to case-sensitive group', () => {
      // Real support with `target` ES2025
      expect(['aa', 'aA']).toExactlyMatch({
        pattern: r`(a)(?i)\1`,
        minTestTarget: minTestTargetForFlagGroups,
      });
      expect(['Aa', 'AA']).not.toFindMatch({
        pattern: r`(a)(?i)\1`,
        minTestTarget: minTestTargetForFlagGroups,
      });
      // Throw with strict `accuracy` if `target` below ES2025
      ['ES2018', 'ES2024'].forEach(target => {
        expect(() => toDetails(r`(a)(?i)\1`, {
          accuracy: 'strict',
          target,
        })).toThrow();
      });
      // With default `accuracy` and `target` below ES2025, matches only the same case as the reffed case-sensitive group
      expect('aa').toExactlyMatch({
        pattern: r`(a)(?i)\1`,
        maxTestTarget: maxTestTargetForFlagGroups,
      });
    });
  });
});
