import {EmulatedRegExp, toRegExp} from '../dist/index.mjs';
import {envSupportsFlagV, r} from '../src/utils.js';
import {emulationGroupMarker} from 'regex/internals';

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
      // Emulation group marker included in `rawArgs.pattern`
      pattern: r`(?:(?=(${emulationGroupMarker}a+))\1)`,
      flags: genFlags,
      options: {useEmulationGroups: true},
    });
    // Emulation group marker stripped from `source`
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
