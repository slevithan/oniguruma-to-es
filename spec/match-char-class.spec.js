import {toRegExpDetails} from '../dist/esm/index.js';

describe('CharacterClass', () => {
  // See also `match-char-class-range.spec.js` and `match-char-class-intersection.spec.js`
  // Tests for specific tokens within char classes are mixed into specs elsewhere

  describe('nested class unwrapping', () => {
    it('should unwrap unneeded nested classes', () => {
      expect(toRegExpDetails('[[ab]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[[[ab]]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[[ab]cd]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[[ab]]cd]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[ab][cd]]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[[a]bc[d]]').pattern).toBe('[abcd]');
      expect(toRegExpDetails('[^[ab]]').pattern).toBe('[^ab]');
      expect(toRegExpDetails('[[^ab]]').pattern).toBe('[^ab]');
      expect(toRegExpDetails('[^[^ab]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[^[^[ab]]]').pattern).toBe('[ab]');
      expect(toRegExpDetails('[^[^[^ab]]]').pattern).toBe('[^ab]');
    });

    it('should not unwrap required nested classes', () => {
      expect(toRegExpDetails('[[^ab]cd]').pattern).toBe('[[^ab]cd]');
      expect(toRegExpDetails('[^[^ab]cd]').pattern).toBe('[^[^ab]cd]');
      expect(toRegExpDetails('[[^a][^b]]').pattern).toBe('[[^a][^b]]');
      expect(toRegExpDetails('[^[^a][^b]]').pattern).toBe('[^[^a][^b]]');
    });
  });

  // TODO: Add remaining (leading `]`, unbalanced, etc.)
  // TODO: Test that nested negated classes throw for target ES2018
});
