import {toDetails} from '../dist/index.mjs';

describe('toDetails', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(toDetails(''))).toEqual(['pattern', 'flags']);
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
