import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('VariableLengthCharacterSet', () => {
  describe('grapheme', () => {
    const graphemes = [
      '\0',
      '\r\n',
      '\xE9', // é
      '\x65\u0301', // é
      '\u2194\uFE0F', // ↔️
      '\u{1F469}\u{1F3FF}', // 👩🏿
    ];

    it('should match any Unicode grapheme', () => {
      expect(graphemes).toExactlyMatch(r`\X`);
    });

    it('should match graphemes atomically', () => {
      expect(graphemes).not.toFindMatch(r`\X\p{Any}`);
    });

    it('should be identity escape within a char class', () => {
      expect('X').toExactlyMatch(r`[\X]`);
      expect('a').not.toFindMatch(r`[\X]`);
    });
  });

  describe('newline', () => {
    it('should match any line break from the allowed newline set', () => {
      expect([
        '\r\n', '\r', '\n', '\v', '\f', '\x85', '\u2028', '\u2029',
      ]).toExactlyMatch(r`\R`);
    });

    it('should not match chars outside the allowed newline set', () => {
      expect([
        '\n\r', '\t', ' ',
      ]).not.toExactlyMatch(r`\R`);
    });

    it('should match newlines atomically', () => {
      expect('\r\n').not.toFindMatch(r`\R\n`);
    });

    it('should be identity escape within a char class', () => {
      expect('R').toExactlyMatch(r`[\R]`);
      expect('\n').not.toFindMatch(r`[\R]`);
    });
  });
});
