import {getOptions} from './options.js';
import {getIgnoreCaseMatchChars, UnicodePropertiesWithSpecificCase} from './unicode.js';
import {cp, envFlags, getNewCurrentFlags, getOrInsert, isMinTarget, r} from './utils.js';
import {createAlternative, createCharacter, createGroup, NodeAssertionKinds, NodeCharacterClassKinds, NodeCharacterSetKinds, NodeLookaroundAssertionKinds, NodeTypes} from 'oniguruma-parser/parser';
import {traverse} from 'oniguruma-parser/traverser';

/**
Generates a Regex+ compatible `pattern`, `flags`, and `options` from a Regex+ AST.
@param {import('./transform.js').RegexPlusAst} ast
@param {import('.').ToRegExpOptions} [options]
@returns {{
  pattern: string;
  flags: string;
  options: Object;
  _captureTransfers: Map<number, Array<number>>;
  _hiddenCaptures: Array<number>;
}}
*/
function generate(ast, options) {
  const opts = getOptions(options);
  const minTargetEs2024 = isMinTarget(opts.target, 'ES2024');
  const minTargetEs2025 = isMinTarget(opts.target, 'ES2025');
  const recursionLimit = opts.rules.recursionLimit;
  if (!Number.isInteger(recursionLimit) || recursionLimit < 2 || recursionLimit > 20) {
    throw new Error('Invalid recursionLimit; use 2-20');
  }

  // If the output can't use flag groups, we need a pre-pass to check for the use of chars with
  // case in case sensitive/insensitive states. This minimizes the need for case expansions (though
  // expansions are lossless, even given Unicode case complexities) and allows supporting case
  // insensitive backrefs in more cases
  // [TODO] Consider gathering this data in the transformer's final traversal to avoid work here
  let hasCaseInsensitiveNode = null;
  let hasCaseSensitiveNode = null;
  if (!minTargetEs2025) {
    const iStack = [ast.flags.ignoreCase];
    traverse(ast, FlagModifierVisitor, {
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
    });
  }

  const appliedGlobalFlags = {
    dotAll: ast.flags.dotAll,
    // - Turn global flag i on if a case insensitive node was used and no case sensitive nodes were
    //   used (to avoid unnecessary node expansion).
    // - Turn global flag i off if a case sensitive node was used (since case sensitivity can't be
    //   forced without the use of ES2025 flag groups)
    ignoreCase: !!((ast.flags.ignoreCase || hasCaseInsensitiveNode) && !hasCaseSensitiveNode),
  };
  let lastNode = null;
  const state = {
    accuracy: opts.accuracy,
    appliedGlobalFlags,
    captureMap: new Map(),
    currentFlags: {
      dotAll: ast.flags.dotAll,
      ignoreCase: ast.flags.ignoreCase,
    },
    inCharClass: false,
    lastNode,
    originMap: ast._originMap,
    recursionLimit,
    useAppliedIgnoreCase: !!(!minTargetEs2025 && hasCaseInsensitiveNode && hasCaseSensitiveNode),
    useFlagMods: minTargetEs2025,
    useFlagV: minTargetEs2024,
    verbose: opts.verbose,
  };
  function gen(node) {
    state.lastNode = lastNode;
    lastNode = node;
    switch (node.type) {
      case NodeTypes.Regex:
        // Final result is an object; other node types return strings
        return {
          pattern: gen(node.pattern),
          flags: gen(node.flags),
          options: {...node.options},
        };
      case NodeTypes.Alternative:
        return node.elements.map(gen).join('');
      case NodeTypes.Assertion:
        return genAssertion(node);
      case NodeTypes.Backreference:
        return genBackreference(node, state);
      case NodeTypes.CapturingGroup:
        return genCapturingGroup(node, state, gen);
      case NodeTypes.Character:
        return genCharacter(node, state);
      case NodeTypes.CharacterClass:
        return genCharacterClass(node, state, gen);
      case NodeTypes.CharacterClassRange:
        return genCharacterClassRange(node, state);
      case NodeTypes.CharacterSet:
        return genCharacterSet(node, state);
      case NodeTypes.Flags:
        return genFlags(node, state);
      case NodeTypes.Group:
        return genGroup(node, state, gen);
      case NodeTypes.LookaroundAssertion:
        return genLookaroundAssertion(node, state, gen);
      case NodeTypes.Pattern:
        return node.alternatives.map(gen).join('|');
      case NodeTypes.Quantifier:
        return gen(node.element) + getQuantifierStr(node);
      case NodeTypes.Recursion:
        return genRecursion(node, state);
      default:
        // Node types `AbsentFunction`, `Directive`, and `Subroutine` are never included in
        // transformer output
        throw new Error(`Unexpected node type "${node.type}"`);
    }
  }

  const result = gen(ast);
  if (!minTargetEs2024) {
    // Switch from flag v to u; Regex+ implicitly chooses by default
    delete result.options.force.v;
    result.options.disable.v = true;
    result.options.unicodeSetsPlugin = null;
  }
  result._captureTransfers = new Map();
  result._hiddenCaptures = [];
  state.captureMap.forEach((value, key) => {
    if (value.hidden) {
      result._hiddenCaptures.push(key);
    }
    if (value.transferTo) {
      getOrInsert(result._captureTransfers, value.transferTo, []).push(key);
    }
  });

  return result;
}

const FlagModifierVisitor = {
  '*': {
    enter({node}, state) {
      if (isAnyGroup(node)) {
        const currentModI = state.getCurrentModI();
        state.pushModI(
          node.flags ?
            getNewCurrentFlags({ignoreCase: currentModI}, node.flags).ignoreCase :
            currentModI
        );
      }
    },
    exit({node}, state) {
      if (isAnyGroup(node)) {
        state.popModI();
      }
    },
  },
  Backreference(_, state) {
    // Can't know for sure, so assume the backref will include chars with case (best that could be
    // done is not calling `setHasCasedChar` if the reffed group doesn't contain a char with case
    // or most kinds of char sets)
    state.setHasCasedChar();
  },
  Character({node}, state) {
    if (charHasCase(cp(node.value))) {
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
    if (
      node.kind === NodeCharacterSetKinds.property &&
      UnicodePropertiesWithSpecificCase.has(node.value)
    ) {
      state.setHasCasedChar();
    }
  },
};

const BaseEscapeChars = new Set([
  '$', '(', ')', '*', '+', '.', '?', '[', '\\', ']', '^', '{', '|', '}',
]);
const CharClassEscapeChars = new Set([
  '-', '\\', ']', '^',
  // Literal `[` doesn't require escaping with flag u, but this can help work around regex source
  // linters and regex syntax processors that expect unescaped `[` to create a nested class
  '[',
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
  [0x2028, r`\u2028`], // line separator
  [0x2029, r`\u2029`], // paragraph separator
  [0xFEFF, r`\uFEFF`], // ZWNBSP/BOM
]);

const casedRe = /^\p{Cased}$/u;
function charHasCase(char) {
  return casedRe.test(char);
}

function genAssertion({kind, negate}) {
  // Can always use `^` and `$` for string boundaries since JS flag m is never relied on; Onig uses
  // different line break chars
  if (kind === NodeAssertionKinds.string_end) {
    return '$';
  }
  if (kind === NodeAssertionKinds.string_start) {
    return '^';
  }
  // If a word boundary came through the transformer unaltered, that means `wordIsAscii` or
  // `asciiWordBoundaries` is enabled
  if (kind === NodeAssertionKinds.word_boundary) {
    return negate ? r`\B` : r`\b`;
  }
  // Kinds `grapheme_boundary`, `line_end`, `line_start`, `search_start`, and `string_end_newline`
  // are never included in transformer output
  throw new Error(`Unexpected assertion kind "${kind}"`);
}

function genBackreference({ref}, state) {
  if (typeof ref !== 'number') {
    throw new Error('Unexpected named backref in transformed AST');
  }
  if (
    !state.useFlagMods &&
    state.accuracy === 'strict' &&
    state.currentFlags.ignoreCase &&
    !state.captureMap.get(ref).ignoreCase
  ) {
    throw new Error('Use of case-insensitive backref to case-sensitive group requires target ES2025 or non-strict accuracy');
  }
  return '\\' + ref;
}

function genCapturingGroup(node, state, gen) {
  const {name, number, alternatives} = node;
  const data = {ignoreCase: state.currentFlags.ignoreCase};
  // Has origin if the capture is from an expanded subroutine
  const origin = state.originMap.get(node);
  if (origin) {
    // All captures from/within expanded subroutines are marked as hidden
    data.hidden = true;
    // If a subroutine (or descendant capture) occurs after its origin group, it's marked to have
    // its captured value transferred to the origin's capture slot. `number` and `origin.number`
    // are the capture numbers *after* subroutine expansion
    if (number > origin.number) {
      data.transferTo = origin.number;
    }
  }
  state.captureMap.set(number, data);
  return `(${name ? `?<${name}>` : ''}${alternatives.map(gen).join('|')})`;
}

function genCharacter({value}, state) {
  const char = cp(value);
  const escaped = getCharEscape(value, {
    escDigit: state.lastNode.type === NodeTypes.Backreference,
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

function genCharacterClass(node, state, gen) {
  const {kind, negate, parent} = node;
  let {elements} = node;
  if (kind === NodeCharacterClassKinds.intersection && !state.useFlagV) {
    throw new Error('Use of class intersection requires min target ES2024');
  }
  // Work around WebKit parser bug by moving literal hyphens to the end of the class; see
  // <github.com/slevithan/oniguruma-to-es/issues/30>
  if (envFlags.literalHyphenIncorrectlyCreatesRange && state.useFlagV && elements.some(isLiteralHyphen)) {
    // Remove all hyphens then add one at the end; can't just sort in case of e.g. `[\d\-\-]`
    elements = elements.filter(kid => !isLiteralHyphen(kid));
    elements.push(createCharacter(45));
  }
  const genClass = () => `[${negate ? '^' : ''}${
    elements.map(gen).join(kind === NodeCharacterClassKinds.intersection ? '&&' : '')
  }]`;
  if (!state.inCharClass) {
    // Hack to support top-level-nested, negated classes in non-negated classes with target ES2018.
    // Already established that this isn't an intersection class if `!state.useFlagV`, so don't check again
    if (!state.useFlagV && !negate) {
      const negatedChildClasses = elements.filter(
        kid => kid.type === NodeTypes.CharacterClass && kid.kind === NodeCharacterClassKinds.union && kid.negate
      );
      if (negatedChildClasses.length) {
        const group = createGroup();
        const groupFirstAlt = group.alternatives[0];
        group.parent = parent;
        groupFirstAlt.parent = group;
        elements = elements.filter(kid => !negatedChildClasses.includes(kid));
        node.elements = elements;
        if (elements.length) {
          node.parent = groupFirstAlt;
          groupFirstAlt.elements.push(node);
        } else {
          group.alternatives.pop();
        }
        negatedChildClasses.forEach(cc => {
          const newAlt = createAlternative();
          newAlt.parent = group;
          cc.parent = newAlt;
          newAlt.elements.push(cc);
          group.alternatives.push(newAlt);
        });
        return gen(group);
      }
    }
    // For the outermost char class, set state
    state.inCharClass = true;
    const result = genClass();
    state.inCharClass = false;
    return result;
  }
  // No first element for implicit class in empty intersection like `[&&]`
  const firstEl = elements[0];
  if (
    // Already established that the parent is a char class via `inCharClass`, so don't check again
    kind === NodeCharacterClassKinds.union &&
    !negate &&
    firstEl &&
    (
      ( // Allows many nested classes to work with `target` ES2018 which doesn't support nesting
        (!state.useFlagV || !state.verbose) &&
        parent.kind === NodeCharacterClassKinds.union &&
        !(envFlags.literalHyphenIncorrectlyCreatesRange && state.useFlagV)
      ) ||
      ( !state.verbose &&
        parent.kind === NodeCharacterClassKinds.intersection &&
        // JS doesn't allow intersection with union or ranges
        elements.length === 1 &&
        firstEl.type !== NodeTypes.CharacterClassRange
      )
    )
  ) {
    // Remove unnecessary nesting; unwrap kids into the parent char class
    return elements.map(gen).join('');
  }
  if (!state.useFlagV && parent.type === NodeTypes.CharacterClass) {
    throw new Error('Use of nested character class requires min target ES2024');
  }
  return genClass();
}

function genCharacterClassRange(node, state) {
  const min = node.min.value;
  const max = node.max.value;
  const escOpts = {
    escDigit: false,
    inCharClass: true,
    useFlagV: state.useFlagV,
  };
  const minStr = getCharEscape(min, escOpts);
  const maxStr = getCharEscape(max, escOpts);
  const extraChars = new Set();
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase) {
    // [TODO] Avoid duplication by considering other chars in the parent char class when expanding
    const charsOutsideRange = getCasesOutsideCharClassRange(node);
    const ranges = getCodePointRangesFromChars(charsOutsideRange);
    ranges.forEach(value => {
      extraChars.add(
        Array.isArray(value) ?
          `${getCharEscape(value[0], escOpts)}-${getCharEscape(value[1], escOpts)}` :
          getCharEscape(value, escOpts)
      );
    });
  }
  // Create the range without calling `gen` on the `min`/`max` kids
  return `${minStr}-${maxStr}${[...extraChars].join('')}`;
}

function genCharacterSet({kind, negate, value, key}, state) {
  if (kind === NodeCharacterSetKinds.dot) {
    return state.currentFlags.dotAll ?
      ((state.appliedGlobalFlags.dotAll || state.useFlagMods) ? '.' : '[^]') :
      // Onig's only line break char is line feed, unlike JS
      r`[^\n]`;
  }
  if (kind === NodeCharacterSetKinds.digit) {
    return negate ? r`\D` : r`\d`;
  }
  if (kind === NodeCharacterSetKinds.property) {
    if (
      state.useAppliedIgnoreCase &&
      state.currentFlags.ignoreCase &&
      UnicodePropertiesWithSpecificCase.has(value)
    ) {
      // Support for this would require heavy Unicode data. Could change e.g. `\p{Lu}` to `\p{LC}`
      // if not using strict `accuracy` (since it's close but not 100%), but this wouldn't work
      // for e.g. `\p{Lt}`, and in any case, it's probably user error if using these case-specific
      // props case-insensitively
      throw new Error(`Unicode property "${value}" can't be case-insensitive when other chars have specific case`);
    }
    return `${negate ? r`\P` : r`\p`}{${key ? `${key}=` : ''}${value}}`;
  }
  if (kind === NodeCharacterSetKinds.word) {
    return negate ? r`\W` : r`\w`;
  }
  // Kinds `grapheme`, `hex`, `newline`, `posix`, and `space` are never included in transformer output
  throw new Error(`Unexpected character set kind "${kind}"`);
}

function genFlags(node, state) {
  return (
    // The transformer should never turn on the properties for flags d, g, and m since Onig doesn't
    // have equivs. Flag m is never relied on since Onig uses different line break chars than JS
    // (node.hasIndices ? 'd' : '') +
    // (node.global ? 'g' : '') +
    // (node.multiline ? 'm' : '') +
    (state.appliedGlobalFlags.ignoreCase ? 'i' : '') +
    (node.dotAll ? 's' : '') +
    (node.sticky ? 'y' : '')
    // Regex+ doesn't allow explicitly adding flags it handles implicitly, so there are no
    // `unicode` (flag u) or `unicodeSets` (flag v) props; those flags are added separately
  );
}

function genGroup({atomic, flags, parent, alternatives}, state, gen) {
  const currentFlags = state.currentFlags;
  if (flags) {
    state.currentFlags = getNewCurrentFlags(currentFlags, flags);
  }
  const contents = alternatives.map(gen).join('|');
  const result = (
    !state.verbose &&
    alternatives.length === 1 &&
    parent.type !== NodeTypes.Quantifier &&
    !atomic &&
    (!state.useFlagMods || !flags)
   ) ? contents : `(?${getGroupPrefix(atomic, flags, state.useFlagMods)}${contents})`;
  state.currentFlags = currentFlags;
  return result;
}

function genLookaroundAssertion({kind, negate, alternatives}, _, gen) {
  const prefix = `${kind === NodeLookaroundAssertionKinds.lookahead ? '' : '<'}${negate ? '!' : '='}`;
  return `(?${prefix}${alternatives.map(gen).join('|')})`;
}

function genRecursion({ref}, state) {
  const limit = state.recursionLimit;
  // Using the syntax supported by `regex-recursion`
  return ref === 0 ? `(?R=${limit})` : r`\g<${ref}&R=${limit}>`;
}

/**
Given a `CharacterClassRange` node, returns an array of chars that are a case variant of a char in
the range, and aren't already in the range.
*/
function getCasesOutsideCharClassRange(node, options) {
  const firstOnly = !!options?.firstOnly;
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
    const char = cp(i);
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

// This shouldn't modifiy any char that has case
function getCharEscape(codePoint, {escDigit, inCharClass, useFlagV}) {
  if (CharCodeEscapeMap.has(codePoint)) {
    return CharCodeEscapeMap.get(codePoint);
  }
  if (
    // Control chars, etc.; condition modeled on the Chrome developer console's display for strings
    codePoint < 32 || (codePoint > 126 && codePoint < 160) ||
    // Unicode planes 4-16; unassigned, special purpose, and private use area
    codePoint > 0x3FFFF ||
    // Avoid corrupting a preceding backref by immediately following it with a literal digit
    (escDigit && isDigitCharCode(codePoint))
  ) {
    // Don't convert codePoint `0` to `\0` since that's corruptible by following literal digits
    return codePoint > 0xFF ?
      `\\u{${codePoint.toString(16).toUpperCase()}}` :
      `\\x${codePoint.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  const escapeChars = inCharClass ?
    (useFlagV ? CharClassEscapeCharsFlagV : CharClassEscapeChars) :
    BaseEscapeChars;
  const char = cp(codePoint);
  return (escapeChars.has(char) ? '\\' : '') + char;
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

function getQuantifierStr({min, max, kind}) {
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
  return base + {
    greedy: '',
    lazy: '?',
    possessive: '+',
  }[kind];
}

function isAnyGroup({type}) {
  return type === NodeTypes.Group ||
    type === NodeTypes.CapturingGroup ||
    type === NodeTypes.LookaroundAssertion;
}

function isDigitCharCode(value) {
  return value > 47 && value < 58;
}

function isLiteralHyphen({type, value}) {
  return type === NodeTypes.Character && value === 45;
}

export {
  generate,
};
