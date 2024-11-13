import {toDetails, toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {maxTestTargetForPatternMods} from './helpers/features.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Assertion: Search start', () => {
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

    // Unsupported; not emulatable without a subclass
    it('should throw if not used at the start of every top-level alternative', () => {
      expect(() => toDetails(r`a\G`)).toThrow();
      expect(() => toDetails(r`\Ga|b`)).toThrow();
      expect(() => toDetails(r`a|\Gb`)).toThrow();
    });

    it('should allow if following a directive', () => {
      expect('a').toExactlyMatch(r`\K\Ga`);
      expect('a').toExactlyMatch({
        pattern: r`(?i)\Ga`,
        maxTestTarget: maxTestTargetForPatternMods,
      });
      expect('a').toExactlyMatch({
        pattern: r`(?i)(?m)\Ga`,
        maxTestTarget: maxTestTargetForPatternMods,
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

    it('should check within groups to determine validity', () => {
      expect('a').toExactlyMatch(r`(\Ga)`);
      expect('a').toExactlyMatch(r`(?:(?>^(?<n>\Ga)))`);
      expect(() => toDetails(r`(?:(?>a(?<n>\Gb)))`)).toThrow();
      expect('a').toExactlyMatch(r`\Ga|(((\Gb)))`);
      expect(() => toDetails(r`\Ga|(((b\Gc)))`)).toThrow();
      expect(['ac', 'bc']).toExactlyMatch(r`((\Ga|\Gb)c)`);
      expect(() => toDetails(r`((\Ga|b)c)`)).toThrow();
    });

    it('should throw if leading in a non-0-min quantified group', () => {
      expect(() => toDetails(r`(\Ga)+`)).toThrow();
      expect(() => toDetails(r`(\Ga)+\G`)).toThrow();
    });

    // Documenting current behavior
    it('should throw for redundant but otherwise supportable assertions', () => {
      expect(() => toDetails(r`\G\Ga`)).toThrow();
      expect(() => toDetails(r`\Ga|\G\Gb`)).toThrow();
    });

    // Note: Could support by replacing `\G` with `(?!)`, but these forms aren't useful
    it('should throw at unmatchable positions', () => {
      expect(() => toDetails(r`a\Gb`)).toThrow();
      expect(() => toDetails(r`(?<=a\Gb)`)).toThrow();
      expect(() => toDetails(r`(?=a\Gb)`)).toThrow();
      expect(() => toDetails(r`(?=ab\G)`)).toThrow();
    });

    it('should allow unsupported forms if using loose accuracy', () => {
      const patterns = [
        r`a\G`,
        r`\G|`,
      ];
      patterns.forEach(pattern => {
        expect(() => toDetails(pattern)).toThrow();
        expect(toRegExp(pattern, {accuracy: 'loose'}).sticky).toBe(true);
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
    });

    // Leading `(?!\G)` and similar
    it('should apply not_search_start', () => {
      // Leading
      expect(toRegExp(r`(?!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?<!\G)a`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`(?:(?!\G)a)`).exec('aba')?.index).toBe(2);
      expect(toRegExp(r`((?!\G)a)`).exec('aba')?.index).toBe(2);
      // Only assertions
      expect(toRegExp(r`(?<=;)(?!\G)`).exec(';;')?.index).toBe(1);
      expect(toRegExp(r`(?!\G)(?=;)^`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?=;)(?!\G)^`).exec(';;\n;')?.index).toBe(3);
      expect(toRegExp(r`(?=;)^(?!\G)`).exec(';;\n;')?.index).toBe(3);
    });

    // Leading `(?<=\G|…)` and similar
    it('should apply after_search_start_or_subpattern', () => {
      expect(toRegExp(r`(?<=\G|a)b`).exec('ba')?.index).toBe(0);
      expect(toRegExp(r`(?<=\G|a)b`).exec('aba')?.index).toBe(1);
      expect(toRegExp(r`(?<=\G|a)b`).exec('aaba')?.index).toBe(2);
      expect(toRegExp(r`(?<=\G|a)b`).exec('cbbab')?.index).toBe(4);
      expect(toRegExp(r`((?<=xy?|\G|a)b)`).exec('cbbab')?.index).toBe(4);
      expect(toRegExp(r`(?<=\G|a)b`).exec('cbba')).toBeNull();
    });
  });
});
