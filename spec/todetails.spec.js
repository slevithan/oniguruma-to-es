import {toDetails} from '../dist/index.mjs';

describe('toDetails', () => {
  it('should return an object with pattern and flags properties', () => {
    expect(Object.keys(toDetails(''))).toEqual(['pattern', 'flags']);
  });

  it('should throw for non-string pattern', () => {
    expect(() => toDetails()).toThrow();
    for (const value of [undefined, null, 0, false, [], {}, /(?:)/]) {
      expect(() => toDetails(value)).toThrow();
    }
  });

  it('should return an empty pattern if given an empty string', () => {
    expect(toDetails('').pattern).toBe('');
  });

  it('should accept and translate supported flags', () => {
    expect(toDetails('', {flags: 'i'}).flags).toContain('i');
    expect(toDetails('', {flags: 'm'}).flags).toContain('s');
    expect(toDetails('', {flags: 'm'}).flags).not.toContain('m');
    expect(toDetails('', {flags: 'x'}).flags).not.toContain('x');
  });

  it('should throw for unexpected flags', () => {
    expect(() => toDetails('', {flags: 'd'})).toThrow();
    expect(() => toDetails('', {flags: 'g'})).toThrow();
    expect(() => toDetails('', {flags: 's'})).toThrow();
    expect(() => toDetails('', {flags: 'u'})).toThrow();
    expect(() => toDetails('', {flags: 'v'})).toThrow();
    expect(() => toDetails('', {flags: 'y'})).toThrow();
  });

  it('should add flag v if target unspecified', () => {
    expect(toDetails('').flags).toBe('v');
  });

  it('should add flag v for target ES2024+', () => {
    expect(toDetails('', {target: 'ES2024'}).flags).toBe('v');
    expect(toDetails('', {target: 'ES2025'}).flags).toBe('v');
  });

  it('should add flag u for target ES2018', () => {
    expect(toDetails('', {target: 'ES2018'}).flags).toBe('u');
  });

  it('should throw for unexpected targets', () => {
    expect(() => toDetails('', {target: 'ES6'})).toThrow();
    expect(() => toDetails('', {target: 'ES2019'})).toThrow();
  });
});
