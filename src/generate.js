import {getOptions} from './compile.js';
import emojiRegex from 'emoji-regex-xs';
import {AstCharacterSetKinds, AstTypes, AstVariableLengthCharacterSetKinds} from './parse.js';
import {traverse} from './traverse.js';
import {getIgnoreCaseMatchChars, UnicodePropertiesWithCase} from './unicode.js';
import {r, Target, TargetNum} from './utils.js';

/**
Generates a `regex`-compatible `pattern`, `flags`, and `options` from a `regex` AST.
@param {import('./transform.js').RegexAst} ast
@param {import('./compile.js').CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
  options: Object;
}}
*/
function generate(ast, options) {
  const opts = getOptions(options);
  const minTargetES2024 = TargetNum[opts.target] >= TargetNum[Target.ES2024];
  const minTargetESNext = opts.target === Target.ESNext;
  const rDepth = opts.maxRecursionDepth;
  if (rDepth !== null && (!Number.isInteger(rDepth) || rDepth < 2 || rDepth > 100)) {
    throw new Error('Invalid maxRecursionDepth; use null or 2-100');
  }

  // If the output can't use flag groups, we need a pre-pass to check for the use of chars with
  // case in case sensitive/insensitive states. This minimizes the need for case expansions (though
  // expansions are lossless, even given Unicode case complexities) and allows supporting case
  // insensitive backrefs in more cases
  // [TODO] Consider gathering this data in the transformer's final traversal to avoid work here
  let hasCaseInsensitiveNode = null;
  let hasCaseSensitiveNode = null;
  if (!minTargetESNext) {
    const iStack = [ast.flags.ignoreCase];
    traverse({node: ast}, {
      getCurrentModI: () => iStack.at(-1),
      popModI() {iStack.pop()},
      pushModI(isIOn) {iStack.push(isIOn)},
      setHasCasedChar() {
        if (iStack.at(-1)) {
          hasCaseInsensitiveNode = true;
        } else {
          hasCaseSensitiveNode = true;
        }
      },
    }, FlagModifierVisitor);
  }

  const appliedGlobalFlags = {
    dotAll: ast.flags.dotAll,
    // - Turn global flag i on if a case insensitive node was used and no case sensitive nodes were
    //   used (to avoid unnecessary node expansion).
    // - Turn global flag i off if a case sensitive node was used (since case sensitivity can't be
    //   forced without the use of ESNext flag groups)
    ignoreCase: !!((ast.flags.ignoreCase || hasCaseInsensitiveNode) && !hasCaseSensitiveNode),
  };
  let lastNode = null;
  const state = {
    allowBestEffort: opts.allowBestEffort,
    appliedGlobalFlags,
    currentFlags: {
      dotAll: ast.flags.dotAll,
      ignoreCase: ast.flags.ignoreCase,
    },
    groupNames: new Set(), // TODO: Use
    inCharClass: false,
    lastNode,
    maxRecursionDepth: rDepth,
    useAppliedIgnoreCase: !!(!minTargetESNext && hasCaseInsensitiveNode && hasCaseSensitiveNode),
    useDuplicateNames: minTargetESNext,
    useFlagMods: minTargetESNext,
    useFlagV: minTargetES2024,
  };
  function gen(node) {
    state.lastNode = lastNode;
    lastNode = node;
    switch (node.type) {
      case AstTypes.Regex:
        // Final result is an object; other node types return strings
        return {
          pattern: gen(node.pattern),
          flags: gen(node.flags),
          options: {...node.options},
        };
      case AstTypes.Alternative:
        return node.elements.map(gen).join('');
      case AstTypes.Assertion:
        // TODO: Set `currentFlags` if lookaround
        return ''; // TODO
      case AstTypes.Backreference:
        return genBackreference(node, state);
      case AstTypes.CapturingGroup:
        // TODO: Strip duplicate names if `!state.useDuplicateNames`
        // TODO: Set `currentFlags`
        return ''; // TODO
      case AstTypes.Character:
        return genCharacter(node, state);
      case AstTypes.CharacterClass: {
        if (
          (!state.useFlagV || opts.optimize) &&
          node.parent.type === AstTypes.CharacterClass &&
          !node.negate &&
          node.elements[0].type !== AstTypes.CharacterClassIntersection
        ) {
          // Remove unnecessary nesting; unwrap kids into the parent char class. The parser has
          // already done some basic char class optimization; this is primarily about allowing many
          // nested classes to work with `target` ES2018 (which doesn't support nesting)
          return node.elements.map(gen).join('');
        }
        if (!state.useFlagV && node.parent.type === AstTypes.CharacterClass) {
          throw new Error('Use of nested class requires target ES2024 or later');
        }
        state.inCharClass = true;
        const result = `[${node.negate ? '^' : ''}${node.elements.map(gen).join('')}]`;
        state.inCharClass = false;
        return result;
      }
      case AstTypes.CharacterClassIntersection:
        if (!state.useFlagV) {
          throw new Error('Use of class intersection requires target ES2024 or later');
        }
        return node.classes.map(gen).join('&&');
      case AstTypes.CharacterClassRange:
        // Create the range without calling `gen` on the kids
        return genCharacterClassRange(node, state);
      case AstTypes.CharacterSet:
        return genCharacterSet(node, state);
      case AstTypes.Flags:
        return genFlags(node, state);
      case AstTypes.Group: {
        const currentFlags = state.currentFlags;
        if (node.flags) {
          state.currentFlags = getNewCurrentFlags(currentFlags, node.flags);
        }
        const result = `(?${getGroupPrefix(node.atomic, node.flags, state.useFlagMods)}${
          node.alternatives.map(gen).join('|')
        })`;
        state.currentFlags = currentFlags;
        return result;
      }
      case AstTypes.Pattern:
        return node.alternatives.map(gen).join('|');
      case AstTypes.Quantifier:
        return gen(node.element) + getQuantifierStr(node);
      case AstTypes.Recursion:
        return genRecursion(node, state);
      case AstTypes.VariableLengthCharacterSet:
        // Technically, `VariableLengthCharacterSet` nodes shouldn't be included in transformer
        // output since none of its kinds are directly supported by `regex`, but `kind: 'grapheme'`
        // (only) is allowed through so we can check options `allowBestEffort` and `target` here
        // TODO: Handle in transformer and give it new `allowBestEffort`/`bestEffortTarget` options; will also need for ES2018 posix graph/print
        return genVariableLengthCharacterSet(node, state);
      default:
        // Note: Node types `Directive` and `Subroutine` are never included in transformer output
        throw new Error(`Unexpected node type "${node.type}"`);
    }
  }

  const result = gen(ast);
  // By default, `regex` implicitly chooses flag u or v; control it instead
  if (!minTargetES2024) {
    delete result.options.force.v;
    result.options.disable.v = true;
    result.options.unicodeSetsPlugin = null;
  }
  return result;
}

const FlagModifierVisitor = {
  AnyGroup: {
    enter({node}, state) {
      const currentModI = state.getCurrentModI();
      state.pushModI(
        node.flags ?
          getNewCurrentFlags({ignoreCase: currentModI}, node.flags).ignoreCase :
          currentModI
      );
    },
    exit(_, state) {
      state.popModI();
    },
  },
  Backreference(_, state) {
    // Can't know for sure, so assume the backref will include chars with case
    state.setHasCasedChar();
  },
  Character({node}, state) {
    if (charHasCase(String.fromCodePoint(node.value))) {
      state.setHasCasedChar();
    }
  },
  CharacterClassRange({node, skip}, state) {
    skip();
    if (getCasesOutsideCharClassRange(node, {firstOnly: true}).length) {
      state.setHasCasedChar();
    }
  },
  CharacterSet({node}, state) {
    if (node.kind === AstCharacterSetKinds.property && UnicodePropertiesWithCase.has(node.value)) {
      state.setHasCasedChar();
    }
  },
};

const BaseEscapeChars = new Set([
  '$', '(', ')', '*', '+', '.', '?', '[', '\\', ']', '^', '{', '|', '}',
]);
const CharClassEscapeChars = new Set([
  '-', '\\', ']', '^',
]);
const CharClassEscapeCharsFlagV = new Set([
  '(', ')', '-', '/', '[', '\\', ']', '^', '{', '|', '}',
  // Double punctuators; also includes already-listed `-` and `^`
  '!', '#', '$', '%', '&', '*', '+', ',', '.', ':', ';', '<', '=', '>', '?', '@', '`', '~',
]);
const CharCodeEscapeMap = new Map([
  [ 9, r`\t`], // horizontal tab
  [10, r`\n`], // line feed
  [11, r`\v`], // vertical tab
  [12, r`\f`], // form feed
  [13, r`\r`], // carriage return
]);

const casedRe = /^\p{Cased}$/u;
function charHasCase(char) {
  return casedRe.test(char);
}

function genBackreference({ref}, state) {
  // TODO: Throw if `!state.useFlagMods`, `!state.allowBestEffort`, and within mixed local ignoreCase
  if (typeof ref !== 'number') {
    // The transformer always converts to numbered backrefs; no `ref` names
    throw new Error('Unexpected named backref in AST');
  }
  return '\\' + ref;
}

function genCharacter({value}, state) {
  const char = String.fromCodePoint(value);
  const escaped = getEscapedChar(value, {
    isAfterBackref: state.lastNode.type === AstTypes.Backreference,
    inCharClass: state.inCharClass,
    useFlagV: state.useFlagV,
  });
  if (escaped !== char) {
    return escaped;
  }
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase && charHasCase(char)) {
    const cases = getIgnoreCaseMatchChars(char);
    return state.inCharClass ?
      cases.join('') :
      (cases.length > 1 ? `[${cases.join('')}]` : cases[0]);
  }
  return char;
}

function genCharacterClassRange(node, state) {
  const min = node.min.value;
  const max = node.max.value;
  const escOpts = {
    isAfterBackref: false,
    inCharClass: true,
    useFlagV: state.useFlagV,
  };
  const minStr = getEscapedChar(min, escOpts);
  const maxStr = getEscapedChar(max, escOpts);
  let extraChars = '';
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase) {
    // [TODO] Avoid duplication by considering other chars in the parent char class when expanding
    const charsOutsideRange = getCasesOutsideCharClassRange(node);
    const ranges = getCodePointRangesFromChars(charsOutsideRange);
    ranges.forEach(value => {
      extraChars += Array.isArray(value) ?
        `${getEscapedChar(value[0], escOpts)}-${getEscapedChar(value[1], escOpts)}` :
        getEscapedChar(value, escOpts);
    });
  }
  // TODO: Is adding directly after the range OK when part of an intersection?
  return `${minStr}-${maxStr}${extraChars}`;
}

function genCharacterSet({kind, negate, value, key}, state) {
  if (kind === AstCharacterSetKinds.any) {
    return state.currentFlags.dotAll ?
      ((state.appliedGlobalFlags.dotAll || state.useFlagMods) ? '.' : '[^]') :
      // Onig's only line break char is line feed, unlike JS
      r`[^\n]`;
  }
  if (kind === AstCharacterSetKinds.digit) {
    return negate ? r`\D` : r`\d`;
  }
  if (kind === AstCharacterSetKinds.property) {
    // TODO: Use `useAppliedIgnoreCase` for `UnicodePropertiesWithCase.has`
    // Special case `\p{Any}` to `[^]` since it's shorter but also because `\p{Any}` is used when
    // parsing fragments in the transformer (since the parser follows Onig rules and doesn't allow
    // empty char classes)
    if (value === 'Any') {
      return '[^]';
    }
    return `${(negate ? r`\P` : r`\p`)}{${key ? `${key}=` : ''}${value}}`;
  }
  if (kind === AstCharacterSetKinds.word) {
    return negate ? r`\W` : r`\w`;
  }
  // Kinds `hex`, `posix`, and `space` are never included in transformer output
  throw new Error(`Unexpected character set kind "${kind}"`);
}

function genFlags(node, state) {
  return (
    (node.hasIndices ? 'd' : '') +
    (node.global ? 'g' : '') +
    (state.appliedGlobalFlags.ignoreCase ? 'i' : '') +
    (node.multiline ? 'm' : '') +
    (node.dotAll ? 's' : '') +
    (node.sticky ? 'y' : '')
    // Note: `regex` doesn't allow explicitly adding flags it handles implicitly, so there are no
    // `unicode` (flag u) or `unicodeSets` (flag v) props; those flags are added separately
  );
}

function genRecursion({ref}, state) {
  const rDepth = state.maxRecursionDepth;
  if (!rDepth) {
    throw new Error('Use of recursion disabled');
  }
  if (!state.allowBestEffort) {
    throw new Error('Use of recursion requires option allowBestEffort');
  }
  return ref === 0 ? `(?R=${rDepth})` : r`\g<${ref}&R=${rDepth}>`;
}

function genVariableLengthCharacterSet({kind}, state) {
  if (kind !== AstVariableLengthCharacterSetKinds.grapheme) {
    throw new Error(`Unexpected varcharset kind "${kind}"`);
  }
  if (!state.allowBestEffort) {
    throw new Error(r`Use of "\X" requires option allowBestEffort`);
  }
  // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows overqualified and
  // underqualified emoji using a general pattern that matches all Unicode sequences that follow
  // the structure of valid emoji. That actually makes it more accurate for matching any grapheme
  const emojiGrapheme = state.useFlagV ? r`\p{RGI_Emoji}` : emojiRegex().source;
  // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>
  return r`(?>\r\n|${emojiGrapheme}|\P{M}\p{M}*)`;
}

/**
Given a `CharacterClassRange` node, returns an array of chars that are a case variant of a char in
the range, and aren't already in the range.
*/
function getCasesOutsideCharClassRange(node, {firstOnly} = {}) {
  const min = node.min.value;
  const max = node.max.value;
  const found = [];
  // Avoid unneeded work. Assumptions (per Unicode 16):
  // - No case variants cross the Basic Multilingual Plane boundary
  // - No cased chars appear beyond the Supplementary Multilingual Plane
  if ((min < 65 && (max === 0xFFFF || max >= 0x1FFFF)) || (min === 0x10000 && max >= 0x1FFFF)) {
    return found;
  }
  for (let i = min; i <= max; i++) {
    const char = String.fromCodePoint(i);
    if (!charHasCase(char)) {
      continue;
    }
    const charsOutsideRange = getIgnoreCaseMatchChars(char).filter(caseOfChar => {
      const num = caseOfChar.codePointAt(0);
      return num < min || num > max;
    });
    if (charsOutsideRange.length) {
      found.push(...charsOutsideRange);
      if (firstOnly) {
        break;
      }
    }
  }
  return found;
}

function getCodePointRangesFromChars(chars) {
  const codePoints = chars.map(char => char.codePointAt(0)).sort((a, b) => a - b);
  const values = [];
  let start = null;
  for (let i = 0; i < codePoints.length; i++) {
    if (codePoints[i + 1] === codePoints[i] + 1) {
      start ??= codePoints[i];
    } else if (start === null) {
      values.push(codePoints[i]);
    } else {
      values.push([start, codePoints[i]]);
      start = null;
    }
  }
  return values;
}

function getEscapedChar(codePoint, {isAfterBackref, inCharClass, useFlagV}) {
  if (CharCodeEscapeMap.has(codePoint)) {
    return CharCodeEscapeMap.get(codePoint);
  }
  if (
    // Control chars, etc.; condition modeled on the Chrome developer console's display for strings
    codePoint < 32 || (codePoint > 126 && codePoint < 160) ||
    // Avoid corrupting a preceding backref by immediately following it with a literal digit
    (isAfterBackref && isDigitCharCode(codePoint))
  ) {
    // Don't convert codePoint `0` to `\0` since that's corruptible by following literal digits
    return r`\x${codePoint.toString(16).padStart(2, '0')}`;
  }
  const escapeChars = inCharClass ?
    (useFlagV ? CharClassEscapeCharsFlagV : CharClassEscapeChars) :
    BaseEscapeChars;
  const char = String.fromCodePoint(codePoint);
  return (escapeChars.has(char) ? '\\' : '') + char;
}

function getGroupPrefix(atomic, flagMods, useFlagMods) {
  if (atomic) {
    return '>';
  }
  let mods = '';
  if (flagMods && useFlagMods) {
    const {enable, disable} = flagMods;
    mods =
      (enable?.ignoreCase ? 'i' : '') +
      (enable?.dotAll ? 's' : '') +
      (disable ? '-' : '') +
      (disable?.ignoreCase ? 'i' : '') +
      (disable?.dotAll ? 's' : '');
  }
  return `${mods}:`;
}

function getNewCurrentFlags(current, {enable, disable}) {
  return {
    dotAll: !disable?.dotAll && !!(enable?.dotAll || current.dotAll),
    ignoreCase: !disable?.ignoreCase && !!(enable?.ignoreCase || current.ignoreCase),
  };
}

function getQuantifierStr({min, max, greedy, possessive}) {
  let base;
  if (!min && max === 1) {
    base = '?';
  } else if (!min && max === Infinity) {
    base = '*';
  } else if (min === 1 && max === Infinity) {
    base = '+';
  } else if (min === max) {
    base = `{${min}}`;
  } else {
    base = `{${min},${max === Infinity ? '' : max}}`;
  }
  return base + (possessive ? '+' : (greedy ? '' : '?'));
}

function isDigitCharCode(value) {
  return value > 47 && value < 58;
}

export {
  generate,
};
