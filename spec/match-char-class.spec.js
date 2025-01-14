import {toDetails} from '../dist/esm/index.mjs';

describe('CharacterClass', () => {
  // See also `match-char-class-range.spec.js` and `match-char-class-intersection.spec.js`
  // Tests for specific tokens within char classes are mixed into specs elsewhere

  describe('nested class unwrapping', () => {
    it('should unwrap unneeded nested classes', () => {
      expect(toDetails('[[ab]]').pattern).toBe('[ab]');
      expect(toDetails('[[[ab]]]').pattern).toBe('[ab]');
      expect(toDetails('[[ab]cd]').pattern).toBe('[abcd]');
      expect(toDetails('[[[ab]]cd]').pattern).toBe('[abcd]');
      expect(toDetails('[[ab][cd]]').pattern).toBe('[abcd]');
      expect(toDetails('[[a]bc[d]]').pattern).toBe('[abcd]');
      expect(toDetails('[^[ab]]').pattern).toBe('[^ab]');
      expect(toDetails('[[^ab]]').pattern).toBe('[^ab]');
      expect(toDetails('[^[^ab]]').pattern).toBe('[ab]');
      expect(toDetails('[^[^[ab]]]').pattern).toBe('[ab]');
      expect(toDetails('[^[^[^ab]]]').pattern).toBe('[^ab]');
    });

    it('should not unwrap required nested classes', () => {
      expect(toDetails('[[^ab]cd]').pattern).toBe('[[^ab]cd]');
      expect(toDetails('[^[^ab]cd]').pattern).toBe('[^[^ab]cd]');
      expect(toDetails('[[^a][^b]]').pattern).toBe('[[^a][^b]]');
      expect(toDetails('[^[^a][^b]]').pattern).toBe('[^[^a][^b]]');
    });
  });

  // TODO: Add remaining (leading `]`, unbalanced, etc.)
  // TODO: Test that nested negated classes throw for target ES2018
});
