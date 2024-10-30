import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

// TODO: Add me

describe('Quantifier', () => {
  describe('greedy', () => {
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });

  describe('lazy', () => {
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });

  describe('possessive', () => {
    it('should', () => {
      expect('').toExactlyMatch(r``);
    });
  });
});
