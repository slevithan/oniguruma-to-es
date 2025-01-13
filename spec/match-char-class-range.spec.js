import {toDetails} from '../dist/esm/index.mjs';
import {r} from '../src/utils.js';
import {minTestTargetForFlagV} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClassRange', () => {
  it('should match any char from range', () => {
    expect(['a', 'b', 'c']).toExactlyMatch(r`[a-c]`);
    expect('d').not.toFindMatch(r`[a-c]`);
  });

  it('should match unescaped hyphen as literal at start of class', () => {
    expect('-').toExactlyMatch(r`[-a]`);
    expect('-').toExactlyMatch(r`[-\w]`);
    expect('-').not.toFindMatch(r`[^-a]`);
    expect('-').toExactlyMatch(r`[^[^-a]]`);
    expect('-').toExactlyMatch(r`[a[-b]]`);
    expect('-').toExactlyMatch(r`[-[ab]]`);
  });

  it('should match unescaped hyphen as literal at end of class', () => {
    expect('-').toExactlyMatch(r`[a-]`);
    expect('-').toExactlyMatch(r`[\w-]`);
    expect('-').toExactlyMatch(r`[a[b-]]`);
    expect('-').toExactlyMatch(r`[a[bc]-]`);
  });

  it('should match unescaped hyphen as literal at intersection boundary', () => {
    expect('-').toExactlyMatch({
      pattern: r`[a-&&\p{Any}]`,
      minTestTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\w-&&\p{Any}]`,
      minTestTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\p{Any}&&-a]`,
      minTestTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\p{Any}&&-\w]`,
      minTestTarget: minTestTargetForFlagV,
    });
  });

  it('should match unescaped hyphen as literal if follows range', () => {
    expect('-').toExactlyMatch(r`[a-z-0]`);
    expect('-').toExactlyMatch(r`[a-z-\w]`);
    expect('-').toExactlyMatch(r`[a-z-0-9]`);
    expect(['a', 'b', 'c', '-', 'z']).toExactlyMatch(r`[a-c-z]`);
    expect('d').not.toFindMatch(r`[a-c-z]`);
  });

  it('should handle sequences with literal and range hyphens', () => {
    expect(toDetails('[-]').pattern).toBe(r`[\-]`);
    expect(toDetails('[--]').pattern).toBe(r`[\-\-]`);
    expect(toDetails('[---]').pattern).toBe(r`[\--\-]`);
    expect(toDetails('[----]').pattern).toBe(r`[\--\-\-]`);
    expect(toDetails('[-----]').pattern).toBe(r`[\--\-\-\-]`);
    expect(toDetails('[------]').pattern).toBe(r`[\--\-\--\-]`);
  });

  it('should throw for range with set', () => {
    expect(() => toDetails(r`[a-\w]`)).toThrow();
    expect(() => toDetails(r`[\w-a]`)).toThrow();
    expect(() => toDetails(r`[\w-a-z]`)).toThrow();
    expect(() => toDetails(r`[\w-\s]`)).toThrow();
  });

  it('should throw for reversed ranges', () => {
    expect(() => toDetails(r`[z-a]`)).toThrow();
    expect(() => toDetails(r`[\u{1}-\0]`)).toThrow();
    expect(() => toDetails(r`[a-0-9]`)).toThrow();
  });

  it(r`should match UTF-8 encoded byte sequences with \xNN above 7F`, () => {
    // Encoded byte sequence `\xE2\x82\xAC` is € U+20AC
    expect(['\u1000', '\u1001', '\u{20AC}']).toExactlyMatch(r`[\u1000-\xE2\x82\xAC]`);
    expect(['\0', '\u0FFF', '\xE2', '\x82', '\xAC', '\u{20AD}']).not.toFindMatch(r`[\u1000-\xE2\x82\xAC]`);
  });

  it(r`should throw for invalid UTF-8 encoded byte sequences with \xNN above 7F`, () => {
    expect(() => toDetails(r`[\0-\x80]`)).toThrow();
    expect(() => toDetails(r`[\0-\xF4]`)).toThrow();
    expect(() => toDetails(r`[\0-\xEF\xC0\xBB]`)).toThrow();
    // In Onig, the unused encoded UTF-8 bytes F5-FF don't throw, but they don't match anything and
    // cause buggy, undesirable behavior in ranges
    expect(() => toDetails(r`[\0-\xFF]`)).toThrow();
  });
});
