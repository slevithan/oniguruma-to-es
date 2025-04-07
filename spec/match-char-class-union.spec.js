import {toRegExpDetails} from '../dist/esm/index.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClass [union]', () => {
  // See also `match-char-class-range.spec.js` and `match-char-class-intersection.spec.js`
  // Tests for specific tokens within char classes are mixed into specs elsewhere
  // TODO: Add remaining specs (leading `]`, unbalanced brackets, etc.)
  // TODO: Test that unsupported nested, negated classes throw for target ES2018

  // <github.com/slevithan/oniguruma-to-es/issues/23#issuecomment-2597598227>
  describe('posix class vs nested class', () => {
    it('should throw for invalid posix classes', () => {
      [ '[[:^:]]',
        '[[:^u:]]',
        '[[:^uper:]]',
        '[[:u:]]',
        '[[:upp:]]',
        '[[:uppers:]]',
        '[[:\u212A:]]',
      ].forEach(p => {
        expect(() => toRegExpDetails(p)).toThrow();
      });
    });

    it('should interpret non-posix classes starting/ending with ":" as standard nested classes', () => {
      [ '[[:^1:]]',
        '[[:1:]]',
        '[[:upper :]]',
        '[[:upper1:]]',
        '[[:]]',
        '[[::]]',
        '[[:::]]',
        '[[:abc[:upper:]def:]]',
      ].forEach(p => {
        expect(':').toExactlyMatch(p);
      });
    });

    it('should throw for unclosed classes', () => {
      [ '[[:::]',
        '[[:[:[:[:upper:]]',
      ].forEach(p => {
        expect(() => toRegExpDetails(p)).toThrow();
      });
    });
  });

  describe('nested class unwrapping', () => {
    it('should unwrap unneeded nested classes', () => {
      expect(toRegExpDetails('[[ab]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[[[ab]]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[[ab]cd]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[[ab]]cd]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[ab][cd]]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[a]bc[d]]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[^[ab]]').pattern).toBe('[^ab]');
    });

    it('should not unwrap required nested classes', () => {
      expect(toRegExpDetails('[[^ab]cd]').pattern).toBe('[[^ab]cd]');
      expect(toRegExpDetails('[^[^ab]cd]').pattern).toBe('[^[^ab]cd]');
      expect(toRegExpDetails('[[^a][^b]]').pattern).toBe('[[^a][^b]]');
      expect(toRegExpDetails('[^[^a][^b]]').pattern).toBe('[^[^a][^b]]');
    });
  });
});
