import {toDetails, toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {maxTestTargetForFlagGroups} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion: search_start', () => {
  // Note: See specs for option `rules.ignoreUnsupportedGAnchors` in `options.spec.js`

  it('should be identity escape within a char class', () => {
    expect('G').toExactlyMatch(r`[\G]`);
    expect('\\').not.toFindMatch(r`[\G]`);
  });

  describe('without subclass', () => {
    it('should match at the start of the search', () => {
      expect('a').toExactlyMatch(r`\Ga`);
      expect([
        'a', 'b', 'hello',
      ]).toExactlyMatch(r`\Ga|\Gb|\G\w+`);
    });

    it('should not match at positions other than the start of the search', () => {
      expect('ba').not.toFindMatch(r`\Ga`);
    });

    it('should match only at the start of the search when applied repeatedly', () => {
      expect('abbcbb'.match(toRegExp(r`\G[ab]`, {global: true}))).toEqual(['a', 'b', 'b']);
    });

    it('should throw if not used at the start of every top-level alternative', () => {
      expect(() => toDetails(r`\Ga|b`)).toThrow();
      expect(() => toDetails(r`a|\Gb`)).toThrow();
    });

    it('should allow if following a directive', () => {
      expect('a').toExactlyMatch(r`\K\Ga`);
      expect(['a', 'A']).toExactlyMatch({
        pattern: r`(?i)\Ga`,
        maxTestTarget: maxTestTargetForFlagGroups,
      });
      expect(['a', 'A']).toExactlyMatch({
        pattern: r`(?i)(?m)\Ga`,
        maxTestTarget: maxTestTargetForFlagGroups,
      });
    });

    it('should allow if following an assertion', () => {
      expect('a').toExactlyMatch(r`\A\Ga`);
      expect('a').toExactlyMatch(r`\b\Ga`);
      expect('a').toExactlyMatch(r`(?=a)\Ga`);
      expect('a').toExactlyMatch(r`(?<=\A)\Ga`);
      expect('a').toExactlyMatch(r`(?<!a)\Ga`);
      expect('a').toExactlyMatch(r`(?<!a)(?=a)\Ga`);
    });

    it('should allow if an only child of a positive lookaround', () => {
      expect('a').toExactlyMatch(r`(?=\G)a`);
      expect('a').toExactlyMatch(r`(?<=\G)a`);
    });

    it('should throw if not an only child of a positive lookaround', () => {
      // Note: Never-matching cases like `(?=a\G)a` are handled separately and don't throw
      [ r`(?=\Ga)a`,
        r`(?=\G|)a`,
        r`(?!\Ga)a`,
        r`(?!\G|)a`,
        r`(?<=\Ga)a`,
        r`(?<=\G|)a`,
        r`(?<!\Ga)a`,
        r`(?<!\G|)a`,
      ].forEach(p => expect(() => toDetails(p)).withContext(p).toThrow());
    });

    it('should never match if preceded by a non-zero-length token', () => {
      expect(toRegExp(r`a\G`).sticky).toBe(false);
      expect('a').not.toFindMatch(r`a\G`);
      expect('a').not.toFindMatch(r`[a]\G`);
      expect('a').not.toFindMatch(r`\p{Any}\G`);
      expect('ab').not.toFindMatch(r`a\Gb`);
      expect('a').not.toFindMatch(r`a+\G`);
      expect('a').not.toFindMatch(r`a+?\G`);
      expect('a').not.toFindMatch(r`(?=a\G)`);
      expect('a').not.toFindMatch(r`(?=a\G)a`);
      expect('ab').not.toFindMatch(r`(?=a\Gb)`);
      expect('a').not.toFindMatch(r`(?<=a\G)`);
      expect('ab').not.toFindMatch(r`(?<=a\G)b`);
      expect('ab').not.toFindMatch(r`(?<=a\Gb)`);
      expect('a').toExactlyMatch(r`(?!a\G)a`);
      expect('a').toExactlyMatch(r`(?<!a\G)a`);
      expect('ab').toFindMatch(r`(?<!a\G)b`);
    });

    // Documenting current behavior
    it('should throw if following a quantified token', () => {
      // Min-zero length preceding `\G`
      expect(() => toDetails(r`a*\G`)).toThrow();
      expect(() => toDetails(r`a*\Ga`)).toThrow();
      expect(() => toDetails(r`(a)*\G`)).toThrow();
      expect(() => toDetails(r`(a)*\Ga`)).toThrow();
      expect(() => toDetails(r`[a]*\G`)).toThrow();
      expect(() => toDetails(r`()+\G`)).toThrow();
      expect(() => toDetails(r`(a|)+\G`)).toThrow();
      // Non-min-zero length preceding `\G`
      // Note: Never-matching cases like `a+\G` are handled separately and don't throw
      expect(() => toDetails(r`aa*\G`)).toThrow();
      expect(() => toDetails(r`(a)+\G`)).toThrow();
    });

    it('should allow if within a wrapper group', () => {
      expect('a').toExactlyMatch(r`(\Ga)`);
      expect('a').toExactlyMatch(r`(((\Ga)))`);
      expect('a').toExactlyMatch(r`(?:\Ga)`);
      expect('a').toExactlyMatch(r`(?>\Ga)`);
      expect('a').toExactlyMatch(r`(?<a>\Ga)`);
      expect('a').toExactlyMatch({
        pattern: r`(?i:\Ga)`,
        maxTestTarget: maxTestTargetForFlagGroups,
      });
    });

    it('should check within groups to determine validity', () => {
      expect('a').toExactlyMatch(r`((?=\G)a)`);
      expect('a').toExactlyMatch(r`(?:(?>^(?<n>\Ga)))`);
      expect(() => toDetails(r`(?:(?>a(?<n>\Gb)))`)).toThrow();
      expect('a').toExactlyMatch(r`\Ga|(((\Gb)))`);
      expect(() => toDetails(r`\Ga|(((b\Gc)))`)).toThrow();
      expect(['ac', 'bc']).toExactlyMatch(r`((\Ga|\Gb)c)`);
      expect(() => toDetails(r`((\Ga|b)c)`)).toThrow();
    });

    it('should allow as lone node in top-level alternative', () => {
      // Regex flavors that support \G make a subtle distinction about whether \G (after the first
      // match attempt at pos 0) matches at the end of the previous match (.NET, PCRE, Perl, Java,
      // Boost) or the start of the match attempt (Oniguruma, Onigmo). Relevant after zero-length
      // matches, where the read-head advance will make the "end of previous match" approach fail
      expect('ab'.match(toRegExp(r`\G|ab`, {global: true}))).toEqual(['', '', '']);
      expect('ab'.match(toRegExp(r`x|\G`, {global: true}))).toEqual(['', '', '']);
      expect('ab'.match(toRegExp(r`x|\G|y`, {global: true}))).toEqual(['', '', '']);
      expect('aba'.match(toRegExp(r`a|\G`, {global: true}))).toEqual(['a', '', 'a', '']);
    });

    // Documenting current behavior
    it('should throw for redundant but otherwise supportable assertions', () => {
      expect(() => toDetails(r`\G\Ga`)).toThrow();
      expect(() => toDetails(r`\Ga|\G\Gb`)).toThrow();
    });

    it('should throw if leading in a non-0-min quantified group', () => {
      expect(() => toDetails(r`(\Ga)+`)).toThrow();
      expect(() => toDetails(r`(\Ga)+\G`)).toThrow();
    });
  });

  describe('subclass strategies', () => {
    // Leading `(^|\G)` and similar
    it('should apply line_or_search_start', () => {
      // ## Leading
      // Match uses the `^` since not global
      expect(toRegExp(r`(^|\G)a`).exec('b\na')?.index).toBe(2);
      // Matched `a`s are the first three and last one
      expect('aaabaaacaa\na'.match(toRegExp(r`(^|\G)a`, {global: true}))).toEqual(['a', 'a', 'a', 'a']);
      expect(toRegExp(r`(?:^|\G)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(\G|^)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(?<n>\G|^)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(?:(\G|^)a)`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`((\G|^)a)`).exec('b\na')?.index).toBe(2);
      // ## With preceding directive/s
      expect(toRegExp(r`(?i)(^|\G)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(?i)(?x)(^|\G)a`).exec('b\na')?.index).toBe(2);
      // ## With preceding assertion/s
      expect(toRegExp(r`(?=a)(^|\G)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(?=a)(?!b)\b(^|\G)a`).exec('b\na')?.index).toBe(2);
      // ## Match indices on results are accurate
      const re = toRegExp(r`(?<n>^|\G)a`, {global: true, hasIndices: true});
      re.lastIndex = 2;
      const match = re.exec('12a');
      expect(match.indices[0][0]).toBe(2);
      expect(match.indices.groups.n[0]).toBe(2);
    });

    // Leading `(?!\G)` and similar
    it('should apply not_search_start', () => {
      // ## Leading
      expect(toRegExp(r`(?!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?<!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?:(?!\G)a)`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`((?!\G)a)`).exec('aba')?.index).toBe(2);
      // ## With preceding directive/s
      expect(toRegExp(r`(?i)(?!\G)`).exec(';;')?.index).toBe(1);
      expect(toRegExp(r`(?i)(?x)(?!\G)`).exec(';;')?.index).toBe(1);
      // ## With preceding assertion/s
      expect(toRegExp(r`(?<=;)(?!\G)`).exec(';;')?.index).toBe(1);
      expect(toRegExp(r`(?=;)^(?!\G)`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?=;)(?!\G)^`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?!\G)(?=;)^`).exec(';;\n;')?.index).toBe(3);
      // ## With preceding `\G`
      expect(() => toDetails(r`\G(?!\G)`)).toThrow();
      expect(() => toDetails(r`(?=\G)(?!\G)`)).toThrow();
      // ## With preceding non-zero-length node
      expect(() => toDetails(r`a(?!\G)a`)).toThrow();
      expect(() => toDetails(r`a+(?!\G)a`)).toThrow();
      // ## With preceding min-zero-length quantified node
      expect(() => toDetails(r`a*(?!\G)a`)).toThrow();
      // expect(toRegExp(r`a*(?!\G)a`).exec('abcaaa')?.[0]).toBe('aaa');
      // expect('abcaaa'.match(toRegExp(r`a*(?!\G)`, {global}))).toEqual(['a', '', 'aaa']);
    });
  });
});
