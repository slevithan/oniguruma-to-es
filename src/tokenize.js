import {PosixClasses} from './unicode.js';
import {r} from './utils.js';

const TokenTypes = /** @type {const} */ ({
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
  // These aren't allowed in char classes, so they aren't equivalent to JS's `[\q{}]`
  VariableLengthCharacterSet: 'VariableLengthCharacterSet',
  // Intermediate representation not included in results
  EscapedNumber: 'EscapedNumber',
});

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
  ['a',  7], // alert/bell (Not available in JS)
  ['b',  8], // backspace (only in char classes)
  ['e', 27], // escape (Not available in JS)
  ['f', 12], // form feed
  ['n', 10], // line feed
  ['r', 13], // carriage return
  ['t',  9], // horizontal tab
  ['v', 11], // vertical tab
]);

const controlCharPattern = 'c.? | C(?:-.?)?';
// Onig considers `\p` an identity escape, but e.g. `\p{`, `\p{ ^L}`, and `\p{gc=L}` are invalid
const unicodePropertyPattern = r`[pP]\{(?:\^?[\x20\w]+\})?`;
const hexCharPattern = r`u\{[^\}]*\}? | u\p{AHex}{0,4} | x\p{AHex}{0,2}`;
const escapedNumPattern = r`\d{1,3}`;
const charClassOpenPattern = r`\[\^?\]?`;
// Even with flag x, Onig doesn't allow whitespace to separate a quantifier from the `?` or `+`
// that makes it lazy or possessive
const quantifierRe = /[?*+][?+]?|\{\d+(?:,\d*)?\}\??/;
const tokenRe = new RegExp(r`
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
const charClassTokenRe = new RegExp(r`
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

/**
@typedef {'i' | ''} FlagI
@typedef {'m' | ''} FlagM
@typedef {'x' | ''} FlagX
@typedef {`${FlagI}${FlagM}${FlagX}` | `${FlagI}${FlagX}${FlagM}` | `${FlagM}${FlagI}${FlagX}` | `${FlagM}${FlagX}${FlagI}` | `${FlagX}${FlagI}${FlagM}` | `${FlagX}${FlagM}${FlagI}`} OnigurumaFlags
@typedef {{
  type: keyof TokenTypes;
  raw: string;
  [key: string]: string | number | boolean;
}} Token
@typedef {{
  tokens: Array<Token>;
  flags: {
    dotAll: boolean;
    extended: boolean;
    ignoreCase: boolean;
  };
}} TokenizerResult
*/
/**
@param {string} pattern
@param {OnigurumaFlags} [flags] Oniguruma flags. Flag m is equivalent to JS's flag s.
@returns {TokenizerResult}
*/
function tokenize(pattern, flags = '') {
  if (!/^[imx]*$/.test(flags)) {
    throw new Error(`Flags "${flags}" unsupported in Oniguruma`);
  }
  const xStack = [flags.includes('x')];
  const context = {
    getCurrentModX: () => xStack.at(-1),
    popModX() {xStack.pop()},
    pushModX(isXOn) {xStack.push(isXOn)},
    replaceCurrentModX(isXOn) {xStack[xStack.length - 1] = isXOn},
  };
  let tokens = [];
  let match;
  tokenRe.lastIndex = 0;
  while (match = tokenRe.exec(pattern)) {
    const result = getTokenWithDetails(context, pattern, match[0], tokenRe.lastIndex) ?? {};
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
      // Note: Flag x is fully handled during tokenization (and flag x modifiers are stripped)
      extended: flags.includes('x'),
    },
  };
}

function getTokenWithDetails(context, pattern, m, lastIndex) {
  const [m0, m1, m2] = m;
  if (m0 === '[') {
    const result = getAllTokensForCharClass(pattern, m, lastIndex);
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
    return {
      token: createTokenForSharedEscape(m, {inCharClass: false}),
    };
  }
  if (m0 === '(') {
    // Comment group
    if (m2 === '#') {
      if (!m.endsWith(')')) {
        throw new Error('Unclosed comment group "(?#"');
      }
      return;
    }
    // Modifier/flag group (allows solo `-`)
    if ('-imx'.includes(m2)) {
      const token = createTokenForFlagGroup(m, context);
      if (!token) {
        return;
      }
      return {
        token,
      };
    }
    // Remaining group types all reuse current flag x status; it can be altered by flag directives
    context.pushModX(context.getCurrentModX());
    if (
      // Unnamed capture if no named captures, else noncapturing group
      m === '(' ||
      // Noncapturing group
      m === '(?:'
    ) {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          // For `(`, will later change to `capturing` and add `number` prop if no named captures
          kind: TokenGroupKinds.group,
        }),
      };
    }
    // Atomic group
    if (m === '(?>') {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.atomic,
        }),
      };
    }
    // Lookaround
    if (m === '(?=' || m === '(?!' || m === '(?<=' || m === '(?<!') {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: m2 === '<' ? TokenGroupKinds.lookbehind : TokenGroupKinds.lookahead,
          negate: m.endsWith('!'),
        }),
      };
    }
    // Named capture (checked after lookbehind due to similar syntax)
    if (m2 === '<' || m2 === "'") {
      return {
        token: createToken(TokenTypes.GroupOpen, m, {
          kind: TokenGroupKinds.capturing,
          name: m.slice(3, -1),
          // Will add `number` in a second pass
        }),
      }
    }
    if (m === '(?') {
      throw new Error('Invalid group');
    }
    throw new Error(`Unexpected group "${m}"`);
  }
  if (m === ')') {
    context.popModX();
    return {
      token: createToken(TokenTypes.GroupClose, m),
    };
  }
  if (m === '#' && context.getCurrentModX()) {
    // Onig's only line break char is line feed
    const end = pattern.indexOf('\n', lastIndex);
    return {
      // Jump forward to the end of the comment
      lastIndex: end === -1 ? pattern.length : end,
    };
  }
  if (/^\s$/.test(m) && context.getCurrentModX()) {
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
  assertSingleCodePoint(m);
  return {
    token: createToken(TokenTypes.Character, m, {
      value: m.codePointAt(0),
    }),
  };
}

function getAllTokensForCharClass(pattern, opener, lastIndex) {
  assertNonEmptyCharClass(opener);
  const tokens = [createToken(TokenTypes.CharacterClassOpen, opener, {
    negate: opener[1] === '^',
  })];
  let numCharClassesOpen = 1;
  let match;
  charClassTokenRe.lastIndex = lastIndex;
  while (match = charClassTokenRe.exec(pattern)) {
    const m = match[0];
    // Start of nested char class
    // POSIX classes are handled as a single token; not as a nested char class
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
      tokens.push(createTokenForAnyTokenWithinCharClass(m));
    }
  }
  return {
    tokens,
    lastIndex: charClassTokenRe.lastIndex || pattern.length,
  }
}

function createTokenForAnyTokenWithinCharClass(raw) {
  if (raw[0] === '\\') {
    // Assumes an identity escape as final condition
    return createTokenForSharedEscape(raw, {inCharClass: true});
  }
  // POSIX class: `[:name:]` or `[:^name:]`
  if (raw[0] === '[') {
    const posix = /\[:(?<negate>\^?)(?<name>[a-z]+):\]/.exec(raw);
    if (!posix || !PosixClasses[posix.groups.name]) {
      throw new Error(`Invalid POSIX class type "${raw}"`);
    }
    return createToken(TokenTypes.CharacterSet, raw, {
      kind: TokenCharacterSetKinds.posix,
      negate: !!posix.groups.negate,
      value: posix.groups.name,
    });
  }
  // Range (possibly invalid) or literal hyphen
  if (raw === '-') {
    return createToken(TokenTypes.CharacterClassHyphen, raw);
  }
  if (raw === '&&') {
    return createToken(TokenTypes.CharacterClassIntersector, raw);
  }
  assertSingleCodePoint(raw);
  return createToken(TokenTypes.Character, raw, {
    value: raw.codePointAt(0),
  });
}

// Tokens shared by base syntax and char class syntax that start with `\`
function createTokenForSharedEscape(raw, {inCharClass}) {
  const char1 = raw[1];
  if (char1 === 'c' || char1 === 'C') {
    return createTokenForControlChar(raw);
  }
  if ('dDhHsSwW'.includes(char1)) {
    return createTokenForShorthandCharClass(raw);
  }
  if (/^\\[pP]\{/.test(raw)) {
    if (raw.length === 3) {
      throw new Error('Incomplete or invalid Unicode property');
    }
    return createTokenForUnicodeProperty(raw);
  }
  if (char1 === 'u' || char1 === 'x') {
    return createToken(TokenTypes.Character, raw, {
      value: getValidatedUnicodeCharCode(raw),
    });
  }
  if (EscapeCharCodes.has(char1)) {
    return createToken(TokenTypes.Character, raw, {
      value: EscapeCharCodes.get(char1),
    });
  }
  // Escaped number: backref (possibly invalid), null, octal, or identity escape, possibly followed
  // by 1-2 literal digits
  if (!isNaN(char1)) {
    return createToken(TokenTypes.EscapedNumber, raw, {
      inCharClass,
    });
  }
  if (raw === '\\') {
    throw new Error(r`Incomplete escape "\"`);
  }
  // Meta `\M-x` and meta control char `\M-\C-x` are unsupported; avoid treating as an identity escape
  if (char1 === 'M') {
    // [TODO] This can be supported fairly easily
    throw new Error(`Unsupported meta escape "${raw}"`);
  }
  // Identity escape
  // TODO: Should this count code point length instead?
  if (raw.length === 2) {
    return createToken(TokenTypes.Character, raw, {
      value: raw.codePointAt(1),
    });
  }
  throw new Error(`Unexpected escape "${raw}"`);
}

/**
@param {keyof TokenTypes} type
@param {string} raw
@param {{[key: string]: string | number | boolean;}} [data]
@returns {Token}
*/
function createToken(type, raw, data) {
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
    // an extreme edge case
    // [TODO] This can be supported fairly easily
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
  const isXOn = (context.getCurrentModX() || on.includes('x')) && !off.includes('x');
  const enabledFlags = getFlagPropsForToken(on);
  const disabledFlags = getFlagPropsForToken(off);
  const flagChanges = {};
  enabledFlags && (flagChanges.enable = enabledFlags);
  disabledFlags && (flagChanges.disable = disabledFlags);
  // Standalone flags modifier; ex: `(?im-x)`
  if (raw.endsWith(')')) {
    // Replace value until the end of the current group
    context.replaceCurrentModX(isXOn);
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
    context.pushModX(isXOn);
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
  const {p, neg, value} = /^\\(?<p>[pP])\{(?<neg>\^?)(?<value>[ \w]+)/.exec(raw).groups;
  const negate = (p === 'P' && !neg) || (p === 'p' && !!neg);
  return createToken(TokenTypes.CharacterSet, raw, {
    kind: TokenCharacterSetKinds.property,
    negate,
    value,
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
  const dec = parseInt(hex, 16);
  if (dec > 0x10FFFF) {
    throw new Error(`Invalid escape out of range "${raw}"`);
  }
  return dec;
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

function assertNonEmptyCharClass(raw) {
  if (raw.endsWith(']')) {
    throw new Error(`Empty char class "${raw}" unsupported in Oniguruma`);
  }
}

function assertSingleCodePoint(raw) {
  if ([...raw].length !== 1) {
    throw new Error(`Expected match "${raw}" to be a single code point`);
  }
}

export {
  tokenize,
  TokenCharacterSetKinds,
  TokenDirectiveKinds,
  TokenGroupKinds,
  TokenTypes,
};
