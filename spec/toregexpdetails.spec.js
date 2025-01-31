import {toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';

describe('toRegExpDetails', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(toRegExpDetails(''))).toEqual(['pattern', 'flags']);
  });

  it('should return an object with pattern, flags, and options properties when the pattern uses subclass-based emulation', () => {
    expect(Object.keys(toRegExpDetails('a++'))).toEqual(['pattern', 'flags', 'options']);
    expect(Object.keys(toRegExpDetails(r`(^|\G)`))).toEqual(['pattern', 'flags', 'options']);
  });

  it('should throw for non-string patterns', () => {
    expect(() => toRegExpDetails()).toThrow();
    for (const value of [undefined, null, 0, false, [], {}, /(?:)/]) {
      expect(() => toRegExpDetails(value)).toThrow();
    }
  });

  it('should return an empty pattern if given an empty string', () => {
    expect(toRegExpDetails('').pattern).toBe('');
  });
});
