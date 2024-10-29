import {compile} from '../dist/index.mjs';

describe('compile', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(compile('a'))).toEqual(['pattern', 'flags']);
  });

  it('should return an empty pattern string if given an empty string', () => {
    expect(compile('').pattern).toBe('');
  });

  it('should accept supported flags', () => {
    const compiled = compile('', 'imx');
    expect(compiled.flags).toContain('i');
    expect(compiled.flags).toContain('s');
    expect(compiled.flags).toContain('v');
    // TODO: More specs
  });

  it('should accept supported targets', () => {
    expect(compile('', '', {target: 'ES2018'})).toEqual({pattern: '', flags: 'u'});
    expect(compile('', '', {target: 'ES2024'})).toEqual({pattern: '', flags: 'v'});
    expect(compile('', '', {target: 'ESNext'})).toEqual({pattern: '', flags: 'v'});
  });

  it('should throw for unsupported targets', () => {
    expect(() => compile('', '', {target: 'ES6'})).toThrow();
    expect(() => compile('', '', {target: 'ES2019'})).toThrow();
  });
});
