import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Directive', () => {
  describe('flags', () => {
    it('should not allow quantification', () => {
      expect(() => toDetails('(?i)+')).toThrow();
      expect(() => toDetails('(?imx)+')).toThrow();
      expect(() => toDetails('(?-i)+')).toThrow();
      expect(() => toDetails('(?im-x)+')).toThrow();
    });

    // TODO: Add remaining
  });

  describe('keep', () => {
    it('should not allow quantification', () => {
      expect(() => toDetails(r`\K+`)).toThrow();
      expect(() => toDetails(r`a\K+a`)).toThrow();
    });

    // TODO: Add remaining
  });
});
