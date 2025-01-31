import {toRegExp, toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';
import {maxTestTargetForFlagGroups} from './helpers/features.js';
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
        maxTestTarget: maxTestTargetForFlagGroups,
      });
    });

    it('should be identity escape within a char class', () => {
      expect('O').toExactlyMatch(r`[\O]`);
      expect('a').not.toFindMatch(r`[\O]`);
    });
  });

  // TODO: Add me
  // describe('digit', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

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

  // TODO: Add me
  // describe('hex', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

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

  // TODO: Add me
  // describe('posix', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('property', () => {
    it(r`should be identity escape for incomplete \p \P`, () => {
      expect('p').toExactlyMatch(r`\p`);
      expect('P').toExactlyMatch(r`\P`);
      expect('p').toExactlyMatch(r`[\p]`);
      expect('P').toExactlyMatch(r`[\P]`);
    });

    it(r`should be identity escape for single-letter name without braces`, () => {
      expect('pL').toExactlyMatch(r`\pL`);
      expect('PL').toExactlyMatch(r`\PL`);
    });

    it(r`should throw for incomplete \p{ \P{`, () => {
      expect(() => toRegExpDetails(r`\p{`)).toThrow();
      expect(() => toRegExpDetails(r`\P{`)).toThrow();
      expect(() => toRegExpDetails(r`[\p{]`)).toThrow();
      expect(() => toRegExpDetails(r`[\P{]`)).toThrow();
    });

    it(r`should throw for incomplete \p \P followed by interval quantifier`, () => {
      expect(() => toRegExpDetails(r`\p{2}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{2,}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{,2}`)).toThrow();
    });

    it(r`should throw for name without A-Za-z`, () => {
      expect(() => toRegExpDetails(r`\p{}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{^}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{0}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{ }`)).toThrow();
      expect(() => toRegExpDetails(r`\p{-}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{__}`)).toThrow();
    });

    it(r`should throw for name with non-ASCII-word character`, () => {
      expect(() => toRegExpDetails(r`\p{N'Ko}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{Nko}`)).not.toThrow();
      expect(() => toRegExpDetails(r`\p{Hanunóo}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{Hanunoo}`)).not.toThrow();
    });

    it(r`should allow negating with leading ^`, () => {
      expect('0').toExactlyMatch(r`\p{^L}`);
      expect('a').toExactlyMatch(r`\P{^L}`);
      expect('0').toExactlyMatch(r`[\p{^L}]`);
      expect('a').toExactlyMatch(r`[\P{^L}]`);
    });

    it(r`should require a negating ^ to be the first character`, () => {
      expect(() => toRegExpDetails(r`\p{ ^L}`)).toThrow();
      expect(() => toRegExpDetails(r`\P{ ^L}`)).toThrow();
    });

    it(r`should throw for key prefix`, () => {
      expect(() => toRegExpDetails(r`\p{gc=L}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{General_Category=L}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{sc=Latin}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{Script=Latin}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{scx=Latin}`)).toThrow();
      expect(() => toRegExpDetails(r`\p{Script_Extensions=Latin}`)).toThrow();
    });

    it(r`should throw for properties of strings`, () => {
      // ES2024 properties of strings
      [ 'Basic_Emoji',
        'Emoji_Keycap_Sequence',
        'RGI_Emoji',
        'RGI_Emoji_Flag_Sequence',
        'RGI_Emoji_Modifier_Sequence',
        'RGI_Emoji_Tag_Sequence',
        'RGI_Emoji_ZWJ_Sequence',
      ].forEach(name => {
        expect(() => toRegExpDetails(r`\p{${name}}`)).toThrow();
      });
    });

    it(r`should allow insignificant spaces, hyphens, underscores, and casing for categories and binary properties`, () => {
      [ 'Lowercase_Letter',
        'lowercaseletter',
        'LowercaseLetter',
        'LOWERCASE LETTER',
        ' Lo W-_e r CaSe---Letter ',
      ].forEach(name => {
        expect(toRegExpDetails(r`\p{${name}}`).pattern).toBe(r`\p{Lowercase_Letter}`);
      });
      [ 'Ll',
        'll',
        'LL',
        'L L',
        '   l _-l --',
      ].forEach(name => {
        expect(toRegExpDetails(r`\p{${name}}`).pattern).toBe(r`\p{Ll}`);
      });
      [ 'LOWER CASE',
        ' l-__-owercase ',
      ].forEach(name => {
        expect(toRegExpDetails(r`\p{${name}}`).pattern).toBe(r`\p{Lowercase}`);
      });
      expect(toRegExpDetails(r`\p{asciihexdigit}`).pattern).toBe(r`\p{ASCII_Hex_Digit}`);
    });

    it(r`should use best effort to allow insignificant spaces, hyphens, underscores, and casing for scripts`, () => {
      [ 'Egyptian_Hieroglyphs',
        'EgyptianHieroglyphs',
        'egyptian-hieroglyphs',
        'EGYPTIAN  HIEROGLYPHS',
        ' Egyptian_-_Hieroglyphs ',
      ].forEach(name => {
        expect(toRegExpDetails(r`\p{${name}}`).pattern).toBe(r`\p{sc=Egyptian_Hieroglyphs}`);
      });
      expect(toRegExpDetails(r`\p{NKo}`).pattern).toBe(r`\p{sc=Nko}`);
      expect(toRegExpDetails(r`\p{Phags-pa}`).pattern).toBe(r`\p{sc=Phags_Pa}`);
    });

    // Documenting current behavior
    it(r`should handle unknown properties as scripts`, () => {
      expect(toRegExpDetails(r`\p{FakeProperty}`).pattern).toBe(r`\p{sc=Fake_Property}`);
      expect(() => toRegExp(r`\p{FakeProperty}`)).toThrow();
    });
  });

  // TODO: Add me
  // describe('space', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  // TODO: Add me
  // describe('word', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });
});
