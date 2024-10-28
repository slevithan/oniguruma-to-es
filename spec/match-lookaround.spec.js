import {compile} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Lookaround', () => {
  describe('lookahead', () => {
    it('should match fixed-length positive lookahead', () => {
      expect('ab').toMatchWithAllTargets('a(?=b)');
      expect('ac').not.toMatchWithAllTargets('a(?=b)');
      expect('a').not.toMatchWithAllTargets('a(?=b)');
    });

    it('should match fixed-length negative lookahead', () => {
      expect('ab').not.toMatchWithAllTargets('a(?!b)');
      expect('ac').toMatchWithAllTargets('a(?!b)');
      expect('a').toMatchWithAllTargets('a(?!b)');
    });

    it('should match fixed-length repetition in lookahead', () => {
      expect('abb').toMatchWithAllTargets('a(?=b{2})');
      expect('abb').toMatchWithAllTargets('a(?=b{2,2})');
    });

    it('should match variable-length repetition in lookahead', () => {
      expect('a').toMatchWithAllTargets('a(?=b?)');
      expect('a').toMatchWithAllTargets('a(?=b*)');
      expect('ab').toMatchWithAllTargets('a(?=b+)');
      expect('a').toMatchWithAllTargets('a(?=b{0,2})');
      expect('a').toMatchWithAllTargets('a(?=b{0,})');
    });

    it('should match top-level variable-length alternatives in lookahead', () => {
      expect('ab').toMatchWithAllTargets('a(?=b|cc)');
      expect('acc').toMatchWithAllTargets('a(?=b|cc)');
      expect('ac').not.toMatchWithAllTargets('a(?=b|cc)');
    });

    it('should apply with positive min quantification', () => {
      expect('ab').toMatchWithAllTargets('a(?=b)+');
      expect('a').not.toMatchWithAllTargets('a(?=b)+');
      expect('a').not.toMatchWithAllTargets('a(?=b)+?');
    });
  
    it('should not apply with min 0 quantification', () => {
      expect('a').toMatchWithAllTargets('a(?=b)?');
      expect('a').toMatchWithAllTargets('a(?=b)*');
    });

    it('should preserve captures with min 0 quantification', () => {
      expect('aba').toMatchWithAllTargets(r`a(?=(b))?\1a`);
    });
  });

  describe('lookbehind', () => {
    it('should match fixed-length positive lookbehind', () => {
      expect('ba').toMatchWithAllTargets('(?<=b)a');
      expect('ca').not.toMatchWithAllTargets('(?<=b)a');
      expect('a').not.toMatchWithAllTargets('(?<=b)a');
    });

    it('should match fixed-length negative lookbehind', () => {
      expect('ba').not.toMatchWithAllTargets('(?<!b)a');
      expect('ca').toMatchWithAllTargets('(?<!b)a');
      expect('a').toMatchWithAllTargets('(?<!b)a');
    });

    it('should match fixed-length repetition in lookbehind', () => {
      expect('bba').toMatchWithAllTargets('(?<=b{2})a');
      expect('bba').toMatchWithAllTargets('(?<=b{2,2})a');
    });

    it('should throw for variable-length repetition in lookbehind', () => {
      expect(() => compile('(?<=b?)a')).toThrow();
      expect(() => compile('(?<=b*)a')).toThrow();
      expect(() => compile('(?<=b+)a')).toThrow();
      expect(() => compile('(?<=b{0,2})a')).toThrow();
      expect(() => compile('(?<=b{0,})a')).toThrow();
    });

    it('should match top-level variable-length alternatives in lookbehind', () => {
      expect('ba').toMatchWithAllTargets('(?<=b|cc)a');
      expect('cca').toMatchWithAllTargets('(?<=b|cc)a');
      expect('ca').not.toMatchWithAllTargets('(?<=b|cc)a');
    });

    it('should apply with positive min quantification', () => {
      expect('ba').toMatchWithAllTargets('(?<=b)+a');
      expect('a').not.toMatchWithAllTargets('(?<=b)+a');
      expect('a').not.toMatchWithAllTargets('(?<=b)+?a');
    });
  
    it('should not apply with min 0 quantification', () => {
      expect('a').toMatchWithAllTargets('(?<=b)?a');
      expect('a').toMatchWithAllTargets('(?<=b)*a');
    });

    it('should preserve captures with min 0 quantification', () => {
      expect('baba').toMatchWithAllTargets(r`(?<=(b))?a\1a`);
    });
  });
});
