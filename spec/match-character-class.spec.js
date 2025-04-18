import {toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';
import {minTestTargetForFlagV} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

describe('CharacterClass', () => {
  // Note: Tests for specific tokens within char classes are mixed into specs elsewhere
  beforeEach(() => {
    jasmine.addMatchers(matchers);
  });

  describe('union', () => {
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

  describe('intersection', () => {
    // TODO: Add remaining specs

    it('should allow intersection of union and ranges without a nested class', () => {
      // Includes nested class in output since JS requires it
      expect(toRegExpDetails('[ab&&c]').pattern).toBe('[[ab]&&c]');
      expect(toRegExpDetails('[a-d&&e]').pattern).toBe('[[a-d]&&e]');
      expect(toRegExpDetails('[a-de&&f]').pattern).toBe('[[a-de]&&f]');
    });

    it('should fail to match an empty intersection', () => {
      expect('a').not.toFindMatch({
        pattern: '[a&&]',
        minTestTarget: minTestTargetForFlagV,
      });
      expect('a').toExactlyMatch({
        pattern: '[[&&]a]',
        minTestTarget: minTestTargetForFlagV,
      });
      expect(toRegExpDetails('[&&]').pattern).toBe('[[]&&[]]');
      expect(toRegExpDetails('[a&&]').pattern).toBe('[a&&[]]');
      expect(toRegExpDetails('[&&a]').pattern).toBe('[[]&&a]');
      expect(toRegExpDetails('[[&&]a]').pattern).toBe('[[[]&&[]]a]');
    });

    describe('nested class unwrapping', () => {
      it('should unwrap unneeded nested classes', () => {
        expect(toRegExpDetails('[[a]&&b]').pattern).toBe('[a&&b]');
        expect(toRegExpDetails('[[[a]]&&b]').pattern).toBe('[a&&b]');
      });

      it('should unwrap the child class of a union or range wrapper class', () => {
        expect(toRegExpDetails('[[ab]c&&d]').pattern).toBe('[[abc]&&d]');
        expect(toRegExpDetails('[[ab]c-f&&g]').pattern).toBe('[[abc-f]&&g]');
        expect(toRegExpDetails('[[ab][cd]&&e]').pattern).toBe('[[abcd]&&e]');
      });

      it('should not unwrap required nested classes', () => {
        expect(toRegExpDetails('[[ab]&&c]').pattern).toBe('[[ab]&&c]');
        expect(toRegExpDetails('[[a-b]&&c]').pattern).toBe('[[a-b]&&c]');
        expect(toRegExpDetails('[[^a]&&b]').pattern).toBe('[[^a]&&b]');
        expect(toRegExpDetails(r`[\w&&a]`).pattern).toBe(r`[[\p{L}\p{M}\p{N}\p{Pc}]&&a]`);
      });
    });
  });
});
