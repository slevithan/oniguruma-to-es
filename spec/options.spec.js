import {toDetails} from '../dist/esm/index.js';
import {envSupportsFlagV, r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Options', () => {
  describe('accuracy', () => {
    it(r`should throw for subclass-based \G emulation if lookbehind present`, () => {
      expect(() => toDetails(r`\Ga|(?<=)`, {accuracy: 'strict'})).toThrow();
      expect(() => toDetails(r`\Ga|(?<=)`)).not.toThrow();
    });

    // TODO: Add remaining
  });

  // TODO: Add me
  // describe('avoidSubclass', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('flags', () => {
    it('should accept and translate supported flags', () => {
      expect(toDetails('', {flags: 'i'}).flags).toContain('i');
      expect(toDetails('', {flags: 'm'}).flags).toContain('s');
      expect(toDetails('', {flags: 'm'}).flags).not.toContain('m');
      expect(toDetails('', {flags: 'x'}).flags).not.toContain('x');
      expect(toDetails('', {flags: 'D'}).flags).not.toContain('D');
      expect(toDetails('', {flags: 'S'}).flags).not.toContain('S');
      expect(toDetails('', {flags: 'W'}).flags).not.toContain('W');
    });
  
    it('should throw for unexpected flags', () => {
      expect(() => toDetails('', {flags: 'd'})).toThrow();
      expect(() => toDetails('', {flags: 'g'})).toThrow();
      expect(() => toDetails('', {flags: 's'})).toThrow();
      expect(() => toDetails('', {flags: 'u'})).toThrow();
      expect(() => toDetails('', {flags: 'v'})).toThrow();
      expect(() => toDetails('', {flags: 'y'})).toThrow();
    });
  });

  // TODO: Add me
  // describe('global', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  // TODO: Add me
  // describe('hasIndices', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });

  describe('rules', () => {
    // TODO: Add me
    // describe('allowOrphanBackrefs', () => {
    //   it('should', () => {
    //     expect('').toExactlyMatch(r``);
    //   });
    // });

    // TODO: Add me
    // describe('asciiWordBoundaries', () => {
    //   it('should', () => {
    //     expect('').toExactlyMatch(r``);
    //   });
    // });

    describe('captureGroup', () => {
      it('should enable mixed unnamed and named capture', () => {
        expect('aba').toExactlyMatch({
          pattern: r`(a)(?<n>b)\1`,
          rules: {captureGroup: true},
        });
        expect('abb').toExactlyMatch({
          pattern: r`(a)(?<n>b)\2`,
          rules: {captureGroup: true},
        });
        // Without `rules.captureGroup`
        expect(() => toDetails(r`(a)(?<n>b)\1`)).toThrow();
      });

      it('should not multiplex for numbered backrefs to named capture', () => {
        expect('abb').toExactlyMatch({
          pattern: r`(?<n>a)(?<n>b)\2`,
          rules: {captureGroup: true},
        });
        expect('aba').not.toFindMatch({
          pattern: r`(?<n>a)(?<n>b)\2`,
          rules: {captureGroup: true},
        });
      });

      it('should preserve multiplexing for named backrefs', () => {
        expect(['abcb', 'abcc']).toExactlyMatch({
          pattern: r`(a)(?<n>b)(?<n>c)\k<n>`,
          rules: {captureGroup: true},
        });
        expect('abca').not.toFindMatch({
          pattern: r`(a)(?<n>b)(?<n>c)\k<n>`,
          rules: {captureGroup: true},
        });
      });

      it('backrefs rematch the most recent of a set with subroutines and unnamed capture', () => {
        expect('abcc').toExactlyMatch({
          pattern: r`(.)(?<n>b)\g<1>\1`,
          rules: {captureGroup: true},
        });
        expect('abca').not.toFindMatch({
          pattern: r`(.)(?<n>b)\g<1>\1`,
          rules: {captureGroup: true},
        });
      });

      it('backrefs rematch the most recent of a set with subroutines and named capture', () => {
        expect('abcc').toExactlyMatch({
          pattern: r`(a)(?<n>.)\g<2>\2`,
          rules: {captureGroup: true},
        });
        expect('abcb').not.toFindMatch({
          pattern: r`(a)(?<n>.)\g<2>\2`,
          rules: {captureGroup: true},
        });
        expect('abcb').not.toFindMatch({
          pattern: r`(a)(?<n>.)\g<2>\k<n>`,
          rules: {captureGroup: true},
        });
      });

      it('should allow numbered subroutine refs to duplicate group names', () => {
        expect(['abca', 'abcc']).toExactlyMatch({
          pattern: r`(?<n>.)(?<n>.)\g<2>\k<n>`,
          rules: {captureGroup: true},
        });
        expect('abcb').not.toFindMatch({
          pattern: r`(?<n>.)(?<n>.)\g<2>\k<n>`,
          rules: {captureGroup: true},
        });
        expect(['abcdc', 'abcdd']).toExactlyMatch({
          pattern: r`(a)(?<n>.)(?<n>.)\g<2>\k<n>`,
          rules: {captureGroup: true},
        });
        expect('abcdb').not.toFindMatch({
          pattern: r`(a)(?<n>.)(?<n>.)\g<2>\k<n>`,
          rules: {captureGroup: true},
        });
      });
    });

    describe('recursionLimit', () => {
      it('should throw if recursionLimit is not an integer 2-20', () => {
        for (const value of [-2, 0, 1, 2.5, 21, Infinity, '2', '', null, undefined, NaN, false]) {
          expect(() => toDetails('', {rules: {recursionLimit: value}})).toThrow();
        }
      });

      it('should allow recursionLimit 2-20', () => {
        for (let i = 2; i <= 20; i++) {
          expect('a'.repeat(i)).toExactlyMatch({
            pattern: r`a\g<0>?`,
            rules: {recursionLimit: i},
          });
        }
      });
    });

    describe('singleline', () => {
      it(r`should handle ^ as \A`, () => {
        expect('a').toExactlyMatch({
          pattern: r`^a`,
          rules: {singleline: true},
        });
        expect('\na').not.toFindMatch({
          pattern: r`^a`,
          rules: {singleline: true},
        });
      });

      it(r`should handle $ as \Z`, () => {
        expect('a').toExactlyMatch({
          pattern: r`a$`,
          rules: {singleline: true},
        });
        expect('a\n').toFindMatch({
          pattern: r`a$`,
          rules: {singleline: true},
        });
        expect('a\nb').not.toFindMatch({
          pattern: r`a$`,
          rules: {singleline: true},
        });
      });
    });
  });

  describe('target', () => {
    it('should set target based on env for target auto', () => {
      if (envSupportsFlagV) {
        expect(toDetails('', {target: 'auto'}).flags).toBe('v');
      } else {
        expect(toDetails('', {target: 'auto'}).flags).toBe('u');
      }
    });

    it('should use target auto if unspecified', () => {
      if (envSupportsFlagV) {
        expect(toDetails('').flags).toBe('v');
      } else {
        expect(toDetails('').flags).toBe('u');
      }
    });

    it('should add flag v for target ES2024+', () => {
      expect(toDetails('', {target: 'ES2024'}).flags).toBe('v');
      expect(toDetails('', {target: 'ES2025'}).flags).toBe('v');
    });

    it('should add flag u for target ES2018', () => {
      expect(toDetails('', {target: 'ES2018'}).flags).toBe('u');
    });

    it('should throw for unexpected targets', () => {
      expect(() => toDetails('', {target: 'ES6'})).toThrow();
      expect(() => toDetails('', {target: 'ES2019'})).toThrow();
    });
  });

  // TODO: Add me
  // describe('verbose', () => {
  //   it('should', () => {
  //     expect('').toExactlyMatch(r``);
  //   });
  // });
});
