import {toDetails, toRegExp} from '../dist/esm/index.js';
import {r} from '../src/utils.js';

describe('AbsentFunction', () => {
  describe('absent repeater', () => {
    it('should match any input not matched by absent', () => {
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

    it('should throw for nested absent repeaters', () => {
      expect(() => toDetails('(?~(?~))')).toThrow();
      expect(() => toDetails('(?~a(?~))')).toThrow();
      expect(() => toDetails('(?~(?~a))')).toThrow();
      expect(() => toDetails('(?~a(?~b))')).toThrow();
    });
  });

  describe('absent expression', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toDetails(r`(?~|abc|\O*)`)).toThrow();
    });
  });

  describe('absent stopper', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toDetails('(?~|abc)')).toThrow();
    });
  });

  describe('absent clearer', () => {
    // Not supported
    it('should throw', () => {
      expect(() => toDetails('(?~|)')).toThrow();
      expect(() => toDetails('(?~|abc)(?~|)')).toThrow();
    });
  });
});
