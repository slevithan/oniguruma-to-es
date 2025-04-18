import {toRegExpDetails} from '../dist/esm/index.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('NamedCallout', () => {
  describe('FAIL', () => {
    it('should never match', () => {
      expect('').not.toFindMatch('(*FAIL)');
      expect('a').not.toFindMatch('a(*FAIL)');
      expect('a').not.toFindMatch('a(*FAIL)|b');
      expect('b').toExactlyMatch('a(*FAIL)|b');
    });

    it('should allow a tag and empty arguments', () => {
      const cases = [
        '(*FAIL[tag])',
        '(*FAIL{})',
        '(*FAIL{,,})',
        '(*FAIL[tag]{})',
      ];
      for (const input of cases) {
        expect('').not.toFindMatch(input);
      }
    });

    it('should throw if quantified', () => {
      expect(() => toRegExpDetails('(*FAIL)*')).toThrow();
    });

    it('should throw for invalid syntax', () => {
      const cases = [
        '(*fail)',
        '(*FAIL[])',
        '(*FAIL{a})',
        '(* FAIL)',
        '(*FAIL )',
      ];
      for (const input of cases) {
        expect(() => toRegExpDetails(input)).toThrow();
      }
    });
  });

  it('should throw for other named callouts', () => {
    const cases = [
      '(*MISMATCH)',
      '(*SKIP)',
      '(*ERROR)',
      '(*MAX{1})',
      '(*COUNT)',
      '(*TOTAL_COUNT)',
      '(*CMP{5,>=,4})',
    ];
    for (const input of cases) {
      expect(() => toRegExpDetails(input)).toThrow();
    }
  });
});
