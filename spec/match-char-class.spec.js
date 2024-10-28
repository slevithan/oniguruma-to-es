import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterClass', () => {
  describe('Character', () => {
    describe('escape', () => {
      it('should match supported letter escapes', () => {
        expect('\x07').toMatchWithAllTargets(r`[\a]`);
        expect('\x08').toMatchWithAllTargets(r`[\b]`);
        expect('\x1B').toMatchWithAllTargets(r`[\e]`);
        expect('\f').toMatchWithAllTargets(r`[\f]`);
        expect('\n').toMatchWithAllTargets(r`[\n]`);
        expect('\r').toMatchWithAllTargets(r`[\r]`);
        expect('\t').toMatchWithAllTargets(r`[\t]`);
        expect('\v').toMatchWithAllTargets(r`[\v]`);
      });
    });

    describe('escaped number', () => {
      it('should match null', () => {
        expect('\0').toMatchWithAllTargets(r`[\0]`);
        expect('\0').toMatchWithAllTargets(r`[\000]`);
        expect('0').not.toMatchWithAllTargets(r`[\000]`);
      });

      it('should match null followed by literal digits', () => {
        expect('0').toMatchWithAllTargets(r`[\0000]`);
        expect('1').toMatchWithAllTargets(r`[\0001]`);
      });

      it('should match octals', () => {
        expect('\u{1}').toMatchWithAllTargets(r`[\1]`);
        expect('\u{1}').toMatchWithAllTargets(r`[\01]`);
        expect('\u{1}').toMatchWithAllTargets(r`[\001]`);
        expect(String.fromCodePoint(0o17)).toMatchWithAllTargets(r`[\17]`);
        expect(String.fromCodePoint(0o777)).toMatchWithAllTargets(r`[\777]`);
      });

      it('should match octals followed by literal digits', () => {
        expect('0').toMatchWithAllTargets(r`[\1000]`);
        expect('8').toMatchWithAllTargets(r`[\18]`);
        expect('9').toMatchWithAllTargets(r`[\19]`);
        expect('0').toMatchWithAllTargets(r`[\190]`);
        expect('8').toMatchWithAllTargets(r`[\118]`);
        expect('9').toMatchWithAllTargets(r`[\119]`);
        expect('0').toMatchWithAllTargets(r`[\1190]`);
      });

      it('should match identity escapes', () => {
        expect('8').toMatchWithAllTargets(r`[\8]`);
        expect('9').toMatchWithAllTargets(r`[\9]`);
      });

      it('should match identity escapes followed by literal digits', () => {
        expect('0').toMatchWithAllTargets(r`[\80]`);
        expect('0').toMatchWithAllTargets(r`[\90]`);
      });
    });
    // TODO: Rest
  });
  // TODO: Rest
});
