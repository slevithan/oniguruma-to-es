import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Alternative', () => {
  it('should match any top-level alternative', () => {
    expect(['a', 'bb', 'c']).toExactlyMatch(r`a|bb|\w`);
  });

  it('should match any group-level alternative', () => {
    expect(['0a', '0bb', '0c']).toExactlyMatch(r`0(a|bb|\w)`);
  });
});
