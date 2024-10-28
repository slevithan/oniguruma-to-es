import {r} from '../src/utils.js';
import {matchers} from './helpers/matchers.js';

beforeEach(() => {
  jasmine.addMatchers(matchers);
});

describe('Alternative', () => {
  it('should match any top-level alternative', () => {
    expect('a').toMatchWithAllTargets(r`a|bb|\w`);
    expect('bb').toMatchWithAllTargets(r`a|bb|\w`);
    expect('c').toMatchWithAllTargets(r`a|bb|\w`);
  });

  it('should match any group-level alternative', () => {
    expect('0a').toMatchWithAllTargets(r`0(a|bb|\w)`);
    expect('0bb').toMatchWithAllTargets(r`0(a|bb|\w)`);
    expect('0c').toMatchWithAllTargets(r`0(a|bb|\w)`);
  });
});
