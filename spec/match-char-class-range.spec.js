import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

// TODO: Add me

describe('CharacterClassRange', () => {
  it('should', () => {
    expect('').toExactlyMatch(r``);
  });
});
