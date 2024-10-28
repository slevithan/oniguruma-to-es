import {compile} from '../dist/index.mjs';

describe('compile', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(compile('')).toEqual({pattern: '', flags: 'v'});
    expect(compile('a')).toEqual({pattern: 'a', flags: 'v'});
  });

  it('should accept supported targets', () => {
    expect(compile('', '', {target: 'ES2018'})).toEqual({pattern: '', flags: 'u'});
    expect(compile('', '', {target: 'ES2024'})).toEqual({pattern: '', flags: 'v'});
    expect(compile('', '', {target: 'ESNext'})).toEqual({pattern: '', flags: 'v'});
  });

  it('should not accept unsupported targets', () => {
    expect(() => compile('', '', {target: 'ES5'})).toThrow();
    expect(() => compile('', '', {target: 'ES2019'})).toThrow();
  });
});
