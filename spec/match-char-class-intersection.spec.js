import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';

describe('CharacterClassIntersection', () => {
  // TODO: Add remaining

  describe('for union and ranges', () => {
    it('should allow intersection of union and ranges without a nested class', () => {
      expect(toDetails('[ab&&c]').pattern).toBe('[[ab]&&c]');
      expect(toDetails('[a-d&&e]').pattern).toBe('[[a-d]&&e]');
      expect(toDetails('[a-de&&f]').pattern).toBe('[[a-de]&&f]');
    });
  });

  describe('nested class unwrapping', () => {
    it('should unwrap unneeded nested classes', () => {
      expect(toDetails('[[a]&&b]').pattern).toBe('[a&&b]');
      expect(toDetails('[[[a]]&&b]').pattern).toBe('[a&&b]');
      expect(toDetails('[[^[^a]]&&[b]]').pattern).toBe('[a&&b]');
    });

    it('should unwrap the child class of a union or range wrapper class', () => {
      expect(toDetails('[[ab]c&&d]').pattern).toBe('[[abc]&&d]');
      expect(toDetails('[[ab]c-f&&g]').pattern).toBe('[[abc-f]&&g]');
      expect(toDetails('[[ab][cd]&&e]').pattern).toBe('[[abcd]&&e]');
    });

    it('should not unwrap required nested classes', () => {
      expect(toDetails('[[ab]&&c]').pattern).toBe('[[ab]&&c]');
      expect(toDetails('[[a-b]&&c]').pattern).toBe('[[a-b]&&c]');
      expect(toDetails('[[^a]&&b]').pattern).toBe('[[^a]&&b]');
      expect(toDetails(r`[\w&&a]`).pattern).toBe(r`[[\p{L}\p{M}\p{N}\p{Pc}]&&a]`);
    });
  });
});
