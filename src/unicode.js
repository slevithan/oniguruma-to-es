const casedRe = /^\p{Cased}$/u;
function charHasCase(char) {
  return casedRe.test(char);
}

// Unlike Oniguruma's Unicode properties via `\p` and `\P`, these names are case sensitive and
// don't allow inserting whitespace and underscores. Definitions at
// <https://github.com/kkos/oniguruma/blob/master/doc/RE> (POSIX bracket: Unicode Case)
const OnigurumaPosixClasses = {
  alnum: '[\\p{Alpha}\\p{Nd}]',
  alpha: '\\p{Alpha}',
  ascii: '\\p{ASCII}',
  blank: '[\\p{Zs}\\t]',
  cntrl: '\\p{cntrl}',
  digit: '\\p{Nd}',
  graph: '[\\P{space}&&\\P{cntrl}&&\\P{Cn}&&\\P{Cs}]',
  lower: '\\p{Lower}',
  print: '[[\\P{space}&&\\P{cntrl}&&\\P{Cn}&&\\P{Cs}]\\p{Zs}]',
  punct: '[\\p{P}\\p{S}]',
  space: '\\p{space}',
  upper: '\\p{Upper}',
  word: '[\\p{Alpha}\\p{M}\\p{Nd}\\p{Pc}]',
  xdigit: '\\p{AHex}',
};

// The Oniguruma list of supported Unicode properties is at
// <https://github.com/kkos/oniguruma/blob/master/doc/UNICODE_PROPERTIES>, and several more are
// explicitly added (those below). See: <https://github.com/kkos/oniguruma/blob/master/doc/RE>
const OnigurumaExtraUnicodeProperties = {
  Alnum: OnigurumaPosixClasses.alnum,
  Blank: OnigurumaPosixClasses.blank,
  Graph: OnigurumaPosixClasses.graph,
  Print: OnigurumaPosixClasses.print,
  Word: OnigurumaPosixClasses.word,
  XDigit: OnigurumaPosixClasses.xdigit,
  // The following are available with the same name in JS
  // - Alpha (JS: Alpha)
  // - ASCII (JS: ASCII)
  // - Cntrl (JS: cntrl)
  // - Digit (JS: digit)
  // - Lower (JS: Lower)
  // - Punct (JS: punct)
  // - Space (JS: space)
  // - Upper (JS: Upper)
};

// To work in JS, Unicode properties must be mapped to properties supported by JS, and also apply
// JS's stricter rules for casing, whitespace, and underscores in Unicode property names. This
// library takes a best effort approach to mapping, in order to avoid adding heavyweight Unicode
// character data. As part of this approach, following are all ES2024 Unicode properties that don't
// require a key/prefix (like `sc=` for scripts)
const JsKeylessUnicodeProperties = [
  // General categories and their aliases supported by JS; not all are supported by Oniguruma
  // See: <https://github.com/mathiasbynens/unicode-match-property-value-ecmascript/blob/main/data/mappings.js>
  'C', 'Other',
  'Cc', 'Control', 'cntrl',
  'Cf', 'Format',
  'Cn', 'Unassigned',
  'Co', 'Private_Use',
  'Cs', 'Surrogate',
  'L', 'Letter',
  'LC', 'Cased_Letter',
  'Ll', 'Lowercase_Letter',
  'Lm', 'Modifier_Letter',
  'Lo', 'Other_Letter',
  'Lt', 'Titlecase_Letter',
  'Lu', 'Uppercase_Letter',
  'M', 'Mark', 'Combining_Mark',
  'Mc', 'Spacing_Mark',
  'Me', 'Enclosing_Mark',
  'Mn', 'Nonspacing_Mark',
  'N', 'Number',
  'Nd', 'Decimal_Number', 'digit',
  'Nl', 'Letter_Number',
  'No', 'Other_Number',
  'P', 'Punctuation', 'punct',
  'Pc', 'Connector_Punctuation',
  'Pd', 'Dash_Punctuation',
  'Pe', 'Close_Punctuation',
  'Pf', 'Final_Punctuation',
  'Pi', 'Initial_Punctuation',
  'Po', 'Other_Punctuation',
  'Ps', 'Open_Punctuation',
  'S', 'Symbol',
  'Sc', 'Currency_Symbol',
  'Sk', 'Modifier_Symbol',
  'Sm', 'Math_Symbol',
  'So', 'Other_Symbol',
  'Z', 'Separator',
  'Zl', 'Line_Separator',
  'Zp', 'Paragraph_Separator',
  'Zs', 'Space_Separator',

  // Binary properties and their aliases supported by JS; not all are supported by Oniguruma
  // See: <https://tc39.es/ecma262/multipage/text-processing.html#table-binary-unicode-properties>
  'ASCII',
  'ASCII_Hex_Digit', 'AHex',
  'Alphabetic', 'Alpha',
  'Any',
  'Assigned',
  'Bidi_Control', 'Bidi_C',
  'Bidi_Mirrored', 'Bidi_M',
  'Case_Ignorable', 'CI',
  'Cased',
  'Changes_When_Casefolded', 'CWCF',
  'Changes_When_Casemapped', 'CWCM',
  'Changes_When_Lowercased', 'CWL',
  'Changes_When_NFKC_Casefolded', 'CWKCF',
  'Changes_When_Titlecased', 'CWT',
  'Changes_When_Uppercased', 'CWU',
  'Dash',
  'Default_Ignorable_Code_Point', 'DI',
  'Deprecated', 'Dep',
  'Diacritic', 'Dia',
  'Emoji',
  'Emoji_Component', 'EComp',
  'Emoji_Modifier', 'EMod',
  'Emoji_Modifier_Base', 'EBase',
  'Emoji_Presentation', 'EPres',
  'Extended_Pictographic', 'ExtPict',
  'Extender', 'Ext',
  'Grapheme_Base', 'Gr_Base',
  'Grapheme_Extend', 'Gr_Ext',
  'Hex_Digit', 'Hex',
  'IDS_Binary_Operator', 'IDSB',
  'IDS_Trinary_Operator', 'IDST',
  'ID_Continue', 'IDC',
  'ID_Start', 'IDS',
  'Ideographic', 'Ideo',
  'Join_Control', 'Join_C',
  'Logical_Order_Exception', 'LOE',
  'Lowercase', 'Lower',
  'Math',
  'Noncharacter_Code_Point', 'NChar',
  'Pattern_Syntax', 'Pat_Syn',
  'Pattern_White_Space', 'Pat_WS',
  'Quotation_Mark', 'QMark',
  'Radical',
  'Regional_Indicator', 'RI',
  'Sentence_Terminal', 'STerm',
  'Soft_Dotted', 'SD',
  'Terminal_Punctuation', 'Term',
  'Unified_Ideograph', 'UIdeo',
  'Uppercase', 'Upper',
  'Variation_Selector', 'VS',
  'White_Space', 'space',
  'XID_Continue', 'XIDC',
  'XID_Start', 'XIDS',
];

// Generates a Unicode property lookup name: lowercase, with hyphens, spaces, and underscores removed
function normalize(name) {
  return name.replace(/[- _]+/g, '').toLowerCase();
}

const JsKeylessUnicodePropertiesMap = new Map();
for (const p of JsKeylessUnicodeProperties) {
  JsKeylessUnicodePropertiesMap.set(normalize(p), p);
}

export {
  charHasCase, // TODO: Not used yet
  JsKeylessUnicodePropertiesMap,
  normalize,
  OnigurumaExtraUnicodeProperties, // TODO: Not used yet
  OnigurumaPosixClasses,
};
