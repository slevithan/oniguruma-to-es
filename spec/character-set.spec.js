import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterSet', () => {
  describe('any', () => {
    it('should match any character except line feed', () => {
      expect('a').toMatchTranspiled('.');
      expect('\0').toMatchTranspiled('.');
      expect('\r').toMatchTranspiled('.');
    });

    it('should not match line feed with flag m disabled', () => {
      expect('\n').not.toMatchTranspiled('.');
    });

    it('should match line feed with flag m enabled', () => {
      expect('\n').toMatchTranspiled({pattern: '.', flags: 'm'});
    });
  });
});
