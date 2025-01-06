import {toDetails} from '../dist/index.mjs';
import {cp, r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClass', () => {
  // TODO: Move and mix into `match-char.spec.js`?
  describe('Character', () => {
    describe('escape', () => {
      it('should match supported letter escapes', () => {
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

    describe('escaped number', () => {
      it('should match null', () => {
        expect('\0').toExactlyMatch(r`[\0]`);
        expect('\0').toExactlyMatch(r`[\000]`);
        expect('0').not.toFindMatch(r`[\000]`);
      });

      it('should match null followed by literal digits', () => {
        expect('0').toExactlyMatch(r`[\0000]`);
        expect('1').toExactlyMatch(r`[\0001]`);
      });

      it('should match octals', () => {
        expect('\u{1}').toExactlyMatch(r`[\1]`);
        expect('\u{1}').toExactlyMatch(r`[\01]`);
        expect('\u{1}').toExactlyMatch(r`[\001]`);
        expect(cp(0o17)).toExactlyMatch(r`[\17]`);
        expect(cp(0o177)).toExactlyMatch(r`[\177]`);
      });

      it(r`should throw for octal UTF-8 encoded byte above \177`, () => {
        expect(() => toDetails(r`[\200]`)).toThrow();
        expect(() => toDetails(r`[\777]`)).toThrow();
      });

      it('should match octals followed by literal digits', () => {
        expect('0').toExactlyMatch(r`[\1000]`);
        expect('8').toExactlyMatch(r`[\18]`);
        expect('9').toExactlyMatch(r`[\19]`);
        expect('0').toExactlyMatch(r`[\190]`);
        expect('8').toExactlyMatch(r`[\118]`);
        expect('9').toExactlyMatch(r`[\119]`);
        expect('0').toExactlyMatch(r`[\1190]`);
      });

      it('should match identity escapes', () => {
        expect('8').toExactlyMatch(r`[\8]`);
        expect('9').toExactlyMatch(r`[\9]`);
      });

      it('should match identity escapes followed by literal digits', () => {
        expect('0').toExactlyMatch(r`[\80]`);
        expect('0').toExactlyMatch(r`[\90]`);
      });
    });

    // TODO: Add remaining
  });

  describe('nested class unwrapping', () => {
    it('should unwrap unneeded nested classes', () => {
      expect(toDetails('[[ab]]').pattern).toBe('[ab]');
      expect(toDetails('[[[ab]]]').pattern).toBe('[ab]');
      expect(toDetails('[[ab]cd]').pattern).toBe('[abcd]');
      expect(toDetails('[[[ab]]cd]').pattern).toBe('[abcd]');
      expect(toDetails('[[ab][cd]]').pattern).toBe('[abcd]');
      expect(toDetails('[[a]bc[d]]').pattern).toBe('[abcd]');
      expect(toDetails('[^[ab]]').pattern).toBe('[^ab]');
      expect(toDetails('[[^ab]]').pattern).toBe('[^ab]');
      expect(toDetails('[^[^ab]]').pattern).toBe('[ab]');
      expect(toDetails('[^[^[ab]]]').pattern).toBe('[ab]');
      expect(toDetails('[^[^[^ab]]]').pattern).toBe('[^ab]');
    });

    it('should not unwrap required nested classes', () => {
      expect(toDetails('[[^ab]cd]').pattern).toBe('[[^ab]cd]');
      expect(toDetails('[^[^ab]cd]').pattern).toBe('[^[^ab]cd]');
      expect(toDetails('[[^a][^b]]').pattern).toBe('[[^a][^b]]');
      expect(toDetails('[^[^a][^b]]').pattern).toBe('[^[^a][^b]]');
    });
  });

  // TODO: Add remaining
  // TODO: Test that nested negated classes throw for target ES2018
  // TODO: Test assertions/var-length escapes are identity escapes
});
