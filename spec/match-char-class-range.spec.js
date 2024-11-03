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
      minTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\w-&&\p{Any}]`,
      minTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\p{Any}&&-a]`,
      minTarget: minTestTargetForFlagV,
    });
    expect('-').toExactlyMatch({
      pattern: r`[\p{Any}&&-\w]`,
      minTarget: minTestTargetForFlagV,
    });
  });

  it('should match unescaped hyphen as literal at right of range', () => {
    expect('-').toExactlyMatch(r`[a-z-0]`);
    expect('-').toExactlyMatch(r`[a-z-\w]`);
    expect('-').toExactlyMatch(r`[a-z-0-9]`);
  });

  it('should throw for reversed ranges', () => {
    expect(() => compile(r`[z-a]`)).toThrow();
    expect(() => compile(r`[\u{1}-\0]`)).toThrow();
  });

  it('should throw for range with set', () => {
    expect(() => compile(r`[a-\w]`)).toThrow();
    expect(() => compile(r`[\w-a]`)).toThrow();
    expect(() => compile(r`[\w-a-z]`)).toThrow();
    expect(() => compile(r`[a-z-\w]`)).toThrow();
    expect(() => compile(r`[\w-\s]`)).toThrow();
  });
});
