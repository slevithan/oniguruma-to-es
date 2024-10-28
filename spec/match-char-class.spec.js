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
    // TODO: Rest
  });
  // TODO: Rest
});
