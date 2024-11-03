import {r} from '../src/utils.js';
import {maxTestTargetForPatternMods} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterSet', () => {
  describe('any', () => {
    it('should match any character', () => {
      expect([
        '\0', '\n', '\r', 'a', '\x85', '\u2028', '\u2029', '\u{10000}', '\u{10FFFF}',
      ]).toExactlyMatch(r`\O`);
    });

    it('should match line feed with flag m disabled', () => {
      expect('\n').toExactlyMatch({
        pattern: r`(?-m)\O`,
        maxTarget: maxTestTargetForPatternMods,
      });
    });

    it('should be identity escape within a char class', () => {
      expect('O').toExactlyMatch(r`[\O]`);
      expect('a').not.toFindMatch(r`[\O]`);
    });
  });

  describe('dot', () => {
    it('should match any character except line feed', () => {
      expect('\n').not.toFindMatch('.');
      expect([
        '\0', '\r', 'a', '\x85', '\u2028', '\u2029', '\u{10000}', '\u{10FFFF}',
      ]).toExactlyMatch('.');
    });

    it('should match line feed with flag m enabled', () => {
      expect('\n').toExactlyMatch({pattern: '.', flags: 'm'});
    });

    it('should be literal within a char class', () => {
      expect('.').toExactlyMatch('[.]');
      expect('a').not.toFindMatch('[.]');
    });
  });

  describe('non_newline', () => {
    it('should match any character except line feed', () => {
      expect('\n').not.toFindMatch('.');
      expect([
        '\0', '\r', 'a', '\x85', '\u2028', '\u2029', '\u{10000}', '\u{10FFFF}',
      ]).toExactlyMatch(r`\N`);
    });

    it('should not match line feed with flag m enabled', () => {
      expect('\n').not.toFindMatch({pattern: r`\N`, flags: 'm'});
    });

    it('should be identity escape within a char class', () => {
      expect('N').toExactlyMatch(r`[\N]`);
      expect('a').not.toFindMatch(r`[\N]`);
    });
  });

  // TODO: Add remaining
});
