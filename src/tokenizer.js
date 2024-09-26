import {charHasCase, KeylessUnicodeProperties} from './unicode.js';

const TokenTypes = {
  ALTERNATOR: 'ALTERNATOR',
  ASSERTION: 'ASSERTION', // TODO: Handle in parser. Rename as `ASSERTION_ESC` since the parser also uses `Assertion` for lookaround?
  BACKREF: 'BACKREF',
  BACKREF_K: 'BACKREF_K', // TODO: Handle in parser
  CC_CLOSE: 'CC_CLOSE',
  CC_HYPHEN: 'CC_HYPHEN',
  CC_INTERSECTOR: 'CC_INTERSECTOR',
  CC_OPEN: 'CC_OPEN',
  CHAR: 'CHAR',
  CHAR_SET: 'CHAR_SET', // TODO: Handle in parser
  GROUP_CLOSE: 'GROUP_CLOSE',
  GROUP_OPEN: 'GROUP_OPEN',
  SUBROUTINE: 'SUBROUTINE', // TODO: Handle in parser
  QUANTIFIER: 'QUANTIFIER', // TODO: Handle in parser
  VARCHAR_SET: 'VARCHAR_SET', // TODO: Handle in parser
  // Non-final representations
  ESCAPED_NUM: 'ESCAPED_NUM',
};

const TokenGroupKinds = {
  ATOMIC: 'ATOMIC',
  CAPTURING: 'CAPTURING',
  GROUP: 'GROUP',
  LOOKAHEAD: 'LOOKAHEAD',
  LOOKBEHIND: 'LOOKBEHIND',
};

const EscapeCharCodes = new Map([
  ['a', 7], // alert/bell [Not available in JS]
  ['b', 8], // backspace; only in character classes
  ['e', 27], // escape [Not available in JS]
  ['f', 12], // form feed
  ['n', 10], // line feed
  ['r', 13], // carriage return
  ['t', 9], // horizontal tab
  ['v', 11], // vertical tab
]);

const controlCharPattern = 'c.? | C(?:-.?)?';
const unicodePropertyPattern = String.raw`[pP]\{\^?[\x20\w]+\}`;
const hexCharPattern = String.raw`u\{[^\}]*\}? | u\p{AHex}{0,4} | x\p{AHex}{0,2}`;
const escapedNumPattern = '\\d{1,3}';
const charClassOpenPattern = String.raw`\[\^?\]?`;
// Even with flag x, Onig doesn't allow whitespace to separate a quantifier from the `?` or `+`
// that makes it lazy or possessive
const quantifierRe = /[?*+][?+]?|\{\d+(?:,\d*)?\}\??/;
const tokenRe = new RegExp(String.raw`
  \\ (?:
    ${controlCharPattern}
    | ${unicodePropertyPattern}
    | ${hexCharPattern}
    | ${escapedNumPattern}
    | [gk]<[^>]+>
    | .
  )
  | \( (?: \? (?:
    [:=!>]
    | <[=!]
    | <[^>]+>
    | '[^']+'
    | # (?:[^)\\] | \\.?)* \)?
    | [imx\-]+[:)]
  )?)?
  | ${quantifierRe.source}
  | ${charClassOpenPattern}
  | .
`.replace(/\s+/g, ''), 'gsu');
const charClassTokenRe = new RegExp(String.raw`
  \\ (?:
    ${controlCharPattern}
    | ${unicodePropertyPattern}
    | ${hexCharPattern}
    | ${escapedNumPattern}
    | .
  )
  | ${charClassOpenPattern}
  | &&
  | .
`.replace(/\s+/g, ''), 'gsu');

function tokenize(expression, onigFlags = '') {
  if (!/^[imx]*$/.test(onigFlags)) {
    throw new Error(`Unsupported Oniguruma flag "${onigFlags}"; only imx supported`);
  }
  const allTokens = [];
  const modifierStack = [{
    ignoreCase: onigFlags.includes('i'),
    // By default, Onig uses flag m for dotAll, unlike JS's use of flag s
    dotAll: onigFlags.includes('m'),
    extended: onigFlags.includes('x'),
  }];
  const isIgnoreCaseOn = () => modifierStack.at(-1).ignoreCase;
  const isDotAllOn = () => modifierStack.at(-1).dotAll;
  const isExtendedOn = () => modifierStack.at(-1).extended;
  const reuseCurrentGroupModifiers = () => modifierStack.push({...modifierStack.at(-1)});
  const captureNames = [];
  const potentialUnnamedCaptures = [];
  let numPotentialUnnamedCaptures = 0;
  let hasCaseSensitiveToken = false;
  let hasCaseInsensitiveToken = false;
  let hasDotAllDot = false;
  let hasNonDotAllDot = false;
  let hasMultilineAnchor = false;
  let match;
  tokenRe.lastIndex = 0;
  while (match = tokenRe.exec(expression)) {
    const m = match[0];
    const [m0, m1, m2] = m;
    // Might add 0, 1, or multiple tokens per loop iteration
    const tokens = [];
    let hasCase = false;
    if (m === '#' && isExtendedOn()) {
      // Onig's only line break char is line feed
      const end = expression.indexOf('\n', tokenRe.lastIndex);
      // Jump forward to the end of the comment for the next loop iteration
      tokenRe.lastIndex = end === -1 ? expression.length : end;
    } else if (/^\s$/.test(m) && isExtendedOn()) {
      // No op
    } else if (m0 === '\\') {
      if ('AbBGzZ'.includes(m1)) {
        tokens.push(createToken(TokenTypes.ASSERTION, m));
      } else if (m.startsWith('\\g<')) {
        // Subroutines follow the status of flag modifiers from the groups they reference, and not
        // any modifiers preceding themselves. Thus, no need to set `hasCase = true` or the
        // `ignoreCase` prop. Instead, can later reference `ignoreCase`, etc. from the
        // `GROUP_OPEN` token that the subroutine references
        tokens.push(createToken(TokenTypes.SUBROUTINE, m));
      } else if (m.startsWith('\\k<')) {
        // Assume the backref includes characters with case
        hasCase = true;
        // Note: Numbered backrefs like `\k<1>` are invalid if named capture is present
        tokens.push(createToken(TokenTypes.BACKREF_K, m, {
          // Can't emulate a different value for backref case sensitivity except in JS envs that
          // support mode modifiers, but track this anyway
          ignoreCase: isIgnoreCaseOn(),
        }));
      } else if ('RX'.includes(m1)) {
        tokens.push(createToken(TokenTypes.VARCHAR_SET, m));
      // Unsupported; avoid treating as an identity escape
      } else if (m1 === 'K') {
        throw new Error(`Unsupported escape "${m}"`);
      } else {
        const result = getTokenFromSharedEscapeMatch(m, isIgnoreCaseOn());
        hasCase = result.hasCase;
        tokens.push(result.token);
      }
    } else if (m0 === '(') {
      // Unnamed capture if no named captures, else noncapturing
      if (m === '(') {
        numPotentialUnnamedCaptures++;
        reuseCurrentGroupModifiers();
        const token = createToken(TokenTypes.GROUP_OPEN, m, {
          // Will change to `CAPTURING` and add `number` in a second pass if no named captures
          kind: TokenGroupKinds.GROUP,
          // Will be removed if not a capture due to presense of named capture
          number: numPotentialUnnamedCaptures,
          // Track this for subroutines that might reference the group (TODO: track other flags)
          ignoreCase: isIgnoreCaseOn(),
        });
        potentialUnnamedCaptures.push(token);
        tokens.push(token);
      // Noncapturing group
      } else if (m === '(?:') {
        reuseCurrentGroupModifiers();
        tokens.push(createToken(TokenTypes.GROUP_OPEN, m, {
          kind: TokenGroupKinds.GROUP,
        }));
      // Atomic group
      } else if (m === '(?>') {
        reuseCurrentGroupModifiers();
        tokens.push(createToken(TokenTypes.GROUP_OPEN, m, {
          kind: TokenGroupKinds.ATOMIC,
        }));
      // Lookaround
      } else if (m === '(?=' || m === '(?!' || m === '(?<=' || m === '(?<!') {
        reuseCurrentGroupModifiers();
        tokens.push(createToken(TokenTypes.GROUP_OPEN, m, {
          kind: m2 === '<' ? TokenGroupKinds.LOOKBEHIND : TokenGroupKinds.LOOKAHEAD,
          negate: m.endsWith('!'),
        }));
      // Named capture (checked after lookbehind due to similar syntax)
      } else if (m2 === '<' || m2 === "'") {
        const name = m.slice(3, -1);
        captureNames.push(name);
        reuseCurrentGroupModifiers();
        tokens.push(createToken(TokenTypes.GROUP_OPEN, m, {
          kind: TokenGroupKinds.CAPTURING,
          number: captureNames.length,
          name,
          // Track this for subroutines that might reference the group (TODO: track other flags)
          ignoreCase: isIgnoreCaseOn(),
        }));
      // Comment group
      } else if (m2 === '#') {
        if (!m.endsWith(')')) {
          throw new Error('Unclosed comment group "(?#"');
        }
      // Modifier/flag group
      } else {
        const newMods = getNewModsFromFlagGroup(m, isIgnoreCaseOn(), isDotAllOn(), isExtendedOn());
        // Ex: `(?im-x)`
        if (m.endsWith(')')) {
          // Replace modifiers until the end of the current group
          modifierStack[modifierStack.length - 1] = newMods;
        // Ex: `(?im-x:`
        } else {
          modifierStack.push(newMods);
          tokens.push(createToken(TokenTypes.GROUP_OPEN, m, {
            kind: TokenGroupKinds.GROUP,
          }));
        }
      }
    } else if (m === ')') {
      modifierStack.pop();
      tokens.push(createToken(TokenTypes.GROUP_CLOSE, m));
    // TODO: Move to/near top
    } else if (m0 === '[') {
      const result = getTokensFromCharClass(expression, m, tokenRe.lastIndex, isIgnoreCaseOn());
      hasCase = result.hasCase;
      tokens.push(...result.tokens);
      // Jump forward to the end of the char class for the next loop iteration
      tokenRe.lastIndex = result.lastIndex;
    } else if (m === '.') {
      const dotAll = isDotAllOn();
      if (dotAll) {
        hasDotAllDot = true;
      } else {
        hasNonDotAllDot = true;
      }
      tokens.push(createToken(TokenTypes.CHAR_SET, m, {
        kind: 'any',
        dotAll,
      }));
    } else if (m === '^' || m === '$') {
      hasMultilineAnchor = true;
      tokens.push(createToken(TokenTypes.ASSERTION, m));
    } else if (m === '|') {
      tokens.push(createToken(TokenTypes.ALTERNATOR, m));
    } else if (quantifierRe.test(m)) {
      tokens.push(createToken(TokenTypes.QUANTIFIER, m));
    } else {
      assertSingleChar(m);
      hasCase = charHasCase(m);
      tokens.push(createToken(TokenTypes.CHAR, m, {
        charCode: m.codePointAt(0),
        ignoreCase: isIgnoreCaseOn(),
      }));
    }
  
    if (hasCase) {
      if (isIgnoreCaseOn()) {
        hasCaseInsensitiveToken = true;
      } else {
        hasCaseSensitiveToken = true;
      }
    }
    allTokens.push(...tokens);
  }

  // Second pass to enable unnamed captures if no named captures used
  for (const t of potentialUnnamedCaptures) {
    if (captureNames.length) {
      delete t.number;
      delete t.ignoreCase;
    } else {
      t.kind = TokenGroupKinds.CAPTURING;
    }
  }
  const numCaptures = captureNames.length || numPotentialUnnamedCaptures;
  // Third pass to split escaped nums, now that we have the necessary context
  let numCharClassesOpen = 0;
  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t.type === TokenTypes.CC_OPEN) {
      numCharClassesOpen++;
    } else if (t.type === TokenTypes.CC_CLOSE) {
      numCharClassesOpen--;
    } else if (t.type === TokenTypes.ESCAPED_NUM) {
      const result = splitEscapedNumToken(t, numCaptures, !!captureNames.length, !!numCharClassesOpen);
      allTokens.splice(i, 1, ...result);
      i += result.length - 1;
    }
  }

  // Include JS flag i if a case insensitive token was used and no case sensitive tokens were used
  const includeFlagI = (onigFlags.includes('i') || hasCaseInsensitiveToken) && !hasCaseSensitiveToken;
  // Include JS flag s (Onig flag m) if a dotAll dot was used and no non-dotAll dots were used
  const includeFlagS = (onigFlags.includes('m') || hasDotAllDot) && !hasNonDotAllDot;
  // Include JS flag m (not the same as Onig flag m) if `^` or `$` are used, so they work the same
  // as Onig (there's a slight difference since Onig's only line break char is line feed)
  const includeFlagM = hasMultilineAnchor;
  return {
    tokens: allTokens,
    // Drop Onig flag x since we've already accounted for it during tokenization (JS doesn't
    // support it and Onig uses different free spacing rules than the `regex` library)
    jsFlags: {
      ignoreCase: includeFlagI,
      multiline: includeFlagM,
      dotAll: includeFlagS,
    },
    numCaptures,
    captureNames,
  };
}

// Value is 1-3 digits, which can be a backref (possibly invalid), null, octal, or identity escape,
// possibly followed by 1-2 literal digits
function splitEscapedNumToken(token, numCaptures, hasNamedCapture, inCharClass) {
  const {raw, ignoreCase} = token;
  // Keep any leading 0s since they indicate octal
  const value = raw.slice(1);
  // Backref (possibly invalid)
  if (
    !inCharClass &&
    ( // Single digit 1-9 is always treated as a backref
      (value !== '0' && value.length === 1) ||
      // Leading 0 makes it octal; backrefs can't include following literal digits
      (value[0] !== '0' && +value <= numCaptures)
    )
  ) {
    if (+value > numCaptures) {
      throw new Error(`Invalid backref "${raw}"`);
    }
    if (hasNamedCapture) {
      throw new Error('Numbered backrefs not allowed when using named capture');
    }
    //  `ignoreCase`
    return [createToken(TokenTypes.BACKREF, raw, {
      // Can't emulate a different value for backref case sensitivity except in JS envs that
      // support mode modifiers, but track this anyway
      ignoreCase,
    })];
  }
  const tokens = [];
  // Gives 1-3 matches; the first (only) might be octal
  const matches = value.match(/^[0-7]+|\d/g);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    let charCode = m.codePointAt(0);
    // Octal digits are 0-7
    if (i === 0 && m !== '8' && m !== '9') {
      charCode = parseInt(m, 8);
    }
    tokens.push(createToken(TokenTypes.CHAR, (i === 0 ? '\\' : '') + m, {
      charCode,
      ignoreCase: ignoreCase && !inCharClass && charHasCase(String.fromCodePoint(charCode)),
    }));
  }
  return tokens;
}

function getTokensFromCharClass(expression, opener, lastIndex, ignoreCase) {
  assertNonEmptyCharClass(opener);
  let numCharClassesOpen = 1;
  const tokens = [createToken(TokenTypes.CC_OPEN, opener, {
    // Only mark this here; not for tokens within this (outermost) char class
    ignoreCase,
  })];
  let charClassHasCase = false;
  let match;
  charClassTokenRe.lastIndex = lastIndex;
  while (match = charClassTokenRe.exec(expression)) {
    const m = match[0];
    if (m[0] === '[') {
      assertNonEmptyCharClass(m);
      numCharClassesOpen++;
      tokens.push(createToken(TokenTypes.CC_OPEN, m));
    } else if (m === ']') {
      numCharClassesOpen--;
      tokens.push(createToken(TokenTypes.CC_CLOSE, m));
      if (!numCharClassesOpen) {
        break;
      }
    } else {
      const result = getTokenFromCharClassMatch(m);
      if (result.hasCase) {
        charClassHasCase = true;
      }
      tokens.push(result.token);
    }
  }
  return {
    hasCase: charClassHasCase,
    tokens,
    lastIndex: charClassTokenRe.lastIndex || expression.length,
  }
}

// TODO: Currently inconsistent about whether prop `ignoreCase` is included on each token
// (`getTokenFromSharedEscapeMatch` sets it to `false`). Either always exclude it or set `false`
// (probably always set it to make things simpler elsewhere, e.g. for `splitEscapedNumToken`); but
// see comments "don't need to set `ignoreCase`"
function getTokenFromCharClassMatch(m) {
  let token;
  let hasCase = false;
  if (m[0] === '\\') {
    const result = getTokenFromSharedEscapeMatch(m);
    hasCase = result.hasCase;
    token = result.token;
  // Range, error, or literal hyphen
  } else if (m === '-') {
    token = createToken(TokenTypes.CC_HYPHEN, m);
  } else if (m === '&&') {
    token = createToken(TokenTypes.CC_INTERSECTOR, m);
  } else {
    assertSingleChar(m);
    hasCase = charHasCase(m);
    token = createToken(TokenTypes.CHAR, m, {
      charCode: m.codePointAt(0),
    });
  }
  return {
    hasCase,
    token,
  };
}

// Tokens shared by base syntax and character class syntax that start with `\`
function getTokenFromSharedEscapeMatch(m, ignoreCase = false) {
  const m1 = m[1];
  let token;
  let hasCase = false;
  if ('cC'.includes(m1)) {
    token = createTokenForControlChar(m);
  } else if ('dDhHsSwW'.includes(m1)) {
    token = createTokenForShorthandCharClass(m);
  } else if (/^\\[pP]\{/.test(m)) {
    // Assume the set includes characters with case
    hasCase = true;
    token = createTokenForUnicodeProperty(m);
  } else if ('ux'.includes(m1)) {
    const charCode = getValidatedUnicodeCharCode(m);
    hasCase = charHasCase(String.fromCodePoint(charCode));
    token = createToken(TokenTypes.CHAR, m, {
      charCode,
      ignoreCase,
    });
  } else if (EscapeCharCodes.has(m1)) {
    token = createToken(TokenTypes.CHAR, m, {
      charCode: EscapeCharCodes.get(m1),
      // None of these have case so don't need to set `ignoreCase`
    });
  // Escaped number: backref (possibly invalid), null, octal, or identity escape, possibly followed
  // by 1-2 literal digits
  } else if (!isNaN(m1)) {
    // Assume a backref that includes characters with case or an octal that refs a cased char
    hasCase = true;
    token = createToken(TokenTypes.ESCAPED_NUM, m, {
      // Can't emulate a different value for backref case sensitivity except in JS envs that
      // support mode modifiers, but track this anyway (can use it for octals)
      ignoreCase,
    });
  // Unsupported; avoid treating as an identity escape
  } else if (m1 === 'M') {
    throw new Error(`Unsupported escape "${m}"`);
  } else if (m === '\\') {
    throw new Error('Incomplete escape "\\"');
  // Identity escape
  } else {
    hasCase = charHasCase(m1);
    token = createToken(TokenTypes.CHAR, m, {
      charCode: m.codePointAt(1),
      ignoreCase,
    });
  }
  return {
    hasCase,
    token,
  };
}

function getValidatedUnicodeCharCode(raw) {
  if (/^(?:\\x$|\\u(?!\p{AHex}{4}|\{\s*\p{AHex}{1,6}\s*\}))/u.test(raw)) {
    throw new Error(`Incomplete or invalid escape "${raw}"`);
  }
  // Might include leading 0s
  const hex = raw[2] === '{' ?
    /^\\u\{\s*(?<hex>\p{AHex}+)/u.exec(raw).groups.hex :
    raw.slice(2);
  return parseInt(hex, 16);
}

// TODO: Refactor to offer individual functions with a `getTokenBase` like in the parser
function createToken(type, raw, data = {}) {
  const base = {
    type,
    raw,
  };
  switch (type) {
    case TokenTypes.ALTERNATOR:
    case TokenTypes.CC_CLOSE:
    case TokenTypes.CC_INTERSECTOR:
    case TokenTypes.GROUP_CLOSE:
      return base;
    case TokenTypes.ASSERTION:
    case TokenTypes.VARCHAR_SET:
      return {
        ...base,
        kind: raw,
      };
    case TokenTypes.BACKREF:
      return {
        ...base,
        ...data,
        ref: +raw.slice(1), // TODO: Probably remove since it can be derived from `raw`
      };
    case TokenTypes.BACKREF_K:
    case TokenTypes.SUBROUTINE:
      return {
        ...base,
        ...data,
        // \k<name>, \k<n>, \g<name>, etc.
        ref: raw.slice(3, -1), // TODO: Probably remove since it can be derived from `raw`
      };
    case TokenTypes.CC_HYPHEN:
      return {
        ...base,
        charCode: 45,
      };
    case TokenTypes.CC_OPEN:
      return {
        ...base,
        ...data,
        negate: raw[1] === '^',
      };
    case TokenTypes.CHAR:
    case TokenTypes.CHAR_SET:
    case TokenTypes.ESCAPED_NUM:
    case TokenTypes.GROUP_OPEN:
      return {
        ...base,
        ...data,
      };
    case TokenTypes.QUANTIFIER:
      return {
        ...base,
        ...getQuantifierTokenProps(raw),
      };
    default:
      throw new Error(`Unexpected token type "${type}"`);
  }
}

// Expects `\cx` or `\C-x`
function createTokenForControlChar(raw) {
  const char = raw[1] === 'c' ? raw[2] : raw[3];
  if (!char || !/[a-zA-Z]/.test(char)) {
    // Unlike JS, Onig allows any char to follow `\c` (with special conversion rules), but this is
    // an extreme edge case so it's easier to not support it
    throw new Error(`Unsupported control character "${raw}"`);
  }
  return createToken(TokenTypes.CHAR, raw, {
    charCode: char.toUpperCase().codePointAt(0) - 64,
    // None of these have case so don't need to set `ignoreCase`
  });
}

function createTokenForShorthandCharClass(raw) {
  const lower = raw[1].toLowerCase();
  return createToken(TokenTypes.CHAR_SET, raw, {
    kind: {
      'd': 'digit',
      'h': 'hex', // Not available in JS
      // Unlike JS, Onig `\s` matches only ASCII space, tab, LF, CR, VT, FF, but close enough!
      's': 'space',
      'w': 'word',
    }[lower],
    negate: raw[1] !== lower,
  });
}

function createTokenForUnicodeProperty(raw) {
  const {p, neg, prop} = /^\\(?<p>[pP])\{(?<neg>\^?)(?<prop>[ \w]+)/.exec(raw).groups;
  const negate = (p === 'P' && !neg) || (p === 'p' && !!neg);
  const jsProp = getJsUnicodePropertyName(prop);
  const keyless = KeylessUnicodeProperties.has(jsProp);
  return createToken(TokenTypes.CHAR_SET, raw, {
    kind: 'property',
    negate,
    // If not identified as a JS binary property or general category, assume it's a script
    property: keyless ? jsProp : 'sc',
    value: keyless ? null : jsProp,
    // Handling `ignoreCase` in JS envs without support for mode modifiers would require
    // heavyweight Unicode character data, and in any case is rarely needed since most Unicode
    // properties that include cased chars either include all cases or are explicitly cased
    // (ex: `\p{Lower}`) so are unlikely to be intentionally adjusted by an `(?i)` modifier
  });
}

function getQuantifierTokenProps(raw) {
  if (raw[0] === '{') {
    const {min, max} = /^\{(?<min>\d+)(?:,(?<max>\d*))?/.exec(raw).groups;
    return {
      min: +min,
      max: max === undefined ? +min : (max === '' ? Infinity : +max),
      greedy: !raw.endsWith('?'),
      // By default, Onig doesn't support making interval quantifiers possessive
      possessive: false,
    };
  }
  return {
    min: raw[0] === '+' ? 1 : 0,
    max: raw[0] === '?' ? 1 : Infinity,
    greedy: raw[1] !== '?',
    possessive: raw[1] === '+',
  };
}

function getNewModsFromFlagGroup(raw, ignoreCase, dotAll, extended) {
  let {on, off} = /^\(\?(?<on>[imx]*)(?:-(?<off>[imx\-]*))?/.exec(raw).groups;
  off ??= '';
  return {
    ignoreCase: (ignoreCase || on.includes('i')) && !off.includes('i'),
    dotAll: (dotAll || on.includes('m')) && !off.includes('m'),
    extended: (extended || on.includes('x')) && !off.includes('x'),
  };
}

// Unlike Onig, JS Unicode property names are case sensitive, don't ignore whitespace and
// underscores, and require underscores in specific positions. This is a best effort and doesn't
// find a mapping for all possible differences
function getJsUnicodePropertyName(property) {
  // Most JS Unicode properties use casing 'Like_This', but there are exceptions
  let mapped = property.
    trim().
    replace(/\s+/g, '_').
    // Change `PropertyName` to `Property_Name`
    replace(/[A-Z][a-z]+(?=[A-Z])/g, '$&_');
  if (KeylessUnicodeProperties.has(mapped)) {
    return mapped;
  }
  const variations = [
    str => str.toUpperCase(),
    str => str.toLowerCase(),
    // Try `Title_Case` last so we pass this version through in case it's a script name not found
    // in `KeylessUnicodeProperties`
    str => str.replace(/[a-z]+/ig, m => m[0].toUpperCase() + m.slice(1).toLowerCase()),
  ];
  for (const fn of variations) {
    mapped = fn(mapped);
    if (KeylessUnicodeProperties.has(mapped)) {
      return mapped;
    }
  }
  return mapped;
}

function assertNonEmptyCharClass(raw) {
  if (raw.endsWith(']')) {
    throw new Error(`Empty char class "${raw}" not allowed by Oniguruma`);
  }
}

function assertSingleChar(raw) {
  if (raw.length !== 1) {
    throw new Error(`Expected match "${raw}" to be a single char`);
  }
}

export {
  tokenize,
  TokenGroupKinds,
  TokenTypes,
};
