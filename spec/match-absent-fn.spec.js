import {toRegExp, toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';

describe('AbsentFunction', () => {
  describe('repeater', () => {
    it('should match any input not matched by absence pattern', () => {
      expect('abc'.match(toRegExp('(?~ab)', {global: true}))).toEqual(['', 'bc', '']);
      expect('abc'.match(toRegExp('(?~)', {global: true}))).toEqual(['', '', '', '']);
      expect('abc'.match(toRegExp('(?~a|b)', {global: true}))).toEqual(['', '', 'c', '']);
    });

    it('should not match atomically', () => {
      expect('abc'.match(toRegExp('(?~ab).', {global: true}))).toEqual(['a', 'bc']);
    });

    it('should allow quantification', () => {
      expect('abc'.match(toRegExp('(?~ab)?.', {global: true}))).toEqual(['a', 'bc']);
      expect('abc'.match(toRegExp('(?~ab)??.', {global: true}))).toEqual(['a', 'b', 'c']);
      expect('abc'.match(toRegExp('(?~ab)?+.', {global: true}))).toEqual(['a']);
    });

    it('should throw for nested absence repeaters', () => {
      expect(() => toRegExpDetails('(?~(?~))')).toThrow();
      expect(() => toRegExpDetails('(?~a(?~))')).toThrow();
      expect(() => toRegExpDetails('(?~(?~a))')).toThrow();
      expect(() => toRegExpDetails('(?~a(?~b))')).toThrow();
    });
  });

  describe('expression', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toRegExpDetails(r`(?~|abc|\O*)`)).toThrow();
    });
  });

  describe('stopper', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toRegExpDetails('(?~|abc)')).toThrow();
    });
  });

  describe('clearer', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toRegExpDetails('(?~|)')).toThrow();
      expect(() => toRegExpDetails('(?~|abc)(?~|)')).toThrow();
    });
  });
});
