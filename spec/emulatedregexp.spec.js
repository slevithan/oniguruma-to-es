import {EmulatedRegExp, toRegExp} from '../dist/esm/index.js';

describe('EmulatedRegExp', () => {
  it('should create a new instance when copying a regexp', () => {
    const re1 = /./;
    const re2 = new EmulatedRegExp('.');
    expect(new EmulatedRegExp(re1)).not.toBe(re1);
    expect(new EmulatedRegExp(re2)).not.toBe(re2);
  });

  it('should allow changing flags when copying a regexp', () => {
    const re = toRegExp('.', {global: true});
    const reCopy = new EmulatedRegExp(re, 'i');
    expect(re.global).toBe(true);
    expect(re.ignoreCase).toBe(false);
    expect(reCopy.global).toBe(false);
    expect(reCopy.ignoreCase).toBe(true);
  });

  it('should throw if providing options when copying a regexp', () => {
    expect(() => new EmulatedRegExp(/./, '', {})).toThrow();
  });

  it('should include property rawOptions on instances', () => {
    expect(new EmulatedRegExp('').rawOptions).toEqual({});
  });

  it('should preserve rawOptions when copying a regexp', () => {
    const re = toRegExp('a++');
    const reCopy = new EmulatedRegExp(re);
    expect(reCopy.rawOptions).toEqual({hiddenCaptures: [1]});
    expect(reCopy.rawOptions).toEqual(re.rawOptions);
  });
});
