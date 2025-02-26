import {toRegExp, toRegExpDetails} from '../dist/esm/index.js';
import {r} from '../src/utils.js';
import {maxTestTargetForFlagGroups} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion [search_start]', () => {
  it('should be identity escape within a char class', () => {
    expect('G').toExactlyMatch(r`[\G]`);
    expect('\\').not.toFindMatch(r`[\G]`);
  });

  describe('without subclass', () => {
    function opts(options) {
      return {
        avoidSubclass: true,
        ...options,
      };
    }
    function matcherOpts(pattern, options) {
      return {
        pattern,
        ...opts(options),
      };
    }

    it('should match at the start of the search', () => {
      expect('a').toExactlyMatch(matcherOpts(r`\Ga`));
      expect(['a', 'b', '123']).toExactlyMatch(matcherOpts(r`\Ga|\Gb|\G\d+`));
    });

    it('should match all positions when on its own and applied repeatedly', () => {
      expect('ab'.match(toRegExp(r`\G`, opts({global: true})))).toEqual(['', '', '']);
      expect('ab'.match(toRegExp(r`(\G)`, opts({global: true})))).toEqual(['', '', '']);
    });

    it('should not match at positions other than the start of the search', () => {
      expect('ba').not.toFindMatch(matcherOpts(r`\Ga`));
    });

    it('should match only at the start of the search when applied repeatedly', () => {
      expect('abbcbb'.match(toRegExp(r`\G[ab]`, opts({global: true})))).toEqual(['a', 'b', 'b']);
    });

    it('should throw if not used at the start of every top-level alternative', () => {
      expect(() => toRegExpDetails(r`\Ga|b`, opts())).toThrow();
      expect(() => toRegExpDetails(r`a|\Gb`, opts())).toThrow();
    });

    it('should allow if following a directive', () => {
      expect('a').toExactlyMatch(matcherOpts(r`\K\Ga`));
      expect(['a', 'A']).toExactlyMatch(matcherOpts(r`(?i)\Ga`, {
        maxTestTarget: maxTestTargetForFlagGroups,
      }));
      expect(['a', 'A']).toExactlyMatch(matcherOpts(r`(?i)(?m)\Ga`, {
        maxTestTarget: maxTestTargetForFlagGroups,
      }));
    });

    it('should allow if following an assertion', () => {
      expect('a').toExactlyMatch(matcherOpts(r`\A\Ga`));
      expect('a').toExactlyMatch(matcherOpts(r`\b\Ga`));
      expect('a').toExactlyMatch(matcherOpts(r`(?=a)\Ga`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<=\A)\Ga`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<!a)\Ga`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<!a)(?=a)\Ga`));
    });

    it('should allow if an only child of a positive lookaround', () => {
      expect('a').toExactlyMatch(matcherOpts(r`(?=\G)a`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<=\G)a`));
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
      ].forEach(p => expect(() => toRegExpDetails(p, opts())).withContext(p).toThrow());
    });

    it('should never match if preceded by a non-zero-length token', () => {
      expect(toRegExp(r`a\G`).sticky).toBe(false);
      expect('a').not.toFindMatch(matcherOpts(r`a\G`));
      expect('a').not.toFindMatch(matcherOpts(r`[a]\G`));
      expect('a').not.toFindMatch(matcherOpts(r`\p{Any}\G`));
      expect('ab').not.toFindMatch(matcherOpts(r`a\Gb`));
      expect('a').not.toFindMatch(matcherOpts(r`a+\G`));
      expect('a').not.toFindMatch(matcherOpts(r`a+?\G`));
      expect('a').not.toFindMatch(matcherOpts(r`(?=a\G)`));
      expect('a').not.toFindMatch(matcherOpts(r`(?=a\G)a`));
      expect('ab').not.toFindMatch(matcherOpts(r`(?=a\Gb)`));
      expect('a').not.toFindMatch(matcherOpts(r`(?<=a\G)`));
      expect('ab').not.toFindMatch(matcherOpts(r`(?<=a\G)b`));
      expect('ab').not.toFindMatch(matcherOpts(r`(?<=a\Gb)`));
      expect('a').toExactlyMatch(matcherOpts(r`(?!a\G)a`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<!a\G)a`));
      expect('ab').toFindMatch(matcherOpts(r`(?<!a\G)b`));
    });

    // Documenting current behavior
    it('should throw if following a quantified token', () => {
      // Min-zero length preceding `\G`
      expect(() => toRegExpDetails(r`a*\G`, opts())).toThrow();
      expect(() => toRegExpDetails(r`a*\Ga`, opts())).toThrow();
      expect(() => toRegExpDetails(r`(a)*\G`, opts())).toThrow();
      expect(() => toRegExpDetails(r`(a)*\Ga`, opts())).toThrow();
      expect(() => toRegExpDetails(r`[a]*\G`, opts())).toThrow();
      expect(() => toRegExpDetails(r`()+\G`, opts())).toThrow();
      expect(() => toRegExpDetails(r`(a|)+\G`, opts())).toThrow();
      // Non-min-zero length preceding `\G`
      // Note: Never-matching cases like `a+\G` are handled separately and don't throw
      expect(() => toRegExpDetails(r`aa*\G`, opts())).toThrow();
      expect(() => toRegExpDetails(r`(a)+\G`, opts())).toThrow();
    });

    it('should allow if within a wrapper group', () => {
      expect('a').toExactlyMatch(matcherOpts(r`(\Ga)`));
      expect('a').toExactlyMatch(matcherOpts(r`(((\Ga)))`));
      expect('a').toExactlyMatch(matcherOpts(r`(?:\Ga)`));
      expect('a').toExactlyMatch(matcherOpts(r`(?>\Ga)`));
      expect('a').toExactlyMatch(matcherOpts(r`(?<a>\Ga)`));
      expect('a').toExactlyMatch(matcherOpts(r`(?i:\Ga)`, {
        maxTestTarget: maxTestTargetForFlagGroups,
      }));
    });

    it('should check within groups to determine validity', () => {
      expect('a').toExactlyMatch(matcherOpts(r`((?=\G)a)`));
      expect('a').toExactlyMatch(matcherOpts(r`(?:(?>^(?<n>\Ga)))`));
      expect(() => toRegExpDetails(r`(?:(?>a(?<n>\Gb)))`, opts())).toThrow();
      expect('a').toExactlyMatch(matcherOpts(r`\Ga|(((\Gb)))`));
      expect(() => toRegExpDetails(r`\Ga|(((b\Gc)))`, opts())).toThrow();
      expect(['ac', 'bc']).toExactlyMatch(matcherOpts(r`((\Ga|\Gb)c)`));
      expect(() => toRegExpDetails(r`((\Ga|b)c)`, opts())).toThrow();
    });

    it('should allow as lone node in top-level alternative', () => {
      // Regex flavors that support \G make a subtle distinction about whether \G (after the first
      // match attempt at pos 0) matches at the end of the previous match (.NET, PCRE, Perl, Java,
      // Boost) or the start of the match attempt (Oniguruma, Onigmo). Relevant after zero-length
      // matches, where the read-head advance will make the "end of previous match" approach fail
      expect('ab'.match(toRegExp(r`\G|ab`, opts({global: true})))).toEqual(['', '', '']);
      expect('ab'.match(toRegExp(r`x|\G`, opts({global: true})))).toEqual(['', '', '']);
      expect('ab'.match(toRegExp(r`x|\G|y`, opts({global: true})))).toEqual(['', '', '']);
      expect('aba'.match(toRegExp(r`a|\G`, opts({global: true})))).toEqual(['a', '', 'a', '']);
    });

    // Documenting current behavior
    it('should throw for redundant but otherwise supportable assertions', () => {
      expect(() => toRegExpDetails(r`\G\Ga`, opts())).toThrow();
      expect(() => toRegExpDetails(r`\Ga|\G\Gb`, opts())).toThrow();
    });

    it('should throw if leading in a non-0-min quantified group', () => {
      expect(() => toRegExpDetails(r`(\Ga)+`, opts())).toThrow();
      expect(() => toRegExpDetails(r`(\Ga)+\G`, opts())).toThrow();
    });
  });

  describe('with subclass', () => {
    // Note: The following specs test some common uses, but all uses of `\G` should be supported.
    // Mismatches are possible when three edge cases are stacked on each other:
    // 1. An uncommon use of `\G` that requires subclass-based emulation.
    // 2. Combined with lookbehind that searches behind the search start (not match start) position.
    // 3. During a search when the regex's `lastIndex` isn't `0`.

    it(r`should support '\G…|…'`, () => {
      expect(['a', 'b']).toExactlyMatch(r`\Ga|b`);
      expect('xb').toFindMatch(r`\Ga|b`);
      expect('xa').not.toFindMatch(r`\Ga|b`);
    });

    it(r`should support '(^|\G)…' and similar at start of pattern`, () => {
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

    it(r`should support '(?!\G)…' and similar at start of pattern`, () => {
      // ## Leading
      expect(toRegExp(r`(?!\G)`).exec('a')?.index).toBe(1);
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
      // ## With preceding min-zero-length quantified node
      expect(toRegExp(r`a*(?!\G)a`).exec('abcaaa')?.[0]).toBe('aaa');
      expect('abcaaa'.match(toRegExp(r`a*(?!\G)`, {global: true}))).toEqual(['a', '', 'aaa']);
    });

    it(r`should support '(?!\G)|…'`, () => {
      expect(toRegExp(r`(?!\G)|a`).exec('')).toBe(null);
      [ {str: 'a', match: 'a', index: 0},
        {str: 'ba', match: '', index: 1},
        {str: 'bba', match: '', index: 1},
      ].forEach(o => {
        const result = toRegExp(r`(?!\G)|a`).exec(o.str);
        expect(result[0]).toBe(o.match);
        expect(result.index).toBe(o.index);
      });
      expect('bba'.match(toRegExp(r`(?!\G)|a`, {global: true}))).toEqual(['', 'a']);
      expect('bbba'.match(toRegExp(r`(?!\G)|a`, {global: true}))).toEqual(['', '']);
      expect('bbbba'.match(toRegExp(r`(?!\G)|a`, {global: true}))).toEqual(['', '', 'a']);

      // Check `groups` and `indices` are set correctly
      const result = ['', undefined, undefined];
      Object.assign(result, {
        index: 1,
        input: 'xxa',
        groups: {n: undefined},
        indices: [[1, 1], undefined, undefined],
      });
      result.indices.groups = {n: undefined};
      expect(
        toRegExp(r`(?!\G)|(b)|(?<n>a)`, {hasIndices: true, rules: {captureGroup: true}}).exec(result.input)
      ).toEqual(result);
    });

    it(r`should support '…|(?!\G)'`, () => {
      expect(toRegExp(r`a|(?!\G)`).exec('')).toBe(null);
      [ {str: 'a', match: 'a', index: 0},
        {str: 'ba', match: 'a', index: 1},
        {str: 'bba', match: '', index: 1},
      ].forEach(o => {
        const result = toRegExp(r`a|(?!\G)`).exec(o.str);
        expect(result[0]).toBe(o.match);
        expect(result.index).toBe(o.index);
      });
      expect('bba'.match(toRegExp(r`a|(?!\G)`, {global: true}))).toEqual(['', 'a']);
      expect('bbba'.match(toRegExp(r`a|(?!\G)`, {global: true}))).toEqual(['', 'a']);
      expect('bbbba'.match(toRegExp(r`a|(?!\G)`, {global: true}))).toEqual(['', '', 'a']);

      // Check `groups` and `indices` are set correctly
      const result = ['', undefined, undefined];
      Object.assign(result, {
        index: 1,
        input: 'xxa',
        groups: {n: undefined},
        indices: [[1, 1], undefined, undefined],
      });
      result.indices.groups = {n: undefined};
      expect(
        toRegExp(r`(b)|(?<n>a)|(?!\G)`, {hasIndices: true, rules: {captureGroup: true}}).exec(result.input)
      ).toEqual(result);
    });
  });
});
