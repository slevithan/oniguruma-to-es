import {toRegExpDetails} from '../dist/esm/index.js';
import {cp, r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

describe('Character', () => {
  beforeEach(() => {
    jasmine.addMatchers(matchers);
  });

  describe('literal', () => {
    it('should match literal chars', () => {
      expect('a').toExactlyMatch('a');
      expect('😊').toExactlyMatch('😊'); // U+1F60A
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

    // Not yet supported: control char identifier other than A-Za-z
    it('should throw for unsupported control char', () => {
      expect(() => toRegExpDetails(r`\c.`)).toThrow();
      expect(() => toRegExpDetails(r`\C-.`)).toThrow();
    });

    it(r`should throw for incomplete \c`, () => {
      expect(() => toRegExpDetails(r`\c`)).toThrow();
    });

    it(r`should throw for incomplete \C`, () => {
      expect(() => toRegExpDetails(r`\C`)).toThrow();
      expect(() => toRegExpDetails(r`\C-`)).toThrow();
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
      // In char class
      expect('\x07').toExactlyMatch(r`[\a]`);
      expect('\x08').toExactlyMatch(r`[\b]`);
      expect('\x1B').toExactlyMatch(r`[\e]`);
      expect('\f').toExactlyMatch(r`[\f]`);
      expect('\n').toExactlyMatch(r`[\n]`);
      expect('\r').toExactlyMatch(r`[\r]`);
      expect('\t').toExactlyMatch(r`[\t]`);
      expect('\v').toExactlyMatch(r`[\v]`);
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
      expect(() => toRegExpDetails(`\\`)).toThrow();
    });
  });

  describe('identity escape', () => {
    it('should match BMP identity escapes', () => {
      const baseNonmetachars = [
        '\0', '!', '~', ' ', '\n', 'E', 'm', '£', '\uFFFF',
      ];
      for (const char of baseNonmetachars) {
        expect(char).toExactlyMatch(`\\${char}`);
      }
    });

    it('should match astral identity escapes', () => {
      const astral = [
        '💖', '\u{10000}', '\u{10FFFF}',
      ];
      for (const char of astral) {
        expect(char).toExactlyMatch(`\\${char}`);
      }
    });
  });

  describe('meta', () => {
    // Not yet supported
    it('should throw for unsupported meta', () => {
      expect(() => toRegExpDetails(r`\M-\1`)).toThrow();
    });

    it('should throw for incomplete meta', () => {
      expect(() => toRegExpDetails(r`\M`)).toThrow();
      expect(() => toRegExpDetails(r`\M-`)).toThrow();
    });

    // Not yet supported
    it('should throw for unsupported meta control char', () => {
      expect(() => toRegExpDetails(r`\M-\C-A`)).toThrow();
    });

    it('should throw for incomplete meta control char', () => {
      expect(() => toRegExpDetails(r`\M-\C`)).toThrow();
      expect(() => toRegExpDetails(r`\M-\C-`)).toThrow();
    });
  });

  describe('escaped number', () => {
    it('should match null', () => {
      expect('\0').toExactlyMatch(r`\0`);
      expect('\0').toExactlyMatch(r`\00`);
      expect('\0').toExactlyMatch(r`\000`);
      // In char class
      expect('\0').toExactlyMatch(r`[\0]`);
      expect('\0').toExactlyMatch(r`[\00]`);
      expect('\0').toExactlyMatch(r`[\000]`);
      expect('0').not.toFindMatch(r`[\000]`);
    });

    it('should match null followed by literal digits', () => {
      expect('\u{0}0').toExactlyMatch(r`\0000`);
      expect('\u{0}1').toExactlyMatch(r`\0001`);
      // In char class
      expect('0').toExactlyMatch(r`[\0000]`);
      expect('1').toExactlyMatch(r`[\0001]`);
    });

    it('should throw for invalid backrefs', () => {
      for (let i = 1; i < 10; i++) {
        // Escaped single digit 1-9 outside char classes is always treated as a backref
        expect(() => toRegExpDetails(`\\${i}`)).toThrow();
      }
    });

    it('should match octals', () => {
      expect('\u{1}').toExactlyMatch(r`\01`);
      expect('\u{1}').toExactlyMatch(r`\001`);
      expect(cp(0o17)).toExactlyMatch(r`\17`);
      expect(cp(0o177)).toExactlyMatch(r`\177`);
      // In char class
      expect('\u{1}').toExactlyMatch(r`[\1]`);
      expect('\u{1}').toExactlyMatch(r`[\01]`);
      expect('\u{1}').toExactlyMatch(r`[\001]`);
      expect(cp(0o17)).toExactlyMatch(r`[\17]`);
      expect(cp(0o177)).toExactlyMatch(r`[\177]`);
    });

    it(r`should throw for octal UTF-8 encoded byte above \177`, () => {
      expect(() => toRegExpDetails(r`\200`)).toThrow();
      expect(() => toRegExpDetails(r`\777`)).toThrow();
      // In char class
      expect(() => toRegExpDetails(r`[\200]`)).toThrow();
      expect(() => toRegExpDetails(r`[\777]`)).toThrow();
    });

    it('should match octals followed by literal digits', () => {
      expect(`${cp(0o100)}0`).toExactlyMatch(r`\1000`);
      expect('\u{1}8').toExactlyMatch(r`\18`);
      expect('\u{1}9').toExactlyMatch(r`\19`);
      expect('\u{1}90').toExactlyMatch(r`\190`);
      expect(`${cp(0o11)}8`).toExactlyMatch(r`\118`);
      expect(`${cp(0o11)}9`).toExactlyMatch(r`\119`);
      expect(`${cp(0o11)}90`).toExactlyMatch(r`\1190`);
      // In char class
      expect('0').toExactlyMatch(r`[\1000]`);
      expect('8').toExactlyMatch(r`[\18]`);
      expect('9').toExactlyMatch(r`[\19]`);
      expect('0').toExactlyMatch(r`[\190]`);
      expect('8').toExactlyMatch(r`[\118]`);
      expect('9').toExactlyMatch(r`[\119]`);
      expect('0').toExactlyMatch(r`[\1190]`);
    });

    it('should match identity escapes', () => {
      // Single-digit `\N` outside of char class is always handled as a backref; not relevant here
      expect('8').toExactlyMatch(r`[\8]`);
      expect('9').toExactlyMatch(r`[\9]`);
    });

    it('should match identity escapes followed by literal digits', () => {
      expect('80').toExactlyMatch(r`\80`);
      expect('90').toExactlyMatch(r`\90`);
      expect('900').toExactlyMatch(r`\900`);
      // In char class
      expect('0').toExactlyMatch(r`[\80]`);
      expect('0').toExactlyMatch(r`[\90]`);
    });
  });

  describe('hex char code', () => {
    it(r`should match hex char code with \xN`, () => {
      expect('\u{1}').toExactlyMatch(r`\x1`);
      expect('\u{A}').toExactlyMatch(r`\xA`);
      expect('\u{A}').toExactlyMatch(r`\xa`);
    });

    it(r`should match hex char code with \xNN up to 7F`, () => {
      expect('\u{1}').toExactlyMatch(r`\x01`);
      expect('\u{1}1').toExactlyMatch(r`\x011`);
      expect('\u{A}').toExactlyMatch(r`\x0A`);
      expect('\u{A}').toExactlyMatch(r`\x0a`);
      expect('\u{7F}').toExactlyMatch(r`\x7F`);
    });

    it(r`should match hex char code UTF-8 encoded byte sequences \xNN (above 7F)`, () => {
      expect('\u{20AC}').toExactlyMatch(r`\xE2\x82\xAC`); // €
      expect('\u{20AC}\u{20AC}').toExactlyMatch(r`\xE2\x82\xAC\xE2\x82\xAC`); // €€
      expect('\u{20AC}\u{7F}\u{20AC}').toExactlyMatch(r`\xE2\x82\xAC\x7F\xE2\x82\xAC`); // €€
      expect('\u{9A69}').toExactlyMatch(r`\xE9\xA9\xA9`); // 驩
      expect('\u{FEFF}').toExactlyMatch(r`\xEF\xBB\xBF`); // ZWNBSP/BOM
      expect('\u{17F}').toExactlyMatch(r`\xC5\xBF`); // ſ
    });

    it(r`should throw for invalid UTF-8 encoded byte sequences \xNN (above 7F)`, () => {
      expect(() => toRegExpDetails(r`\x80`)).toThrow();
      expect(() => toRegExpDetails(r`\xF4`)).toThrow();
      expect(() => toRegExpDetails(r`\xEF\xC0\xBB`)).toThrow();
      // In Onig, the unused encoded UTF-8 bytes F5-FF don't throw, but they don't match anything
      // (likely a bug in Onig)
      expect(() => toRegExpDetails(r`\xFF`)).toThrow();
    });

    it(r`should throw for incomplete \x`, () => {
      expect(() => toRegExpDetails(r`\x`)).toThrow();
      expect(() => toRegExpDetails(r`\x.`)).toThrow();
      expect(() => toRegExpDetails(r`[\x]`)).toThrow();
    });

    it(r`should match hex char code with \uNNNN`, () => {
      expect('\u{1}').toExactlyMatch(r`\u0001`);
      expect('\u{A}').toExactlyMatch(r`\u000A`);
      expect('\u{A}').toExactlyMatch(r`\u000a`);
    });

    it(r`should throw for incomplete \u`, () => {
      expect(() => toRegExpDetails(r`\u`)).toThrow();
      expect(() => toRegExpDetails(r`\u.`)).toThrow();
      expect(() => toRegExpDetails(r`[\u]`)).toThrow();
      expect(() => toRegExpDetails(r`\u0`)).toThrow();
      expect(() => toRegExpDetails(r`\u00`)).toThrow();
      expect(() => toRegExpDetails(r`\u000`)).toThrow();
    });

    it(r`should match hex char code with \x{N...}`, () => {
      expect('\u{1}').toExactlyMatch(r`\x{1}`);
      expect('\u{A}').toExactlyMatch(r`\x{A}`);
      expect('\u{a}').toExactlyMatch(r`\x{a}`);
      expect('\u{10FFFF}').toExactlyMatch(r`\x{10FFFF}`);
    });

    it(r`should allow leading 0s up to 8 total hex digits with \x{N...}`, () => {
      expect('\u{1}').toExactlyMatch(r`\x{01}`);
      expect('\u{1}').toExactlyMatch(r`\x{00000001}`);
      expect('\u{10}').toExactlyMatch(r`\x{00000010}`);
      expect(() => toRegExpDetails(r`\x{000000001}`)).toThrow();
    });

    it(r`should throw for incomplete \x{N...}`, () => {
      expect(() => toRegExpDetails(r`\x{`)).toThrow();
      expect(() => toRegExpDetails(r`\x{0`)).toThrow();
      expect(() => toRegExpDetails(r`\x{,2}`)).toThrow();
      expect(() => toRegExpDetails(r`\x{2,}`)).toThrow();
    });

    it(r`should throw for invalid \x{N...}`, () => {
      expect(() => toRegExpDetails(r`\x{G}`)).toThrow();
      expect(() => toRegExpDetails(r`\x{0x0}`)).toThrow();
    });

    it(r`should throw for \x{N...} out of range`, () => {
      expect(() => toRegExpDetails(r`\x{110000}`)).toThrow();
      expect(() => toRegExpDetails(r`[\x{110000}]`)).toThrow();
      expect(() => toRegExpDetails(r`[\x{110000}-\x{110000}]`)).toThrow();
    });

    it(r`should allow \x{N...} out of range at char class range end`, () => {
      expect('\u{10FFFF}').toExactlyMatch(r`[\0-\x{110000}]`);
      expect('\u{10FFFF}').toExactlyMatch(r`[\0-\x{FFFFFFFF}]`);
      // 9 hex digits is invalid
      expect(() => toRegExpDetails(r`[\0-\x{100000000}]`)).toThrow();
    });
  });

  describe('enclosed octal', () => {
    // Not yet supported
    it('should throw for unsupported octal code point', () => {
      expect(() => toRegExpDetails(r`\o{0}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{177}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{7777}`)).toThrow();
    });

    it(r`should match \o without { as identity escape`, () => {
      expect('o').toExactlyMatch(r`\o`);
    });

    // Not an error in Onig
    it(r`should throw for incomplete \o{`, () => {
      expect(() => toRegExpDetails(r`\o{`)).toThrow();
      expect(() => toRegExpDetails(r`\o{-}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{A}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{ 1}`)).toThrow();
      // Quantified identity escape!
      expect(() => toRegExpDetails(r`\o{,1}`)).toThrow();
    });

    it(r`should throw for invalid \o{N...}`, () => {
      expect(() => toRegExpDetails(r`\o{1,}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{8}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{18}`)).toThrow();
      expect(() => toRegExpDetails(r`\o{1A}`)).toThrow();
    });
  });
});
