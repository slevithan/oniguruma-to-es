import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

// TODO: Add me
// TODO: Test that it throws for target ES2018

describe('CharacterClassIntersection', () => {
  it('should', () => {
    expect('').toExactlyMatch(r``);
  });
});
