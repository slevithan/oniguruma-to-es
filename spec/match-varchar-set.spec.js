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
      for (const grapheme of graphemes) {
        expect(grapheme).toMatchWithAllTargets(r`\A\X\z`);
      }
    });

    it(r`should match graphemes atomically`, () => {
      for (const grapheme of graphemes) {
        expect(grapheme).not.toMatchWithAllTargets(r`\A\X(?m:.)\z`);
      }
    });
  });

  describe('newline', () => {
    it('should match any line break from the accepted newline set', () => {
      const newlines = ['\r\n', '\r', '\n', '\v', '\f', '\x85', '\u2028', '\u2029'];
      for (const newline of newlines) {
        expect(newline).toMatchWithAllTargets(r`\A\R\z`);
      }
    });

    it('should not match chars outside the accepted newline set', () => {
      const nonNewlines = ['\n\r', ' ', 't'];
      for (const non of nonNewlines) {
        expect(non).not.toMatchWithAllTargets(r`\A\R\z`);
      }
    });

    it(r`should match \r\n atomically`, () => {
      expect('\r\n').not.toMatchWithAllTargets(r`\A\R\n\z`);
    });
  });
});
