import {compile} from '../dist/index.mjs';
import {cp, r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Character', () => {
  describe('literal', () => {
    it('should match literal chars', () => {
      expect('a').toExactlyMatch('a');
      expect('Multiple literal chars!').toExactlyMatch('Multiple literal chars!');
    });
  });

  describe('control', () => {
    it(r`should match control char with \cx`, () => {
      expect('\x01').toExactlyMatch(r`\cA`);
      expect('\x01').toExactlyMatch(r`\ca`);
      expect('\x1A').toExactlyMatch(r`\cZ`);
      expect('\x1A').toExactlyMatch(r`\cz`);
    });

    it(r`should match control char with \C-x`, () => {
      expect('\x01').toExactlyMatch(r`\C-A`);
      expect('\x01').toExactlyMatch(r`\C-a`);
      expect('\x1A').toExactlyMatch(r`\C-Z`);
      expect('\x1A').toExactlyMatch(r`\C-z`);
    });

    // Currently unsupported: control chars other than A-Za-z
    it('should throw for unsupported control char', () => {
      expect(() => compile(r`\c.`)).toThrow();
      expect(() => compile(r`\C-.`)).toThrow();
    });

    it(r`should throw for incomplete \c`, () => {
      expect(() => compile(r`\c`)).toThrow();
    });

    it(r`should throw for incomplete \C`, () => {
      expect(() => compile(r`\C`)).toThrow();
      expect(() => compile(r`\C-`)).toThrow();
    });
  });

  describe('escape', () => {
    it('should match supported letter escapes', () => {
      expect('\x07').toExactlyMatch(r`\a`);
      // `\b` supported in char classes only
      expect('\x1B').toExactlyMatch(r`\e`);
      expect('\f').toExactlyMatch(r`\f`);
      expect('\n').toExactlyMatch(r`\n`);
      expect('\r').toExactlyMatch(r`\r`);
      expect('\t').toExactlyMatch(r`\t`);
      expect('\v').toExactlyMatch(r`\v`);
    });
  });

  describe('escaped metacharacter', () => {
    it('should match escaped metacharacters', () => {
      const baseMetachars = [
        '$', '(', ')', '*', '+', '.', '?', '[', '\\', ']', '^', '{', '|', '}',
      ];
      for (const char of baseMetachars) {
        expect(char).toExactlyMatch(`\\${char}`);
      }
    });

    it(`should throw for incomplete \\`, () => {
      expect(() => compile(`\\`)).toThrow();
    });
  });

  describe('identity escape', () => {
    it('should match identity escapes', () => {
      const baseNonmetachars = [
        '\0', '!', '~', ' ', '\n', 'E', 'm', '£', '\uFFFF',
      ];
      for (const char of baseNonmetachars) {
        expect(char).toExactlyMatch(`\\${char}`);
      }
    });

    it('should throw for multibyte escapes', () => {
      const multibyte = [
        '💖', '\u{10000}', '\u{10FFFF}',
      ];
      for (const char of multibyte) {
        expect(() => compile(`\\${char}`)).toThrow();
      }
    });
  });

  describe('meta-code', () => {
    it('should throw for unsupported meta-code', () => {
      expect(() => compile(r`\M`)).toThrow();
      expect(() => compile(r`\M-`)).toThrow();
      // Currently unsupported
      expect(() => compile(r`\M-\1`)).toThrow();
    });

    it('should throw for unsupported meta control char', () => {
      expect(() => compile(r`\M-\C`)).toThrow();
      expect(() => compile(r`\M-\C-`)).toThrow();
      // Currently unsupported
      expect(() => compile(r`\M-\C-A`)).toThrow();
    });
  });

  describe('escaped number', () => {
    it('should match null', () => {
      expect('\0').toExactlyMatch(r`\0`);
      expect('\0').toExactlyMatch(r`\00`);
      expect('\0').toExactlyMatch(r`\000`);
    });

    it('should match null followed by literal digits', () => {
      expect('\u{0}0').toExactlyMatch(r`\0000`);
      expect('\u{0}1').toExactlyMatch(r`\0001`);
    });

    it('should throw for invalid backrefs', () => {
      for (let i = 1; i < 10; i++) {
        // Escaped single digit 1-9 outside char classes is always treated as a backref
        expect(() => compile(`\\${i}`)).toThrow();
      }
    });

    it('should match octals', () => {
      expect('\u{1}').toExactlyMatch(r`\01`);
      expect('\u{1}').toExactlyMatch(r`\001`);
      expect(cp(0o17)).toExactlyMatch(r`\17`);
      expect(cp(0o777)).toExactlyMatch(r`\777`);
    });

    it('should match octals followed by literal digits', () => {
      expect(`${cp(0o100)}0`).toExactlyMatch(r`\1000`);
      expect('\u{1}8').toExactlyMatch(r`\18`);
      expect('\u{1}9').toExactlyMatch(r`\19`);
      expect('\u{1}90').toExactlyMatch(r`\190`);
      expect(`${cp(0o11)}8`).toExactlyMatch(r`\118`);
      expect(`${cp(0o11)}9`).toExactlyMatch(r`\119`);
      expect(`${cp(0o11)}90`).toExactlyMatch(r`\1190`);
    });

    it('should match identity escapes followed by literal digits', () => {
      expect('80').toExactlyMatch(r`\80`);
      expect('90').toExactlyMatch(r`\90`);
      expect('900').toExactlyMatch(r`\900`);
    });
  });

  describe('unicode', () => {
    it(r`should match hex char code with \xN`, () => {
      expect('\u{1}').toExactlyMatch(r`\x1`);
      expect('\u{A}').toExactlyMatch(r`\xA`);
      expect('\u{A}').toExactlyMatch(r`\xa`);
    });

    it(r`should match hex char code with \xNN`, () => {
      expect('\u{1}').toExactlyMatch(r`\x01`);
      expect('\u{1}1').toExactlyMatch(r`\x011`);
      expect('\u{A}').toExactlyMatch(r`\x0A`);
      expect('\u{A}').toExactlyMatch(r`\x0a`);
    });

    it(r`should throw for incomplete \x`, () => {
      expect(() => compile(r`\x`)).toThrow();
      expect(() => compile(r`\xG0`)).toThrow();
    });

    it(r`should match hex char code with \uNNNN`, () => {
      expect('\u{1}').toExactlyMatch(r`\u0001`);
      expect('\u{A}').toExactlyMatch(r`\u000A`);
      expect('\u{A}').toExactlyMatch(r`\u000a`);
    });

    it(r`should throw for incomplete \u`, () => {
      expect(() => compile(r`\u`)).toThrow();
      expect(() => compile(r`\uG000`)).toThrow();
      expect(() => compile(r`\u0`)).toThrow();
      expect(() => compile(r`\u00`)).toThrow();
      expect(() => compile(r`\u000`)).toThrow();
    });

    it(r`should match hex char code with \u{N...}`, () => {
      expect('\u{1}').toExactlyMatch(r`\u{1}`);
      expect('\u{A}').toExactlyMatch(r`\u{A}`);
      expect('\u{a}').toExactlyMatch(r`\u{a}`);
      expect('\u{10FFFF}').toExactlyMatch(r`\u{10FFFF}`);
    });

    it(r`should allow whitespace with \u{N...}`, () => {
      expect('\u{1}').toExactlyMatch(r`\u{ 1}`);
      expect('\u{1}').toExactlyMatch(r`\u{1 }`);
      expect('\u{1}').toExactlyMatch(r`\u{  1  }`);
    });

    it(r`should allow leading 0s up to 6 total hex digits with \u{N...}`, () => {
      expect('\u{1}').toExactlyMatch(r`\u{01}`);
      expect('\u{1}').toExactlyMatch(r`\u{000001}`);
      expect('\u{10}').toExactlyMatch(r`\u{000010}`);
    });

    it(r`should throw for incomplete \u{N...}`, () => {
      expect(() => compile(r`\u{`)).toThrow();
      expect(() => compile(r`\u{0`)).toThrow();
    });

    it(r`should throw for invalid \u{N...}`, () => {
      expect(() => compile(r`\u{0 0}`)).toThrow();
      expect(() => compile(r`\u{G}`)).toThrow();
      expect(() => compile(r`\u{0000001}`)).toThrow();
      expect(() => compile(r`\u{0000010}`)).toThrow();
      expect(() => compile(r`\u{110000}`)).toThrow();
    });
  });
});
