import {compile} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion', () => {
  describe('line_end', () => {
    it('should match at the end of the string', () => {
      expect('ba').toMatchWithAllTargets('a$');
    });

    it('should match before a line feed', () => {
      expect('ba\nb').toMatchWithAllTargets('a$');
    });

    it('should not match before line breaks other than line feed', () => {
      expect('ba\rb').not.toMatchWithAllTargets('a$');
      expect('ba\r\nb').not.toMatchWithAllTargets('a$');
      expect('ba\u{2028}b').not.toMatchWithAllTargets('a$');
      expect('ba\u{2029}b').not.toMatchWithAllTargets('a$');
    });

    it('should not match at positions other than the end of the string or before a line feed', () => {
      expect('ab').not.toMatchWithAllTargets('a$');
    });

    it('should apply with positive min quantification', () => {
      expect('ba').toMatchWithAllTargets('a$+');
      expect('ab').not.toMatchWithAllTargets('a$+');
      expect('ab').not.toMatchWithAllTargets('a$+?');
    });

    it('should not apply with min 0 quantification', () => {
      expect('ab').toMatchWithAllTargets('a$?');
      expect('ab').toMatchWithAllTargets('a$*');
    });
  });

  describe('line_start', () => {
    it('should match at the start of the string', () => {
      expect('ab').toMatchWithAllTargets('^a');
    });

    it('should match after a line feed', () => {
      expect('b\nab').toMatchWithAllTargets('^a');
    });

    it('should not match after line breaks other than line feed', () => {
      expect('b\rab').not.toMatchWithAllTargets('^a');
      expect('b\u{2028}ab').not.toMatchWithAllTargets('^a');
      expect('b\u{2029}ab').not.toMatchWithAllTargets('^a');
    });

    it('should not match at positions other than the start of the string or after a line feed', () => {
      expect('ba').not.toMatchWithAllTargets('^a');
    });

    it('should apply with positive min quantification', () => {
      expect('ab').toMatchWithAllTargets('^+a');
      expect('ba').not.toMatchWithAllTargets('^+a');
      expect('ba').not.toMatchWithAllTargets('^+?a');
    });

    it('should not apply with min 0 quantification', () => {
      expect('ba').toMatchWithAllTargets('^?a');
      expect('ba').toMatchWithAllTargets('^*a');
    });
  });

  // For kinds `lookahead` and `lookbehind`, see `match-lookaround.spec.js`

  describe('search_start', () => {
    it('should match at the start of the search', () => {
      expect('a').toMatchWithAllTargets(r`\Ga`);
      expect('b').toMatchWithAllTargets(r`\Ga|\Gb`);
    });

    it('should not match at positions other than the start of the search', () => {
      expect('ba').not.toMatchWithAllTargets(r`\Ga`);
    });

    it('should match only at the start of the search when applied repeatedly', () => {
      const compiled = compile(r`\G[ab]`);
      const re = new RegExp(compiled.pattern, `g${compiled.flags}`);
      expect('abbcbb'.match(re)).toEqual(['a', 'b', 'b']);
    });

    it('should apply with positive min quantification', () => {
      expect('ab').toMatchWithAllTargets(r`\G+a`);
      expect('ba').not.toMatchWithAllTargets(r`\G+a`);
      expect('ba').not.toMatchWithAllTargets(r`\G+?a`);
    });

    it('should not apply with min 0 quantification', () => {
      expect('ba').toMatchWithAllTargets(r`\G?a`);
      expect('ba').toMatchWithAllTargets(r`\G*a`);
    });

    it('should throw if not used at the start of every top-level alternative', () => {
      expect(() => compile(r`a\G`)).toThrow();
      expect(() => compile(r`\Ga|b`)).toThrow();
      expect(() => compile(r`a|\Gb`)).toThrow();
    });
  });

  describe('string_end', () => {
    it('should match at the end of the string', () => {
      expect('ba').toMatchWithAllTargets(r`a\z`);
    });

    it('should not match before line breaks', () => {
      expect('ba\nb').not.toMatchWithAllTargets(r`a\z`);
      expect('ba\rb').not.toMatchWithAllTargets(r`a\z`);
      expect('ba\r\nb').not.toMatchWithAllTargets(r`a\z`);
      expect('ba\u{2028}b').not.toMatchWithAllTargets(r`a\z`);
      expect('ba\u{2029}b').not.toMatchWithAllTargets(r`a\z`);
    });

    it('should not match at positions other than the end of the string', () => {
      expect('ab').not.toMatchWithAllTargets(r`a\z`);
    });

    it('should apply with positive min quantification', () => {
      expect('ba').toMatchWithAllTargets(r`a\z+`);
      expect('ab').not.toMatchWithAllTargets(r`a\z+`);
      expect('ab').not.toMatchWithAllTargets(r`a\z+?`);
    });

    it('should not apply with min 0 quantification', () => {
      expect('ab').toMatchWithAllTargets(r`a\z?`);
      expect('ab').toMatchWithAllTargets(r`a\z*`);
    });
  });

  describe('string_end_newline', () => {
    it('should match at the end of the string', () => {
      expect('ba').toMatchWithAllTargets(r`a\Z`);
    });

    it('should match before a string-terminating line feed', () => {
      expect('ba\n').toMatchWithAllTargets(r`a\Z`);
    });

    it('should not match before a non-string-terminating line feed', () => {
      expect('ba\nb').not.toMatchWithAllTargets(r`a\Z`);
    });

    it('should not match before string-terminating line breaks other than line feed', () => {
      expect('ba\r').not.toMatchWithAllTargets(r`a\Z`);
      expect('ba\r\n').not.toMatchWithAllTargets(r`a\Z`);
      expect('ba\u{2028}').not.toMatchWithAllTargets(r`a\Z`);
      expect('ba\u{2029}').not.toMatchWithAllTargets(r`a\Z`);
    });

    it('should not match at positions other than the end of the string or string-terminating line feed', () => {
      expect('ab').not.toMatchWithAllTargets(r`a\Z`);
    });

    it('should apply with positive min quantification', () => {
      expect('ba').toMatchWithAllTargets(r`a\Z+`);
      expect('ab').not.toMatchWithAllTargets(r`a\Z+`);
      expect('ab').not.toMatchWithAllTargets(r`a\Z+?`);
    });

    it('should not apply with min 0 quantification', () => {
      expect('ab').toMatchWithAllTargets(r`a\Z?`);
      expect('ab').toMatchWithAllTargets(r`a\Z*`);
    });
  });

  describe('string_start', () => {
    it('should match at the start of the string', () => {
      expect('ab').toMatchWithAllTargets(r`\Aa`);
    });

    it('should not match after line breaks', () => {
      expect('b\nab').not.toMatchWithAllTargets(r`\Aa`);
      expect('b\rab').not.toMatchWithAllTargets(r`\Aa`);
      expect('b\r\nab').not.toMatchWithAllTargets(r`\Aa`);
      expect('b\u{2028}ab').not.toMatchWithAllTargets(r`\Aa`);
      expect('b\u{2029}ab').not.toMatchWithAllTargets(r`\Aa`);
    });

    it('should not match at positions other than the start of the string', () => {
      expect('ba').not.toMatchWithAllTargets(r`\Aa`);
    });

    it('should apply with positive min quantification', () => {
      expect('ab').toMatchWithAllTargets(r`\A+a`);
      expect('ba').not.toMatchWithAllTargets(r`\A+a`);
      expect('ba').not.toMatchWithAllTargets(r`\A+?a`);
    });

    it('should not apply with min 0 quantification', () => {
      expect('ba').toMatchWithAllTargets(r`\A?a`);
      expect('ba').toMatchWithAllTargets(r`\A*a`);
    });
  });

  describe('word_boundary', () => {
    describe('positive', () => {
      it('should match at ASCII word boundaries', () => {
        expect('a').toMatchWithAllTargets(r`\ba\b`);
        expect('Is a.').toMatchWithAllTargets(r`\ba\b`);
      });

      it('should not match at ASCII word non-boundaries', () => {
        expect('ba').not.toMatchWithAllTargets(r`\ba\b`);
        expect('0a').not.toMatchWithAllTargets(r`\ba\b`);
        expect('_a').not.toMatchWithAllTargets(r`\ba\b`);
      });

      it('should match at Unicode word boundaries', () => {
        expect('日本語').toMatchWithAllTargets(r`\b日本語\b`);
        expect('！日本語。').toMatchWithAllTargets(r`\b日本語\b`);
      });

      it('should not match at Unicode word non-boundaries', () => {
        expect('日本語です').not.toMatchWithAllTargets(r`\b日本語\b`);
        expect('0日本語').not.toMatchWithAllTargets(r`\b日本語\b`);
      });
    });

    describe('negative', () => {
      it('should not match at ASCII word boundaries', () => {
        expect('a').not.toMatchWithAllTargets(r`\Ba\B`);
        expect('Is a.').not.toMatchWithAllTargets(r`\Ba\B`);
      });

      it('should match at ASCII word non-boundaries', () => {
        expect('bab').toMatchWithAllTargets(r`\Ba\B`);
        expect('0a0').toMatchWithAllTargets(r`\Ba\B`);
        expect('_a_').toMatchWithAllTargets(r`\Ba\B`);
      });

      it('should not match at Unicode word boundaries', () => {
        expect('日本語').not.toMatchWithAllTargets(r`\B日本語\B`);
        expect('！日本語。').not.toMatchWithAllTargets(r`\B日本語\B`);
      });

      it('should match at Unicode word non-boundaries', () => {
        expect('これは日本語です').toMatchWithAllTargets(r`\B日本語\B`);
        expect('0日本語0').toMatchWithAllTargets(r`\B日本語\B`);
      });
    });
  });
});
