import {EmulatedRegExp, toRegExp} from '../dist/esm/index.js';
import {envSupportsFlagV, r} from '../src/utils.js';

describe('EmulatedRegExp', () => {
  it('should include property rawArgs on instances', () => {
    expect(new EmulatedRegExp('').rawArgs).toEqual({
      pattern: '',
      flags: '',
      options: {},
    });
  });

  it('should preserve rawArgs when copying an instance', () => {
    const re = toRegExp('a++');
    const reCopy = new EmulatedRegExp(re);
    const genFlags = envSupportsFlagV ? 'v' : 'u';
    expect(reCopy.rawArgs).toEqual({
      pattern: r`(?:(?=(a+))\1)`,
      flags: genFlags,
      options: {hiddenCaptureNums: [1]},
    });
    expect(reCopy.source).toBe(r`(?:(?=(a+))\1)`);
  });

  it('should throw if providing options while copying a regexp', () => {
    expect(() => new EmulatedRegExp(/./, '', {})).toThrow();
    expect(() => new EmulatedRegExp(/./, '')).not.toThrow();
  });

  it('should update rawArgs.flags when flags are provided while copying a regexp', () => {
    expect(new EmulatedRegExp(/./g).rawArgs.flags).toBe('g');
    expect(new EmulatedRegExp(/./g, '').rawArgs.flags).toBe('');
    expect(new EmulatedRegExp(/./g, 'd').rawArgs.flags).toBe('d');
  });
});
