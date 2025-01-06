import {toDetails} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {minTestTargetForFlagV} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClassIntersection', () => {
  it('should allow intersection of union and ranges without a nested class', () => {
    // Include nested class in output since JS requires it
    expect(toDetails('[ab&&c]').pattern).toBe('[[ab]&&c]');
    expect(toDetails('[a-d&&e]').pattern).toBe('[[a-d]&&e]');
    expect(toDetails('[a-de&&f]').pattern).toBe('[[a-de]&&f]');
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
    expect(toDetails('[&&]').pattern).toBe('[[]&&[]]');
    expect(toDetails('[a&&]').pattern).toBe('[a&&[]]');
    expect(toDetails('[&&a]').pattern).toBe('[[]&&a]');
    expect(toDetails('[[&&]a]').pattern).toBe('[[[]&&[]]a]');
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

  // TODO: Add remaining
});
