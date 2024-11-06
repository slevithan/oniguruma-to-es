import {compile} from '../dist/index.mjs';

describe('compile', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(compile(''))).toEqual(['pattern', 'flags']);
  });

  it('should throw for non-string pattern', () => {
    expect(() => compile()).toThrow();
    for (const value of [undefined, null, 0, false, [], {}, /(?:)/]) {
      expect(() => compile(value)).toThrow();
    }
  });

  it('should return an empty pattern if given an empty string', () => {
    expect(compile('').pattern).toBe('');
  });

  it('should accept and translate supported flags', () => {
    expect(compile('', {flags: 'i'}).flags).toContain('i');
    expect(compile('', {flags: 'm'}).flags).toContain('s');
    expect(compile('', {flags: 'm'}).flags).not.toContain('m');
    expect(compile('', {flags: 'x'}).flags).not.toContain('x');
  });

  it('should throw for unexpected flags', () => {
    expect(() => compile('', {flags: 'd'})).toThrow();
    expect(() => compile('', {flags: 'g'})).toThrow();
    expect(() => compile('', {flags: 's'})).toThrow();
    expect(() => compile('', {flags: 'u'})).toThrow();
    expect(() => compile('', {flags: 'v'})).toThrow();
    expect(() => compile('', {flags: 'y'})).toThrow();
  });

  it('should add flag v if target unspecified', () => {
    expect(compile('').flags).toBe('v');
  });

  it('should add flag v for target ES2024+', () => {
    expect(compile('', {target: 'ES2024'}).flags).toBe('v');
    expect(compile('', {target: 'ESNext'}).flags).toBe('v');
  });

  it('should add flag u for target ES2018', () => {
    expect(compile('', {target: 'ES2018'}).flags).toBe('u');
  });

  it('should throw for unexpected targets', () => {
    expect(() => compile('', {target: 'ES6'})).toThrow();
    expect(() => compile('', {target: 'ES2019'})).toThrow();
  });
});
