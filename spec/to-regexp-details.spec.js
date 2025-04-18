import {toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';

describe('toRegExpDetails', () => {
  it('should throw for non-string patterns', () => {
    expect(() => toRegExpDetails()).toThrow();
    for (const value of [undefined, null, 0, false, [], {}, /(?:)/]) {
      expect(() => toRegExpDetails(value)).toThrow();
    }
  });

  it('should throw for non-object/undefined options', () => {
    expect(() => toRegExpDetails('')).not.toThrow();
    for (const value of ['', null, 0, false, [], /(?:)/]) {
      expect(() => toRegExpDetails('', value)).toThrow();
    }
  });

  it('should return an empty pattern if given an empty string', () => {
    // Not `(?:)` like `new RegExp('').source`
    expect(toRegExpDetails('').pattern).toBe('');
  });

  describe('result properties', () => {
    const props = ['pattern', 'flags'];
    const extProps = ['pattern', 'flags', 'options'];

    it('should return an object with pattern and flags properties', () => {
      expect(Object.keys(toRegExpDetails('a'))).toEqual(props);
    });

    it('should include an options property when the pattern uses subclass-based emulation', () => {
      expect(Object.keys(toRegExpDetails('a++'))).toEqual(extProps);
      expect(Object.keys(toRegExpDetails(r`(^|\G)a`))).toEqual(extProps);
      expect(Object.keys(toRegExpDetails(r`(?<n>a)\g<n>`))).toEqual(extProps);
      expect(Object.keys(toRegExpDetails(r`(?<n>a)\g<n>`, {avoidSubclass: true}))).toEqual(props);
    });

    it('should include an options property when the pattern uses lazy compilation', () => {
      expect(Object.keys(toRegExpDetails('a', {lazyCompileLength: 0}))).toEqual(extProps);
      expect(Object.keys(toRegExpDetails('a', {lazyCompileLength: Infinity}))).toEqual(props);
    });
  });
});
