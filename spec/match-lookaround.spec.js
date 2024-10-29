import {compile} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Lookaround', () => {
  describe('lookahead', () => {
    it('should match fixed-length positive lookahead', () => {
      expect('ab').toFindMatch('a(?=b)');
      expect([
        'ac', 'a',
      ]).not.toFindMatch('a(?=b)');
    });

    it('should match fixed-length negative lookahead', () => {
      expect('ab').not.toFindMatch('a(?!b)');
      expect([
        'ac', 'a',
      ]).toFindMatch('a(?!b)');
    });

    it('should match fixed-length repetition in lookahead', () => {
      expect('abb').toFindMatch('a(?=b{2})');
      expect('abb').toFindMatch('a(?=b{2,2})');
    });

    it('should match variable-length repetition in lookahead', () => {
      expect('a').toFindMatch('a(?=b?)');
      expect('a').toFindMatch('a(?=b*)');
      expect('ab').toFindMatch('a(?=b+)');
      expect('a').toFindMatch('a(?=b{0,2})');
      expect('a').toFindMatch('a(?=b{0,})');
    });

    it('should match top-level variable-length alternatives in lookahead', () => {
      expect([
        'ab', 'acc',
      ]).toFindMatch('a(?=b|cc)');
      expect([
        'ac', 'a',
      ]).not.toFindMatch('a(?=b|cc)');
    });

    it('should match non-top-level variable-length alternatives in lookahead', () => {
      expect([
        'abc', 'abdd',
      ]).toFindMatch('a(?=b(?:c|dd))');
    });

    it('should apply with positive min quantification', () => {
      expect('ab').toFindMatch('a(?=b)+');
      expect('a').not.toFindMatch('a(?=b)+');
      expect('a').not.toFindMatch('a(?=b)+?');
    });
  
    it('should not apply with min 0 quantification', () => {
      expect('a').toExactlyMatch('a(?=b)?');
      expect('a').toExactlyMatch('a(?=b)*');
      expect('a').toExactlyMatch('a(?=b)**');
    });

    it('should preserve captures with min 0 quantification', () => {
      expect('aba').toExactlyMatch(r`a(?=(b))?\1a`);
    });
  });

  describe('lookbehind', () => {
    it('should match fixed-length positive lookbehind', () => {
      expect('ba').toFindMatch('(?<=b)a');
      expect([
        'ca', 'a',
      ]).not.toFindMatch('(?<=b)a');
    });

    it('should match fixed-length negative lookbehind', () => {
      expect('ba').not.toFindMatch('(?<!b)a');
      expect([
        'ca', 'a',
      ]).toFindMatch('(?<!b)a');
    });

    it('should match fixed-length repetition in lookbehind', () => {
      expect('bba').toFindMatch('(?<=b{2})a');
      expect('bba').toFindMatch('(?<=b{2,2})a');
    });

    it('should throw for variable-length repetition in lookbehind', () => {
      expect(() => compile('(?<=b?)a')).toThrow();
      expect(() => compile('(?<=b*)a')).toThrow();
      expect(() => compile('(?<=b+)a')).toThrow();
      expect(() => compile('(?<=b{0,2})a')).toThrow();
      expect(() => compile('(?<=b{0,})a')).toThrow();
    });

    it('should match top-level variable-length alternatives in lookbehind', () => {
      expect([
        'ba', 'cca',
      ]).toFindMatch('(?<=b|cc)a');
      expect([
        'ca', 'a',
      ]).not.toFindMatch('(?<=b|cc)a');
    });

    it('should apply with positive min quantification', () => {
      expect('ba').toFindMatch('(?<=b)+a');
      expect('a').not.toFindMatch('(?<=b)+a');
      expect('a').not.toFindMatch('(?<=b)+?a');
    });
  
    it('should not apply with min 0 quantification', () => {
      expect('a').toExactlyMatch('(?<=b)?a');
      expect('a').toExactlyMatch('(?<=b)*a');
      expect('a').toExactlyMatch('(?<=b)**a');
    });

    it('should preserve captures with min 0 quantification', () => {
      expect('baba').toFindMatch(r`(?<=(b))?a\1a`);
    });
  });
});
