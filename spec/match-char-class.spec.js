import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClass', () => {
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
        expect(String.fromCodePoint(0o17)).toExactlyMatch(r`[\17]`);
        expect(String.fromCodePoint(0o777)).toExactlyMatch(r`[\777]`);
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

    // TODO: Rest
  });

  // TODO: Rest
});
