import {cp, r} from './utils.js';
import {slug} from 'oniguruma-parser';

// `\t\n\v\f\r\x20`
const asciiSpaceChar = '[\t-\r ]';
// Different than `PosixClassMap`'s `word`
const defaultWordChar = r`[\p{L}\p{M}\p{N}\p{Pc}]`;

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

// The following set includes:
// - All ES2024 general categories and their aliases (all are supported by Oniguruma). See
//   <github.com/mathiasbynens/unicode-match-property-value-ecmascript/blob/main/data/mappings.js>
// - All ES2024 binary properties and their aliases (all are supported by Oniguruma). See
//   <tc39.es/ecma262/multipage/text-processing.html#table-binary-unicode-properties>
// Unicode properties must be mapped to property names supported by JS, and must also apply JS's
// stricter rules for casing, whitespace, hyphens, and underscores in Unicode property names. In
// order to remain lightweight, this library assumes properties not in this list are Unicode script
// names (which require a `Script=` or `sc=` prefix in JS). Unlike JS, Oniguruma doesn't support
// script extensions, and it supports some properties that aren't supported in JS (including blocks
// with an `In_` prefix). See also:
// - Properties supported in Oniguruma: <github.com/kkos/oniguruma/blob/master/doc/UNICODE_PROPERTIES>
// - Properties supported in JS by spec version: <github.com/eslint-community/regexpp/blob/main/src/unicode/properties.ts>
const JsUnicodePropertyMap = new Map(
`C Other
Cc Control cntrl
Cf Format
Cn Unassigned
Co Private_Use
Cs Surrogate
L Letter
LC Cased_Letter
Ll Lowercase_Letter
Lm Modifier_Letter
Lo Other_Letter
Lt Titlecase_Letter
Lu Uppercase_Letter
M Mark Combining_Mark
Mc Spacing_Mark
Me Enclosing_Mark
Mn Nonspacing_Mark
N Number
Nd Decimal_Number digit
Nl Letter_Number
No Other_Number
P Punctuation punct
Pc Connector_Punctuation
Pd Dash_Punctuation
Pe Close_Punctuation
Pf Final_Punctuation
Pi Initial_Punctuation
Po Other_Punctuation
Ps Open_Punctuation
S Symbol
Sc Currency_Symbol
Sk Modifier_Symbol
Sm Math_Symbol
So Other_Symbol
Z Separator
Zl Line_Separator
Zp Paragraph_Separator
Zs Space_Separator
ASCII
ASCII_Hex_Digit AHex
Alphabetic Alpha
Any
Assigned
Bidi_Control Bidi_C
Bidi_Mirrored Bidi_M
Case_Ignorable CI
Cased
Changes_When_Casefolded CWCF
Changes_When_Casemapped CWCM
Changes_When_Lowercased CWL
Changes_When_NFKC_Casefolded CWKCF
Changes_When_Titlecased CWT
Changes_When_Uppercased CWU
Dash
Default_Ignorable_Code_Point DI
Deprecated Dep
Diacritic Dia
Emoji
Emoji_Component EComp
Emoji_Modifier EMod
Emoji_Modifier_Base EBase
Emoji_Presentation EPres
Extended_Pictographic ExtPict
Extender Ext
Grapheme_Base Gr_Base
Grapheme_Extend Gr_Ext
Hex_Digit Hex
IDS_Binary_Operator IDSB
IDS_Trinary_Operator IDST
ID_Continue IDC
ID_Start IDS
Ideographic Ideo
Join_Control Join_C
Logical_Order_Exception LOE
Lowercase Lower
Math
Noncharacter_Code_Point NChar
Pattern_Syntax Pat_Syn
Pattern_White_Space Pat_WS
Quotation_Mark QMark
Radical
Regional_Indicator RI
Sentence_Terminal STerm
Soft_Dotted SD
Terminal_Punctuation Term
Unified_Ideograph UIdeo
Uppercase Upper
Variation_Selector VS
White_Space space
XID_Continue XIDC
XID_Start XIDS`.
  split(/\s/).
  map(p => [slug(p), p])
);

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

// Unlike Onig's Unicode properties via `\p` and `\P`, these names are case sensitive and don't
// allow inserting whitespace and underscores. Definitions at
// <github.com/kkos/oniguruma/blob/master/doc/RE> (see: POSIX bracket: Unicode Case)
// Note: Handling in the transformer assumes all values here are a single, negateable node that's
// not pre-negated at the top level. It also uses ASCII versions of `graph` and `print` for target
// `ES2018` (which doesn't allow intersection) if `accuracy` isn't `strict`
const PosixClassMap = new Map([
  ['alnum', r`[\p{Alpha}\p{Nd}]`],
  ['alpha', r`\p{Alpha}`],
  ['ascii', r`\p{ASCII}`],
  ['blank', r`[\p{Zs}\t]`],
  ['cntrl', r`\p{cntrl}`],
  ['digit', r`\p{Nd}`],
  ['graph', r`[\P{space}&&\P{cntrl}&&\P{Cn}&&\P{Cs}]`],
  ['lower', r`\p{Lower}`],
  ['print', r`[[\P{space}&&\P{cntrl}&&\P{Cn}&&\P{Cs}]\p{Zs}]`],
  ['punct', r`[\p{P}\p{S}]`], // Updated value from Oniguruma 6.9.9
  ['space', r`\p{space}`],
  ['upper', r`\p{Upper}`],
  ['word', r`[\p{Alpha}\p{M}\p{Nd}\p{Pc}]`],
  ['xdigit', r`\p{AHex}`],
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
  asciiSpaceChar,
  defaultWordChar,
  getIgnoreCaseMatchChars,
  JsUnicodePropertyMap,
  PosixClassMap,
  UnicodePropertiesWithSpecificCase,
};
