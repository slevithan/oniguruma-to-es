import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterSet', () => {
  describe('any', () => {
    it('should match any character except line feed', () => {
      expect('\n').not.toFindMatch('.');
      expect([
        '\0', '\r', 'a', '\u{10000}',
      ]).toExactlyMatch('.');
    });

    it('should match line feed with flag m enabled', () => {
      expect('\n').toExactlyMatch({pattern: '.', flags: 'm'});
    });
  });

  // TODO: Add remaining
});
