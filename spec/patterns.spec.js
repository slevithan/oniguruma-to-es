import {compile} from '../src/index.js';
import {r} from '../src/utils.js';

describe('compile', () => {
  it('should compile a list of patterns', () => {
    expect(compile('.')).toEqual({pattern: r`[^\n]`, flags: 'v'});
  });
});
