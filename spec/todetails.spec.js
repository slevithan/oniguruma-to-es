import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';

describe('toDetails', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(toDetails(''))).toEqual(['pattern', 'flags']);
  });

  it('should return an object with pattern, flags, and options properties when the pattern uses subclass-based emulation', () => {
    expect(Object.keys(toDetails('a++'))).toEqual(['pattern', 'flags', 'options']);
    expect(Object.keys(toDetails(r`(^|\G)`))).toEqual(['pattern', 'flags', 'options']);
  });

  it('should throw for non-string patterns', () => {
    expect(() => toDetails()).toThrow();
    for (const value of [undefined, null, 0, false, [], {}, /(?:)/]) {
      expect(() => toDetails(value)).toThrow();
    }
  });

  it('should return an empty pattern if given an empty string', () => {
    expect(toDetails('').pattern).toBe('');
  });
});
