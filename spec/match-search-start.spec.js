import {toDetails, toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {maxTestTargetForFlagGroups} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion: Search start', () => {
  it('should be identity escape within a char class', () => {
    expect('G').toExactlyMatch(r`[\G]`);
    expect('\\').not.toFindMatch(r`[\G]`);
  });

  describe('without subclass', () => {
    // TODO: Consider enabling `avoidSubclass` for all of these except when specifically testing
    // subclass strategies

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
      expect(() => toDetails(r`a\G`)).toThrow();
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
      [ r`(?=\Ga)a`,
        r`(?=a\G)a`,
        r`(?=\G|)a`,
        r`(?!\Ga)a`,
        r`(?!a\G)a`,
        r`(?!\G|)a`,
        r`(?<=\Ga)a`,
        r`(?<=a\G)a`,
        r`(?<=\G|)a`,
        r`(?<!\Ga)a`,
        r`(?<!a\G)a`,
        r`(?<!\G|)a`,
      ].forEach(p => expect(() => toDetails(p)).withContext(p).toThrow());
    });

    it('should allow if following a 0-min quantified token', () => {
      expect('a').toExactlyMatch(r`a*\Ga`);
      expect('a').toExactlyMatch(r`(a)*\Ga`);
      expect('a').toExactlyMatch(r`[a]*\Ga`);
    });

    it('should throw if following a non-0-min quantified token', () => {
      expect(() => toDetails(r`a+\G`)).toThrow();
      expect(() => toDetails(r`a+?\G`)).toThrow();
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

    // Note: Could support by replacing `\G` with `(?!)`, but these forms aren't useful
    it('should throw at unmatchable positions', () => {
      expect(() => toDetails(r`a\Gb`)).toThrow();
      expect(() => toDetails(r`(?<=a\Gb)`)).toThrow();
      expect(() => toDetails(r`(?=a\Gb)`)).toThrow();
      expect(() => toDetails(r`(?=ab\G)`)).toThrow();
    });

    it('should allow unsupported forms if allowing all search start anchors', () => {
      const patterns = [
        r`a\G`,
        r`\Ga|b`,
        r`(\G|a)b`,
      ];
      patterns.forEach(pattern => {
        expect(() => toDetails(pattern)).toThrow();
        expect(() => toDetails(pattern, {rules: {ignoreUnsupportedGAnchors: true}})).not.toThrow();
      });
    });
  });

  describe('subclass strategies', () => {
    // Leading `(^|\G)` and similar
    it('should apply line_or_search_start', () => {
      // Matches with `^` since not global
      expect(toRegExp(r`(^|\G)a`).exec('b\na')?.index).toBe(2);
      // Match the first 3 and last 1
      expect('aaabaaacaa\na'.match(toRegExp(r`(^|\G)a`, {global: true}))).toEqual(['a', 'a', 'a', 'a']);
      expect(toRegExp(r`(?:^|\G)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(\G|^)a`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`(?:(\G|^)a)`).exec('b\na')?.index).toBe(2);
      expect(toRegExp(r`((\G|^)a)`).exec('b\na')?.index).toBe(2);

      // Updates match indices accurately
      const re = toRegExp(r`(?<n>^|\G)a`, {global: true, hasIndices: true});
      re.lastIndex = 2;
      expect(re.exec('12a').indices[0][0]).toBe(2);
      re.lastIndex = 2;
      expect(re.exec('12a').indices.groups.n[0]).toBe(2);
    });

    // Leading `(?!\G)` and similar
    it('should apply not_search_start', () => {
      // Leading
      expect(toRegExp(r`(?!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?<!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?:(?!\G)a)`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`((?!\G)a)`).exec('aba')?.index).toBe(2);
      // Preceding zero-length nodes
      expect(toRegExp(r`(?<=;)(?!\G)`).exec(';;')?.index).toBe(1);
      expect(toRegExp(r`(?!\G)(?=;)^`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?=;)(?!\G)^`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?=;)^(?!\G)`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`a*(?!\G)a`).exec('abcaaa')?.[0]).toBe('aaa');
      // Preceding non-zero-length nodes
      expect(() => toDetails(r`a+(?!\G)a`)).toThrow();
      expect(() => toDetails(r`a(?!\G)a`)).toThrow();
    });
  });
});
