import {toDetails} from '../dist/index.mjs';

describe('CharacterClass', () => {
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

  // TODO: Add remaining
  // TODO: Test that nested negated classes throw for target ES2018
});
