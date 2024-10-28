import {compile} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Character', () => {
  describe('literal', () => {
    it('should match literal chars', () => {
      expect('a').toMatchWithAllTargets('a');
      expect('Multiple chars!').toMatchWithAllTargets('Multiple chars!');
    });
  });

  describe('control', () => {
    it(r`should match control char with \cx`, () => {
      expect('\x01').toMatchWithAllTargets(r`\cA`);
      expect('\x01').toMatchWithAllTargets(r`\ca`);
      expect('\x1A').toMatchWithAllTargets(r`\cZ`);
      expect('\x1A').toMatchWithAllTargets(r`\cz`);
    });

    it(r`should match control char with \C-x`, () => {
      expect('\x01').toMatchWithAllTargets(r`\C-A`);
      expect('\x01').toMatchWithAllTargets(r`\C-a`);
      expect('\x1A').toMatchWithAllTargets(r`\C-Z`);
      expect('\x1A').toMatchWithAllTargets(r`\C-z`);
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
      expect('\x07').toMatchWithAllTargets(r`\a`);
      // `\b` supported in char class only
      expect('\x1B').toMatchWithAllTargets(r`\e`);
      expect('\f').toMatchWithAllTargets(r`\f`);
      expect('\n').toMatchWithAllTargets(r`\n`);
      expect('\r').toMatchWithAllTargets(r`\r`);
      expect('\t').toMatchWithAllTargets(r`\t`);
      expect('\v').toMatchWithAllTargets(r`\v`);
    });
  });

  describe('escaped metacharacter', () => {
    it('should match escaped metacharacters', () => {
      const baseMetachars = [
        '$', '(', ')', '*', '+', '.', '?', '[', '\\', ']', '^', '{', '|', '}',
      ];
      for (const char of baseMetachars) {
        expect(char).toMatchWithAllTargets(`\\${char}`);
      }
    });

    it(`should throw for incomplete \\`, () => {
      expect(() => compile(`\\`)).toThrow();
    });
  });

  describe('identity escape', () => {
    it('should match identity escapes', () => {
      const baseUnspecial = [
        '\0', '!', '~', ' ', '\n', 'E', 'm', '£', '\uFFFF',
      ];
      for (const char of baseUnspecial) {
        expect(char).toMatchWithAllTargets(`\\${char}`);
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
      expect('\0').toMatchWithAllTargets(r`\0`);
      expect('\0').toMatchWithAllTargets(r`\00`);
      expect('\0').toMatchWithAllTargets(r`\000`);
    });

    it('should match null followed by literal digits', () => {
      expect('\u{0}0').toMatchWithAllTargets(r`\0000`);
      expect('\u{0}1').toMatchWithAllTargets(r`\0001`);
    });

    it('should throw for invalid backrefs', () => {
      for (let i = 1; i < 10; i++) {
        // Escaped single digit 1-9 is always treated as a backref
        expect(() => compile(`\\${i}`)).toThrow();
      }
    });

    it('should match octals', () => {
      expect('\u{1}').toMatchWithAllTargets(r`\01`);
      expect('\u{1}').toMatchWithAllTargets(r`\001`);
      expect(String.fromCodePoint(0o17)).toMatchWithAllTargets(r`\17`);
      expect(String.fromCodePoint(0o777)).toMatchWithAllTargets(r`\777`);
    });

    it('should match octals followed by literal digits', () => {
      expect('\u{0}1').toMatchWithAllTargets(r`\0001`);
      expect(`${String.fromCodePoint(0o100)}0`).toMatchWithAllTargets(r`\1000`);
      expect('\u{1}8').toMatchWithAllTargets(r`\18`);
      expect('\u{1}9').toMatchWithAllTargets(r`\19`);
      expect('\u{1}90').toMatchWithAllTargets(r`\190`);
      expect(`${String.fromCodePoint(0o11)}8`).toMatchWithAllTargets(r`\118`);
      expect(`${String.fromCodePoint(0o11)}9`).toMatchWithAllTargets(r`\119`);
      expect(`${String.fromCodePoint(0o11)}90`).toMatchWithAllTargets(r`\1190`);
    });

    it('should match identity escape followed by literal digits', () => {
      expect('80').toMatchWithAllTargets(r`\80`);
      expect('90').toMatchWithAllTargets(r`\90`);
      expect('900').toMatchWithAllTargets(r`\900`);
    });
  });

  describe('unicode', () => {
    it(r`should match hex char code with \xN`, () => {
      expect('\u{1}').toMatchWithAllTargets(r`\x1`);
    });

    it(r`should match hex char code with \xNN`, () => {
      expect('\u{1}').toMatchWithAllTargets(r`\x01`);
      expect('\u{1}1').toMatchWithAllTargets(r`\x011`);
    });

    it(r`should throw for incomplete \x`, () => {
      expect(() => compile(r`\x`)).toThrow();
      expect(() => compile(r`\xG0`)).toThrow();
    });

    it(r`should match hex char code with \uNNNN`, () => {
      expect('\x01').toMatchWithAllTargets(r`\x01`);
    });

    it(r`should throw for incomplete \u`, () => {
      expect(() => compile(r`\u`)).toThrow();
      expect(() => compile(r`\uG000`)).toThrow();
      expect(() => compile(r`\u0`)).toThrow();
      expect(() => compile(r`\u00`)).toThrow();
      expect(() => compile(r`\u000`)).toThrow();
    });

    it(r`should match hex char code with \u{N...}`, () => {
      expect('\u{1}').toMatchWithAllTargets(r`\u{1}`);
      expect('\u{1}').toMatchWithAllTargets(r`\u{ 1}`);
      expect('\u{1}').toMatchWithAllTargets(r`\u{1 }`);
      expect('\u{1}').toMatchWithAllTargets(r`\u{ 1 }`);
      expect('\u{1}').toMatchWithAllTargets(r`\u{01}`);
      expect('\u{1}').toMatchWithAllTargets(r`\u{000001}`);
      expect('\u{10FFFF}').toMatchWithAllTargets(r`\u{10FFFF}`);
    });

    it(r`should throw for incomplete or invalid \u{N...}`, () => {
      expect(() => compile(r`\u{`)).toThrow();
      expect(() => compile(r`\u{0`)).toThrow();
      expect(() => compile(r`\u{0 0}`)).toThrow();
      expect(() => compile(r`\u{G}`)).toThrow();
      expect(() => compile(r`\u{0000001}`)).toThrow();
      expect(() => compile(r`\u{110000}`)).toThrow();
    });
  });
});
