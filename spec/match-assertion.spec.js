import {toRegExp, toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion', () => {
  // - For kind `search_start`, see `match-search-start.spec.js`
  // TODO: Test handling of assertion syntax within char classes

  describe('line_end', () => {
    it('should match at the end of the string', () => {
      expect('ba').toFindMatch('a$');
    });

    it('should match before a line feed', () => {
      expect('ba\nb').toFindMatch('a$');
    });

    it('should not match before line breaks other than line feed', () => {
      expect([
        'ba\rb', 'ba\r\nb', 'ba\u{2028}b', 'ba\u{2029}b',
      ]).not.toFindMatch('a$');
    });

    it('should not match at positions other than the end of the string or before a line feed', () => {
      expect('ab').not.toFindMatch('a$');
    });
  });

  describe('line_start', () => {
    it('should match at the start of the string', () => {
      expect('ab').toFindMatch('^a');
    });

    it('should match after a line feed', () => {
      expect([
        'b\nab', 'b\r\nab',
      ]).toFindMatch('^a');
    });

    it('should not match after line breaks other than line feed', () => {
      expect([
        'b\rab', 'b\u{2028}ab', 'b\u{2029}ab',
      ]).not.toFindMatch('^a');
    });

    it('should not match at positions other than the start of the string or after a line feed', () => {
      expect('ba').not.toFindMatch('^a');
    });

    it('should not match after a string-terminating line feed', () => {
      expect(''.match(toRegExp('^', {global: true}))).toHaveSize(1);
      expect('\n'.match(toRegExp('^', {global: true}))).toHaveSize(1);
      expect('\n\n'.match(toRegExp('^', {global: true}))).toHaveSize(2);
    });
  });

  describe('string_end', () => {
    it('should match at the end of the string', () => {
      expect('ba').toFindMatch(r`a\z`);
    });

    it('should not match before line breaks', () => {
      expect([
        'ba\nb', 'ba\rb', 'ba\r\nb', 'ba\u{2028}b', 'ba\u{2029}b',
      ]).not.toFindMatch(r`a\z`);
    });

    it('should not match at positions other than the end of the string', () => {
      expect('ab').not.toFindMatch(r`a\z`);
    });
  });

  describe('string_end_newline', () => {
    it('should match at the end of the string', () => {
      expect('ba').toFindMatch(r`a\Z`);
    });

    it('should match before a string-terminating line feed', () => {
      expect('ba\n').toFindMatch(r`a\Z`);
    });

    it('should not match before a non-string-terminating line feed', () => {
      expect('ba\nb').not.toFindMatch(r`a\Z`);
    });

    it('should not match before string-terminating line breaks other than line feed', () => {
      expect([
        'ba\r', 'ba\r\n', 'ba\u{2028}', 'ba\u{2029}',
      ]).not.toFindMatch(r`a\Z`);
    });

    it('should not match at positions other than the end of the string or string-terminating line feed', () => {
      expect('ab').not.toFindMatch(r`a\Z`);
    });
  });

  describe('string_start', () => {
    it('should match at the start of the string', () => {
      expect('ab').toFindMatch(r`\Aa`);
    });

    it('should not match after line breaks', () => {
      expect([
        'b\nab', 'b\rab', 'b\r\nab', 'b\u{2028}ab', 'b\u{2029}ab',
      ]).not.toFindMatch(r`\Aa`);
    });

    it('should not match at positions other than the start of the string', () => {
      expect('ba').not.toFindMatch(r`\Aa`);
    });
  });

  describe('word_boundary', () => {
    describe('positive', () => {
      it('should match at ASCII word boundaries', () => {
        expect([
          'a', 'Is a.',
        ]).toFindMatch(r`\ba\b`);
      });

      it('should not match at ASCII word non-boundaries', () => {
        expect([
          'ba', '0a', '_a',
        ]).not.toFindMatch(r`\ba\b`);
      });

      it('should match at Unicode word boundaries', () => {
        expect([
          '日本語', '！日本語。',
        ]).toFindMatch(r`\b日本語\b`);
      });

      it('should not match at Unicode word non-boundaries', () => {
        expect([
          '日本語です', '0日本語',
        ]).not.toFindMatch(r`\b日本語\b`);
      });
    });

    describe('negative', () => {
      it('should not match at ASCII word boundaries', () => {
        expect([
          'a', 'Is a.',
        ]).not.toFindMatch(r`\Ba\B`);
      });

      it('should match at ASCII word non-boundaries', () => {
        expect([
          'bab', '0a0', '_a_',
        ]).toFindMatch(r`\Ba\B`);
      });

      it('should not match at Unicode word boundaries', () => {
        expect([
          '日本語', '！日本語。',
        ]).not.toFindMatch(r`\B日本語\B`);
      });

      it('should match at Unicode word non-boundaries', () => {
        expect([
          'これは日本語です', '0日本語0',
        ]).toFindMatch(r`\B日本語\B`);
      });
    });
  });

  describe('grapheme_boundary', () => {
    // Supportable with close approximation, but extremely rare and not many use cases
    it('should throw as unsupported', () => {
      expect(() => toRegExpDetails(r`\y`)).toThrow();
      expect(() => toRegExpDetails(r`\Y`)).toThrow();
    });
  });
});
