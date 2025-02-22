import {cp} from './utils.js';

const CharsWithoutIgnoreCaseExpansion = new Set([
  cp(0x130), // İ
  cp(0x131), // ı
]);

function getIgnoreCaseMatchChars(char) {
  // Some chars should not match the chars they case swap to
  if (CharsWithoutIgnoreCaseExpansion.has(char)) {
    return [char];
  }
  const set = new Set();
  const lower = char.toLowerCase();
  // Everything else is based on `lower`
  const upper = lower.toUpperCase();
  const title = LowerToTitleCaseMap.get(lower);
  const altLower = LowerToAlternativeLowerCaseMap.get(lower);
  const altUpper = LowerToAlternativeUpperCaseMap.get(lower);
  // Exclude ucase if multiple chars; count code point length. Excludes ucase versions of German
  // es-zed 'ß', ligatures like 'ﬀ', and chars with no precomposed ucase like 'ŉ'. See
  // <unicode.org/Public/UNIDATA/SpecialCasing.txt>
  if ([...upper].length === 1) {
    set.add(upper);
  }
  altUpper && set.add(altUpper);
  title && set.add(title);
  // Lcase of 'İ' is multiple chars, but it's excluded by `CharsWithoutIgnoreCaseExpansion`
  set.add(lower);
  altLower && set.add(altLower);
  return [...set];
}

const LowerToAlternativeLowerCaseMap = new Map([
  ['s', cp(0x17F)], // s, ſ
  [cp(0x17F), 's'], // ſ, s
]);

const LowerToAlternativeUpperCaseMap = new Map([
  [cp(0xDF), cp(0x1E9E)], // ß, ẞ
  [cp(0x6B), cp(0x212A)], // k, K (Kelvin)
  [cp(0xE5), cp(0x212B)], // å, Å (Angstrom)
  [cp(0x3C9), cp(0x2126)], // ω, Ω (Ohm)
]);

// See <github.com/node-unicode/unicode-16.0.0/tree/main/General_Category/Titlecase_Letter>
const LowerToTitleCaseMap = new Map([
  titleEntry(0x1C5),
  titleEntry(0x1C8),
  titleEntry(0x1CB),
  titleEntry(0x1F2),
  ...titleRange(0x1F88, 0x1F8F),
  ...titleRange(0x1F98, 0x1F9F),
  ...titleRange(0x1FA8, 0x1FAF),
  titleEntry(0x1FBC),
  titleEntry(0x1FCC),
  titleEntry(0x1FFC),
]);

function range(start, end) {
  // const range = Array.from(Array(end + 1 - start), (_, i) => i + start);
  // const range = Array(end + 1 - start).fill(start).map((x, i) => x + i);
  const range = [];
  for (let i = start; i <= end; i++) {
    range.push(i);
  }
  return range;
}

function titleEntry(codePoint) {
  const char = cp(codePoint);
  return [char.toLowerCase(), char];
}

function titleRange(start, end) {
  return range(start, end).map(codePoint => titleEntry(codePoint));
}

const UnicodePropertiesWithSpecificCase = new Set([
  'Lower', 'Lowercase',
  'Upper', 'Uppercase',
  'Ll', 'Lowercase_Letter',
  'Lt', 'Titlecase_Letter',
  'Lu', 'Uppercase_Letter',
  // The `Changes_When_*` properties (and their aliases) could be included, but they're very rare.
  // Some other properties include a handful of chars with specific cases only, but these chars are
  // generally extreme edge cases and using such properties case insensitively generally produces
  // undesired behavior anyway
]);

export {
  getIgnoreCaseMatchChars,
  UnicodePropertiesWithSpecificCase,
};
