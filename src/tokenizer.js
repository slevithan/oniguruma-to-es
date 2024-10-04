import {charHasCase} from './unicode.js';

const TokenTypes = {
  Alternator: 'Alternator',
  Assertion: 'Assertion',
  Backreference: 'Backreference',
  Character: 'Character',
  CharacterClassClose: 'CharacterClassClose',
  CharacterClassHyphen: 'CharacterClassHyphen',
  CharacterClassIntersector: 'CharacterClassIntersector',
  CharacterClassOpen: 'CharacterClassOpen',
  CharacterSet: 'CharacterSet',
  Directive: 'Directive',
  GroupClose: 'GroupClose',
  GroupOpen: 'GroupOpen',
  Subroutine: 'Subroutine', // TODO: Handle in parser
  Quantifier: 'Quantifier',
  VariableLengthCharacterSet: 'VariableLengthCharacterSet',
  // Non-final representation
  EscapedNumber: 'EscapedNumber',
};

const TokenCharacterSetKinds = {
  any: 'any',
  digit: 'digit',
  hex: 'hex',
  property: 'property',
  space: 'space',
  word: 'word',
};

const TokenDirectiveKinds = {
  keep: 'keep',
};

const TokenGroupKinds = {
  atomic: 'atomic',
  capturing: 'capturing',
  group: 'group',
  lookahead: 'lookahead',
  lookbehind: 'lookbehind',
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
// Oniguruma considers `\p` an identity escape, but e.g. `\p{`, `\p{ ^L}`, and `\p{gc=L}` are invalid
const unicodePropertyPattern = String.raw`[pP]\{(?:\^?[\x20\w]+\})?`;
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
    | [gk]<[^>]*>
    | [gk]'[^']*'
    | .
  )
  | \( (?: \? (?:
    [:=!>]
    | <[=!]
    | <[^>]*>
    | '[^']*'
    | # (?:[^)\\] | \\.?)* \)?
    | [imx\-]+[:)]
  )?)?
  | ${quantifierRe.source}
  | ${charClassOpenPattern}
  | .
`.replace(/\s+/g, ''), 'gsu');
// TODO: Add support for POSIX classes (type `CharacterSet`)
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
  const context = {
    modifierStack: [{
      ignoreCase: onigFlags.includes('i'),
      // By default, Onig uses flag m for dotAll, unlike JS's use of flag s
      dotAll: onigFlags.includes('m'),
      extended: onigFlags.includes('x'),
    }],
    isIgnoreCaseOn: () => context.modifierStack.at(-1).ignoreCase,
    isDotAllOn: () => context.modifierStack.at(-1).dotAll,
    isExtendedOn: () => context.modifierStack.at(-1).extended,
    reuseCurrentGroupModifiers: () => context.modifierStack.push({...context.modifierStack.at(-1)}),
    captureNames: [], // Duplicate names should increase the length
    potentialUnnamedCaptureTokens: [],
    hasDotAllDot: false,
    hasNonDotAllDot: false,
    hasMultilineAnchor: false,
  };
  let tokens = [];
  let hasCaseInsensitiveToken = false;
  let hasCaseSensitiveToken = false;
  let match;
  tokenRe.lastIndex = 0;
  while (match = tokenRe.exec(expression)) {
    const result = getTokenWithDetails(context, expression, match[0], tokenRe.lastIndex) ?? {};
    if (result.hasCase) {
      if (context.isIgnoreCaseOn()) {
        hasCaseInsensitiveToken = true;
      } else {
        hasCaseSensitiveToken = true;
      }
    }
    if (result.tokens) {
      tokens.push(...result.tokens);
    } else if (result.token) {
      tokens.push(result.token);
    }
    if (result.lastIndex !== undefined) {
      tokenRe.lastIndex = result.lastIndex;
    }
  }

  const numCaptures = context.captureNames.length || context.potentialUnnamedCaptureTokens.length;
  // Split escaped nums, now that we have all the necessary details
  tokens = tokens.map(
    t => t.type === TokenTypes.EscapedNumber ? splitEscapedNumToken(t, numCaptures) : t
  ).flat();

  // Enable unnamed captures if no named captures used
  for (const t of context.potentialUnnamedCaptureTokens) {
    if (context.captureNames.length) {
      delete t.number;
      delete t.ignoreCase;
    } else {
      t.kind = TokenGroupKinds.capturing;
    }
  }

  // Include JS flag i if a case insensitive token was used and no case sensitive tokens were used
  const jsFlagI = (onigFlags.includes('i') || hasCaseInsensitiveToken) && !hasCaseSensitiveToken;
  // Include JS flag s (Onig flag m) if a dotAll dot was used and no non-dotAll dots were used
  const jsFlagS = (onigFlags.includes('m') || context.hasDotAllDot) && !context.hasNonDotAllDot;
  // Include JS flag m (not the same as Onig flag m) if `^` or `$` were used, which makes them work
  // the same as in Onig (slight difference since Onig's only line break char is line feed)
  const jsFlagM = context.hasMultilineAnchor;
  // Drop Onig flag x since we've already accounted for it during tokenization; JS doesn't support
  // it and Onig uses different free spacing rules than the `regex` library
  return {
    tokens,
    jsFlags: {
      ignoreCase: jsFlagI,
      multiline: jsFlagM,
      dotAll: jsFlagS,
    },
    captureNames: context.captureNames,
  };
}

function getTokenWithDetails(context, expression, m, lastIndex) {
  const [m0, m1, m2] = m;
  if (m0 === '[') {
    const result = getAllTokensForCharClass(expression, m, lastIndex, context.isIgnoreCaseOn());
    return {
      hasCase: result.charClassHasCase,
      // Token array
      tokens: result.tokens,
      // Jump forward to the end of the char class
      lastIndex: result.lastIndex,
    };
  }
  if (m0 === '\\') {
    if ('AbBGzZ'.includes(m1)) {
      return {
        token: createToken(TokenTypes.Assertion, m),
      };
    }
    if (/^\\g[<']/.test(m)) {
      // Subroutines follow the status of flag modifiers from the groups they reference, and not
      // any modifiers preceding themselves. Thus, no need to set `hasCase = true` or the
      // `ignoreCase` prop. Instead, can later reference `ignoreCase`, etc. from the `GroupOpen`
      // token that the subroutine references
      return {
        token: createToken(TokenTypes.Subroutine, m),
      };
    }
    if (/^\\k[<']/.test(m)) {
      return {
        // Assume the backref includes characters with case
        hasCase: true,
        token: createToken(TokenTypes.Backreference, m, {
          // Can't emulate a different value for backref case sensitivity except in JS envs that
          // support mode modifiers, but track this anyway
          ignoreCase: context.isIgnoreCaseOn(),
        }),
      };
    }
    if (m1 === 'K') {
      return {
        token: createToken(TokenTypes.Directive, m, {
          kind: TokenDirectiveKinds.keep,
        }),
      };
    }
    if ('RX'.includes(m1)) {
      return {
        token: createToken(TokenTypes.VariableLengthCharacterSet, m),
      };
    }
    // Run last since it assumes an identity escape as final condition
    return getTokenWithDetailsFromSharedEscape(m, {
      inCharClass: false,
      ignoreCase: context.isIgnoreCaseOn(),
    });
  }
  if (m0 === '(') {
    // Unnamed capture if no named captures, else noncapturing group
    if (m === '(') {
      context.reuseCurrentGroupModifiers();
      const token = createToken(TokenTypes.GroupOpen, m, {
        // Will change to `capturing` and add `number` in a second pass if no named captures
        kind: TokenGroupKinds.group,
        // Will be removed if not a capture (due to presense of named capture)
        number: context.potentialUnnamedCaptureTokens.length + 1,
        // Track this for subroutines that might reference the group (TODO: track other flags)
        ignoreCase: context.isIgnoreCaseOn(),
      });
      context.potentialUnnamedCaptureTokens.push(token);
      return {
        token,
      };
    }
    // Noncapturing group
    if (m === '(?:') {
      context.reuseCurrentGroupModifiers();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.group,
        }),
      };
    }
    // Atomic group
    if (m === '(?>') {
      context.reuseCurrentGroupModifiers();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.atomic,
        }),
      };
    }
    // Lookaround
    if (m === '(?=' || m === '(?!' || m === '(?<=' || m === '(?<!') {
      context.reuseCurrentGroupModifiers();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: m2 === '<' ? TokenGroupKinds.lookbehind : TokenGroupKinds.lookahead,
          negate: m.endsWith('!'),
        }),
      };
    }
    // Named capture (checked after lookbehind due to similar syntax)
    if (m2 === '<' || m2 === "'") {
      const name = m.slice(3, -1);
      context.captureNames.push(name);
      context.reuseCurrentGroupModifiers();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.capturing,
          number: context.captureNames.length,
          name,
          // Track this for subroutines that might reference the group (TODO: track other flags)
          ignoreCase: context.isIgnoreCaseOn(),
        }),
      }
    }
    // Comment group
    if (m2 === '#') {
      if (!m.endsWith(')')) {
        throw new Error('Unclosed comment group "(?#"');
      }
      return;
    }
    if (m === '(?') {
      throw new Error('Invalid group');
    }
    // Else, modifier/flag group
    const newMods = getNewModsFromFlagGroup(m, context.isIgnoreCaseOn(), context.isDotAllOn(), context.isExtendedOn());
    // Ex: `(?im-x)`
    if (m.endsWith(')')) {
      // Replace modifiers until the end of the current group
      context.modifierStack[context.modifierStack.length - 1] = newMods;
      return;
    }
    // Ex: `(?im-x:`
    context.modifierStack.push(newMods);
    return {
      token: createToken(TokenTypes.GroupOpen, m, {
        kind: TokenGroupKinds.group,
      }),
    };
  }
  if (m === ')') {
    context.modifierStack.pop();
    return {
      token: createToken(TokenTypes.GroupClose, m),
    };
  }
  if (m === '#' && context.isExtendedOn()) {
    // Onig's only line break char is line feed
    const end = expression.indexOf('\n', lastIndex);
    return {
      // Jump forward to the end of the comment
      lastIndex: end === -1 ? expression.length : end,
    };
  }
  if (/^\s$/.test(m) && context.isExtendedOn()) {
    return;
  }
  if (m === '.') {
    const dotAll = context.isDotAllOn();
    if (dotAll) {
      context.hasDotAllDot = true;
    } else {
      context.hasNonDotAllDot = true;
    }
    return {
      token: createToken(TokenTypes.CharacterSet, m, {
        kind: TokenCharacterSetKinds.any,
        dotAll,
      }),
    };
  }
  if (m === '^' || m === '$') {
    context.hasMultilineAnchor = true;
    return {
      token: createToken(TokenTypes.Assertion, m),
    };
  }
  if (m === '|') {
    return {
      token: createToken(TokenTypes.Alternator, m),
    };
  }
  if (quantifierRe.test(m)) {
    return {
      token: createToken(TokenTypes.Quantifier, m),
    };
  }
  assertSingleChar(m);
  return {
    hasCase: charHasCase(m),
    token: createToken(TokenTypes.Character, m, {
      charCode: m.codePointAt(0),
      ignoreCase: context.isIgnoreCaseOn(),
    }),
  };
}

function getAllTokensForCharClass(expression, opener, lastIndex, ignoreCase) {
  assertNonEmptyCharClass(opener);
  const tokens = [createToken(TokenTypes.CharacterClassOpen, opener, {
    // Only mark this here; not for tokens within this (outermost) char class
    ignoreCase,
  })];
  let numCharClassesOpen = 1;
  let charClassHasCase = false;
  let match;
  charClassTokenRe.lastIndex = lastIndex;
  while (match = charClassTokenRe.exec(expression)) {
    const m = match[0];
    if (m[0] === '[') {
      assertNonEmptyCharClass(m);
      numCharClassesOpen++;
      tokens.push(createToken(TokenTypes.CharacterClassOpen, m));
    } else if (m === ']') {
      numCharClassesOpen--;
      tokens.push(createToken(TokenTypes.CharacterClassClose, m));
      if (!numCharClassesOpen) {
        break;
      }
    } else {
      const result = getCharClassTokenWithDetails(m);
      if (result.hasCase) {
        charClassHasCase = true;
      }
      tokens.push(result.token);
    }
  }
  return {
    charClassHasCase,
    tokens,
    lastIndex: charClassTokenRe.lastIndex || expression.length,
  }
}

function getCharClassTokenWithDetails(m) {
  if (m[0] === '\\') {
    // Assumes an identity escape as final condition
    return getTokenWithDetailsFromSharedEscape(m, {
      inCharClass: true,
      ignoreCase: false,
    });
  }
  // Range (possibly invalid) or literal hyphen
  if (m === '-') {
    return {
      token: createToken(TokenTypes.CharacterClassHyphen, m),
    }
  }
  if (m === '&&') {
    return {
      token: createToken(TokenTypes.CharacterClassIntersector, m),
    };
  }
  assertSingleChar(m);
  return {
    hasCase: charHasCase(m),
    token: createToken(TokenTypes.Character, m, {
      charCode: m.codePointAt(0),
    }),
  };
}

// Tokens shared by base syntax and char class syntax that start with `\`
function getTokenWithDetailsFromSharedEscape(m, {inCharClass, ignoreCase}) {
  const m1 = m[1];
  if ('cC'.includes(m1)) {
    return {
      token: createTokenForControlChar(m),
    };
  }
  if ('dDhHsSwW'.includes(m1)) {
    return {
      token: createTokenForShorthandCharClass(m),
    };
  }
  if (/^\\[pP]\{/.test(m)) {
    if (m.length === 3) {
      throw new Error('Invalid Oniguruma Unicode property');
    }
    return {
      // Assume the set includes characters with case
      hasCase: true,
      token: createTokenForUnicodeProperty(m),
    };
  }
  if ('ux'.includes(m1)) {
    const charCode = getValidatedUnicodeCharCode(m);
    return {
      hasCase: charHasCase(String.fromCodePoint(charCode)),
      token: createToken(TokenTypes.Character, m, {
        charCode,
        ignoreCase,
      }),
    };
  }
  if (EscapeCharCodes.has(m1)) {
    return {
      token: createToken(TokenTypes.Character, m, {
        charCode: EscapeCharCodes.get(m1),
        // None of these have case so don't need to set `ignoreCase`
      }),
    };
  }
  // Escaped number: backref (possibly invalid), null, octal, or identity escape, possibly followed
  // by 1-2 literal digits
  if (!isNaN(m1)) {
    return {
      // Assume it's a backref that includes chars with case or an octal that refs a cased char
      hasCase: true,
      token: createToken(TokenTypes.EscapedNumber, m, {
        inCharClass,
        // Can't emulate a different value for backref case sensitivity except in JS envs that
        // support mode modifiers, but track this anyway (can use it for octals)
        ignoreCase,
      }),
    };
  }
  // Unsupported; avoid treating as an identity escape
  if (m1 === 'M') {
    throw new Error(`Unsupported escape "${m}"`);
  }
  if (m === '\\') {
    throw new Error('Incomplete escape "\\"');
  }
  // Else, identity escape
  return {
    hasCase: charHasCase(m1),
    token: createToken(TokenTypes.Character, m, {
      charCode: m.codePointAt(1),
      ignoreCase,
    }),
  };
}

// Value is 1-3 digits, which can be a backref (possibly invalid), null, octal, or identity escape,
// possibly followed by 1-2 literal digits
function splitEscapedNumToken(token, numCaptures) {
  const {raw, ignoreCase} = token;
  // Keep any leading 0s since they indicate octal
  const value = raw.slice(1);
  // Backref (possibly invalid)
  if (
    !token.inCharClass &&
    ( // Single digit 1-9 is always treated as a backref
      (value !== '0' && value.length === 1) ||
      // Leading 0 makes it octal; backrefs can't include following literal digits
      (value[0] !== '0' && +value <= numCaptures)
    )
  ) {
    return [createToken(TokenTypes.Backreference, raw, {
      // Can't emulate a different value for backref case sensitivity except in JS envs that
      // support mode modifiers, but track this anyway
      ignoreCase,
    })];
  }
  const tokens = [];
  // Returns 1-3 matches; the first (only) might be octal
  const matches = value.match(/^[0-7]+|\d/g);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    // Octal digits are 0-7
    const charCode = (i === 0 && m !== '8' && m !== '9') ?
      parseInt(m, 8) :
      m.codePointAt(0);
    tokens.push(createToken(TokenTypes.Character, (i === 0 ? '\\' : '') + m, {
      charCode,
      ignoreCase: ignoreCase && !token.inCharClass && charHasCase(String.fromCodePoint(charCode)),
    }));
  }
  return tokens;
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
    case TokenTypes.Alternator:
    case TokenTypes.CharacterClassClose:
    case TokenTypes.CharacterClassIntersector:
    case TokenTypes.GroupClose:
      return base;
    case TokenTypes.Assertion:
    case TokenTypes.VariableLengthCharacterSet:
      return {
        ...base,
        kind: raw,
      };
    case TokenTypes.Backreference:
    case TokenTypes.Character:
    case TokenTypes.CharacterSet:
    case TokenTypes.Directive:
    case TokenTypes.EscapedNumber:
    case TokenTypes.GroupOpen:
    case TokenTypes.Subroutine:
      return {
        ...base,
        ...data,
      };
    case TokenTypes.CharacterClassHyphen:
      return {
        ...base,
        charCode: 45,
      };
    case TokenTypes.CharacterClassOpen:
      return {
        ...base,
        ...data,
        negate: raw[1] === '^',
      };
    case TokenTypes.Quantifier:
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
  return createToken(TokenTypes.Character, raw, {
    charCode: char.toUpperCase().codePointAt(0) - 64,
    // None of these have case so don't need to set `ignoreCase`
  });
}

function createTokenForShorthandCharClass(raw) {
  const lower = raw[1].toLowerCase();
  return createToken(TokenTypes.CharacterSet, raw, {
    kind: {
      'd': 'digit',
      'h': 'hex', // Not available in JS
      // Unlike JS, Onig `\s` matches only ASCII space, tab, LF, CR, VT, and FF
      's': 'space',
      'w': 'word',
    }[lower],
    negate: raw[1] !== lower,
  });
}

function createTokenForUnicodeProperty(raw) {
  const {p, neg, property} = /^\\(?<p>[pP])\{(?<neg>\^?)(?<property>[ \w]+)/.exec(raw).groups;
  const negate = (p === 'P' && !neg) || (p === 'p' && !!neg);
  return createToken(TokenTypes.CharacterSet, raw, {
    kind: 'property',
    negate,
    property,
    // Handling `ignoreCase` in JS envs without support for mode modifiers would require
    // heavyweight Unicode character data, and in any case it's rarely needed since most Unicode
    // properties that include cased chars either include all cases or are explicitly cased (ex:
    // `\p{Lowercase}`) so are unlikely to be intentionally adjusted by an `(?i)` modifier. Plus,
    // `\p{Lowercase}`, `\p{Uppercase}`, `\p{Lowercase_Letter}`, `\p{Uppercase_Letter}`, and their
    // aliases are given special-case support
    // TODO: Add `ignoreCase` prop to enable special-case support for `\p{Lowercase}`, etc.
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
  TokenCharacterSetKinds,
  TokenDirectiveKinds,
  TokenGroupKinds,
  TokenTypes,
};
