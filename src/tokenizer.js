import {OnigurumaPosixClasses} from './unicode.js';

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
  Subroutine: 'Subroutine',
  Quantifier: 'Quantifier',
  VariableLengthCharacterSet: 'VariableLengthCharacterSet',
  // Intermediate representation not included in results
  EscapedNumber: 'EscapedNumber',
};

const TokenCharacterSetKinds = {
  any: 'any',
  digit: 'digit',
  hex: 'hex',
  posix: 'posix',
  property: 'property',
  space: 'space',
  word: 'word',
};

const TokenDirectiveKinds = {
  keep: 'keep',
  flags: 'flags',
};

const TokenGroupKinds = {
  atomic: 'atomic',
  capturing: 'capturing',
  group: 'group',
  lookahead: 'lookahead',
  lookbehind: 'lookbehind',
};

const EscapeCharCodes = new Map([
  ['a', 7], // alert/bell (Not available in JS)
  ['b', 8], // backspace (only in character classes)
  ['e', 27], // escape (Not available in JS)
  ['f', 12], // form feed
  ['n', 10], // line feed
  ['r', 13], // carriage return
  ['t', 9], // horizontal tab
  ['v', 11], // vertical tab
]);

const controlCharPattern = 'c.? | C(?:-.?)?';
// Onig considers `\p` an identity escape, but e.g. `\p{`, `\p{ ^L}`, and `\p{gc=L}` are invalid
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
const charClassTokenRe = new RegExp(String.raw`
  \\ (?:
    ${controlCharPattern}
    | ${unicodePropertyPattern}
    | ${hexCharPattern}
    | ${escapedNumPattern}
    | .
  )
  | \[:[^:]*:\]
  | ${charClassOpenPattern}
  | &&
  | .
`.replace(/\s+/g, ''), 'gsu');

function tokenize(expression, flags = '') {
  if (!/^[imx]*$/.test(flags)) {
    throw new Error(`Unsupported Oniguruma flag "${flags}"; only imx supported`);
  }
  const context = {
    xStack: [flags.includes('x')],
    isXOn: () => context.xStack.at(-1),
    reuseLastOnXStack: () => context.xStack.push(context.xStack.at(-1)),
  };
  let tokens = [];
  let match;
  tokenRe.lastIndex = 0;
  while (match = tokenRe.exec(expression)) {
    const result = getTokenWithDetails(context, expression, match[0], tokenRe.lastIndex) ?? {};
    if (result.tokens) {
      tokens.push(...result.tokens);
    } else if (result.token) {
      tokens.push(result.token);
    }
    if (result.lastIndex !== undefined) {
      tokenRe.lastIndex = result.lastIndex;
    }
  }

  const potentialUnnamedCaptureTokens = [];
  let numNamedCaptures = 0;
  tokens.forEach(t => {
    if (t.type === TokenTypes.GroupOpen) {
      if (t.kind === TokenGroupKinds.capturing) {
        numNamedCaptures++;
        t.number = numNamedCaptures;
      } else if (t.raw === '(') {
        potentialUnnamedCaptureTokens.push(t);
      }
    }
  });
  // Enable unnamed capturing groups if no named captures
  if (!numNamedCaptures) {
    potentialUnnamedCaptureTokens.forEach((t, i) => {
      t.kind = TokenGroupKinds.capturing;
      t.number = i + 1;
    });
  }
  const numCaptures = numNamedCaptures || potentialUnnamedCaptureTokens.length;
  // Can now split escaped nums accurately, accounting for number of captures
  tokens = tokens.map(
    t => t.type === TokenTypes.EscapedNumber ? splitEscapedNumToken(t, numCaptures) : t
  ).flat();

  return {
    tokens,
    flags: {
      ignoreCase: flags.includes('i'),
      // Onig flag m is equivalent to JS flag s
      dotAll: flags.includes('m'),
      // Flag x already fully accounted for during tokenization (and flag x modifiers stripped)
      // Note: Flag x not supported by JS, and Onig uses different rules for it than `regex`
      extended: flags.includes('x'),
    },
  };
}

function getTokenWithDetails(context, expression, m, lastIndex) {
  const [m0, m1, m2] = m;
  if (m0 === '[') {
    const result = getAllTokensForCharClass(expression, m, lastIndex);
    return {
      // Array of all of the char class's tokens
      tokens: result.tokens,
      // Jump forward to the end of the char class
      lastIndex: result.lastIndex,
    };
  }
  if (m0 === '\\') {
    if ('AbBGzZ'.includes(m1)) {
      return {
        token: createToken(TokenTypes.Assertion, m, {
          kind: m,
        }),
      };
    }
    if (/^\\g[<']/.test(m)) {
      return {
        token: createToken(TokenTypes.Subroutine, m),
      };
    }
    if (/^\\k[<']/.test(m)) {
      return {
        token: createToken(TokenTypes.Backreference, m),
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
        token: createToken(TokenTypes.VariableLengthCharacterSet, m, {
          kind: m,
        }),
      };
    }
    // Run last since it assumes an identity escape as final condition
    return getTokenWithDetailsFromSharedEscape(m, {inCharClass: false});
  }
  if (m0 === '(') {
    // Unnamed capture if no named captures, else noncapturing group
    if (m === '(') {
      context.reuseLastOnXStack();
      const token = createToken(TokenTypes.GroupOpen, m, {
        // Will change to `capturing` and add `number` in a second pass if no named captures
        kind: TokenGroupKinds.group,
      });
      return {
        token,
      };
    }
    // Noncapturing group
    if (m === '(?:') {
      context.reuseLastOnXStack();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.group,
        }),
      };
    }
    // Atomic group
    if (m === '(?>') {
      context.reuseLastOnXStack();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.atomic,
        }),
      };
    }
    // Lookaround
    if (m === '(?=' || m === '(?!' || m === '(?<=' || m === '(?<!') {
      context.reuseLastOnXStack();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: m2 === '<' ? TokenGroupKinds.lookbehind : TokenGroupKinds.lookahead,
          negate: m.endsWith('!'),
        }),
      };
    }
    // Named capture (checked after lookbehind due to similar syntax)
    if (m2 === '<' || m2 === "'") {
      context.reuseLastOnXStack();
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.capturing,
          name: m.slice(3, -1),
          // Will add `number` in a second pass
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
    // Modifier/flag group (allows `-` without any flags modded)
    if ('-imx'.includes(m2)) {
      const token = createTokenForFlagGroup(m, context);
      if (!token) {
        return;
      }
      return {
        token,
      };
    }
    if (m === '(?') {
      throw new Error('Invalid group');
    }
    throw new Error(`Unexpected group "${m}"`);
  }
  if (m === ')') {
    context.xStack.pop();
    return {
      token: createToken(TokenTypes.GroupClose, m),
    };
  }
  if (m === '#' && context.isXOn()) {
    // Onig's only line break char is line feed
    const end = expression.indexOf('\n', lastIndex);
    return {
      // Jump forward to the end of the comment
      lastIndex: end === -1 ? expression.length : end,
    };
  }
  if (/^\s$/.test(m) && context.isXOn()) {
    return;
  }
  if (m === '.') {
    return {
      token: createToken(TokenTypes.CharacterSet, m, {
        kind: TokenCharacterSetKinds.any,
      }),
    };
  }
  if (m === '^' || m === '$') {
    return {
      token: createToken(TokenTypes.Assertion, m, {
        kind: m,
      }),
    };
  }
  if (m === '|') {
    return {
      token: createToken(TokenTypes.Alternator, m),
    };
  }
  if (quantifierRe.test(m)) {
    return {
      token: createTokenForQuantifier(m),
    };
  }
  assertSingleChar(m);
  return {
    token: createToken(TokenTypes.Character, m, {
      value: m.codePointAt(0),
    }),
  };
}

function getAllTokensForCharClass(expression, opener, lastIndex) {
  assertNonEmptyCharClass(opener);
  const tokens = [createToken(TokenTypes.CharacterClassOpen, opener, {
    negate: opener[1] === '^',
  })];
  let numCharClassesOpen = 1;
  let match;
  charClassTokenRe.lastIndex = lastIndex;
  while (match = charClassTokenRe.exec(expression)) {
    const m = match[0];
    // POSIX classes are handled as a single token, not a nested char class
    if (m[0] === '[' && m[1] !== ':') {
      assertNonEmptyCharClass(m);
      numCharClassesOpen++;
      tokens.push(createToken(TokenTypes.CharacterClassOpen, m, {
        negate: m[1] === '^',
      }));
    } else if (m === ']') {
      numCharClassesOpen--;
      tokens.push(createToken(TokenTypes.CharacterClassClose, m));
      if (!numCharClassesOpen) {
        break;
      }
    } else {
      tokens.push(getCharClassTokenWithDetails(m).token);
    }
  }
  return {
    tokens,
    lastIndex: charClassTokenRe.lastIndex || expression.length,
  }
}

// TODO: Return the token directly, rather than as a `token` prop (and remove 'WithDetails')
function getCharClassTokenWithDetails(m) {
  if (m[0] === '\\') {
    // Assumes an identity escape as final condition
    return getTokenWithDetailsFromSharedEscape(m, {inCharClass: true});
  }
  // POSIX class: `[:name:]` or `[:^name:]`
  if (m[0] === '[') {
    const posix = /\[:(?<negate>\^?)(?<name>[a-z]+):\]/.exec(m);
    if (!posix || !OnigurumaPosixClasses[posix.groups.name]) {
      throw new Error(`Invalid POSIX class type "${m}"`);
    }
    return {
      token: createToken(TokenTypes.CharacterSet, m, {
        kind: TokenCharacterSetKinds.posix,
        negate: !!posix.groups.negate,
        property: posix.groups.name,
      }),
    };
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
    token: createToken(TokenTypes.Character, m, {
      value: m.codePointAt(0),
    }),
  };
}

// Tokens shared by base syntax and char class syntax that start with `\`
// TODO: Return the token directly, rather than as a `token` prop (and remove 'WithDetails')
function getTokenWithDetailsFromSharedEscape(m, {inCharClass}) {
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
      token: createTokenForUnicodeProperty(m),
    };
  }
  if ('ux'.includes(m1)) {
    return {
      token: createToken(TokenTypes.Character, m, {
        value: getValidatedUnicodeCharCode(m),
      }),
    };
  }
  if (EscapeCharCodes.has(m1)) {
    return {
      token: createToken(TokenTypes.Character, m, {
        value: EscapeCharCodes.get(m1),
      }),
    };
  }
  // Escaped number: backref (possibly invalid), null, octal, or identity escape, possibly followed
  // by 1-2 literal digits
  if (!isNaN(m1)) {
    return {
      token: createToken(TokenTypes.EscapedNumber, m, {
        inCharClass,
      }),
    };
  }
  if (m === '\\') {
    throw new Error('Incomplete escape "\\"');
  }
  // Meta char `\M-x` and `\M-\C-x` are unsupported for now; avoid treating as an identity escape
  if (m1 === 'M') {
    throw new Error(`Unsupported escape "${m}"`);
  }
  // Identity escape
  if (m.length === 2) {
    return {
      token: createToken(TokenTypes.Character, m, {
        value: m.codePointAt(1),
      }),
    };
  }
  throw new Error(`Unexpected escape "${m}"`);
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

function createToken(type, raw, data = {}) {
  return {
    type,
    raw,
    ...data,
  };
}

// Expects `\cx` or `\C-x`
function createTokenForControlChar(raw) {
  const char = raw[1] === 'c' ? raw[2] : raw[3];
  if (!char || !/[a-zA-Z]/.test(char)) {
    // Unlike JS, Onig allows any char to follow `\c` (with special conversion rules), but this is
    // an extreme edge case so it's unsupported for now
    throw new Error(`Unsupported control character "${raw}"`);
  }
  return createToken(TokenTypes.Character, raw, {
    value: char.toUpperCase().codePointAt(0) - 64,
  });
}

function createTokenForFlagGroup(raw, context) {
  let {on, off} = /^\(\?(?<on>[imx]*)(?:-(?<off>[imx\-]*))?/.exec(raw).groups;
  off ??= '';
  // Flag x is used directly by the tokenizer; other flag modifiers are included in tokens
  const isXOn = (context.isXOn() || on.includes('x')) && !off.includes('x');
  const enabledFlags = getFlagPropsForToken(on);
  const disabledFlags = getFlagPropsForToken(off);
  const flagChanges = {};
  enabledFlags && (flagChanges.enable = enabledFlags);
  disabledFlags && (flagChanges.disable = disabledFlags);
  // Standalone flags modifier; ex: `(?im-x)`
  if (raw.endsWith(')')) {
    // Replace value until the end of the current group
    context.xStack[context.xStack.length - 1] = isXOn;
    if (enabledFlags || disabledFlags) {
      return createToken(TokenTypes.Directive, raw, {
        kind: TokenDirectiveKinds.flags,
        flags: flagChanges,
      });
    }
    return;
  }
  // Modifier/flag group opener; ex: `(?im-x:`
  if (raw.endsWith(':')) {
    context.xStack.push(isXOn);
    const token = createToken(TokenTypes.GroupOpen, raw, {
      kind: TokenGroupKinds.group,
    });
    if (enabledFlags || disabledFlags) {
      token.flags = flagChanges;
    }
    return token;
  }
  throw new Error(`Unexpected flag group "${raw}"`);
}

function createTokenForQuantifier(raw) {
  const data = {};
  if (raw[0] === '{') {
    const {min, max} = /^\{(?<min>\d+)(?:,(?<max>\d*))?/.exec(raw).groups;
    data.min = +min;
    data.max = max === undefined ? +min : (max === '' ? Infinity : +max);
    data.greedy = !raw.endsWith('?');
    // By default, Onig doesn't support making interval quantifiers possessive
    data.possessive = false;
  } else {
    data.min = raw[0] === '+' ? 1 : 0;
    data.max = raw[0] === '?' ? 1 : Infinity;
    data.greedy = raw[1] !== '?';
    data.possessive = raw[1] === '+';
  }
  return createToken(TokenTypes.Quantifier, raw, data);
}

function createTokenForShorthandCharClass(raw) {
  const lower = raw[1].toLowerCase();
  return createToken(TokenTypes.CharacterSet, raw, {
    kind: {
      'd': TokenCharacterSetKinds.digit,
      'h': TokenCharacterSetKinds.hex, // Not available in JS
      's': TokenCharacterSetKinds.space, // Different than JS
      'w': TokenCharacterSetKinds.word,
    }[lower],
    negate: raw[1] !== lower,
  });
}

function createTokenForUnicodeProperty(raw) {
  const {p, neg, property} = /^\\(?<p>[pP])\{(?<neg>\^?)(?<property>[ \w]+)/.exec(raw).groups;
  const negate = (p === 'P' && !neg) || (p === 'p' && !!neg);
  return createToken(TokenTypes.CharacterSet, raw, {
    kind: TokenCharacterSetKinds.property,
    negate,
    property,
  });
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

function getFlagPropsForToken(flags) {
  // Don't include flag x (`extended`) since it's handled by the tokenizer
  // Don't include `false` for flags that aren't included
  const obj = {};
  if (flags.includes('i')) {
    obj.ignoreCase = true;
  }
  if (flags.includes('m')) {
    // Onig flag m is equivalent to JS flag s
    obj.dotAll = true;
  }
  return Object.keys(obj).length ? obj : null;
}

// Value is 1-3 digits, which can be a backref (possibly invalid), null, octal, or identity escape,
// possibly followed by 1-2 literal digits
function splitEscapedNumToken(token, numCaptures) {
  const {raw, inCharClass} = token;
  // Keep any leading 0s since they indicate octal
  const value = raw.slice(1);
  // Backref (possibly invalid)
  if (
    !inCharClass &&
    ( // Single digit 1-9 outside a char class is always treated as a backref
      (value !== '0' && value.length === 1) ||
      // Leading 0 makes it octal; backrefs can't include following literal digits
      (value[0] !== '0' && +value <= numCaptures)
    )
  ) {
    return [createToken(TokenTypes.Backreference, raw)];
  }
  const tokens = [];
  // Returns 1-3 matches; the first (only) might be octal
  const matches = value.match(/^[0-7]+|\d/g);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    // Octal digits are 0-7
    const value = (i === 0 && m !== '8' && m !== '9') ?
      parseInt(m, 8) :
      m.codePointAt(0);
    tokens.push(createToken(TokenTypes.Character, (i === 0 ? '\\' : '') + m, {
      value,
    }));
  }
  return tokens;
}

export {
  tokenize,
  TokenCharacterSetKinds,
  TokenDirectiveKinds,
  TokenGroupKinds,
  TokenTypes,
};
