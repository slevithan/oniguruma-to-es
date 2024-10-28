import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('CharacterSet', () => {
  describe('any', () => {
    it('should match any character except line feed', () => {
      expect('a').toMatchWithAllTargets('.');
      expect('\0').toMatchWithAllTargets('.');
      expect('\r').toMatchWithAllTargets('.');
      expect('\u{10000}').toMatchWithAllTargets('^.$');
      expect('\n').not.toMatchWithAllTargets('.');
    });

    it('should match line feed with flag m enabled', () => {
      expect('\n').toMatchWithAllTargets({pattern: '.', flags: 'm'});
    });
  });
  // TODO: Rest
});
