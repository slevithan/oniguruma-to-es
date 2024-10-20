import {getOptions} from './compile.js';
import emojiRegex from 'emoji-regex-xs';
import {AstCharacterSetKinds, AstTypes, AstVariableLengthCharacterSetKinds} from './parse.js';
import {traverse} from './traverse.js';
import {getIgnoreCaseMatchChars, UnicodePropertiesWithCase} from './unicode.js';
import {r, Target, TargetNum} from './utils.js';

/**
Generates a `regex`-compatible pattern, flags, and options from a `regex` AST.
@param {import('./transform.js').RegexAst} ast
@param {import('./compile.js').CompileOptions} [options]
@returns {{
  pattern: string;
  flags: string;
  options?: Object;
}}
*/
function generate(ast, options) {
  options = getOptions(options);
  const minTargetES2024 = TargetNum[options.target] >= TargetNum[Target.ES2024];
  const minTargetESNext = options.target === Target.ESNext;
  const canUseFlagMods = minTargetESNext;
  const globalModFlags = {
    dotAll: ast.flags.dotAll,
    ignoreCase: ast.flags.ignoreCase,
  };

  // If the output can't use flag groups with flags i and s, we need a pre-pass to get metadata
  // [TODO] Consider gathering the data in the transformer's final pass to avoid an extra traversal
  const flagStack = [{...globalModFlags}];
  let hasCaseInsensitiveNode = false;
  let hasCaseSensitiveNode = false;
  let hasDotAllDot = false;
  let hasNonDotAllDot = false;
  if (!canUseFlagMods) {
    traverse({node: ast}, {
      getCurrentModFlags: () => flagStack.at(-1),
      popModFlags() {flagStack.pop()},
      pushModFlags(obj) {flagStack.push(obj)},
      setHasCased() {
        if (flagStack.at(-1).ignoreCase) {
          hasCaseInsensitiveNode = true;
        } else {
          hasCaseSensitiveNode = true;
        }
      },
      setHasDot() {
        if (flagStack.at(-1).dotAll) {
          hasDotAllDot = true;
        } else {
          hasNonDotAllDot = true;
        }
      },
    }, FlagModifierVisitor);
  }

  const appliedGlobalFlags = {
    // Include JS flag s (Onig flag m) if a dotAll dot was used and no non-dotAll dots were used
    dotAll: (ast.flags.ignoreCase || hasCaseInsensitiveNode) && !hasCaseSensitiveNode,
    // Include JS flag i if a case insensitive node was used and no case sensitive nodes were used
    ignoreCase: (ast.flags.dotAll || hasDotAllDot) && !hasNonDotAllDot,
  };
  let lastNode = null;
  const state = {
    ...options,
    appliedGlobalFlags,
    currentFlags: {...globalModFlags},
    groupNames: new Set(), // TODO: Use
    inCharacterClass: false,
    lastNode,
    minTargetES2024,
    minTargetESNext, // TODO: Remove if not used
    useAppliedDotAll: !canUseFlagMods && hasDotAllDot && hasNonDotAllDot, // TODO: Use
    useAppliedIgnoreCase: !canUseFlagMods && hasCaseInsensitiveNode && hasCaseSensitiveNode, // TODO: Use for Unicode props
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
        // TODO: Throw if `!canUseFlagMods`, `!allowBestEffort`, and within mixed local ignoreCase
        // Transformed backrefs always use digits; no named backrefs
        return '\\' + node.ref;
      case AstTypes.CapturingGroup:
        // TODO: If `!minTargetESNext` need to strip duplicate names
        // TODO: Set `currentFlags`
        return ''; // TODO
      case AstTypes.Character:
        return generateCharacter(node, state);
      case AstTypes.CharacterClass: {
        state.inCharacterClass = true;
        const result = `[${node.negate ? '^' : ''}${node.elements.map(gen).join('')}]`;
        state.inCharacterClass = false;
        return result;
      }
      case AstTypes.CharacterClassIntersection:
        return node.classes.map(gen).join('&&');
      case AstTypes.CharacterClassRange:
        // TODO: Need special `ignoreCase` handling; maybe create the range directly without calling `gen` on the kids
        return ''; // TODO
      case AstTypes.CharacterSet:
        // TODO: Special case for `\p{Any}` to `[^]` since the former is used when parsing fragments
        // in the transformer since the parser follows Onig rules and doesn't allow empty char classes
        return ''; // TODO
      case AstTypes.Flags:
        return generateFlags(node, state);
      case AstTypes.Group: {
        const currentFlags = state.currentFlags;
        node.flags && (state.currentFlags = getNewCurrentFlags(currentFlags, node.flags));
        const result = `(?${getGroupPrefix(node, canUseFlagMods)}${node.alternatives.map(gen).join('|')})`;
        state.currentFlags = currentFlags;
        return result;
      }
      case AstTypes.Pattern:
        return node.alternatives.map(gen).join('|');
      case AstTypes.Quantifier:
        return ''; // TODO
      case AstTypes.Recursion:
        return ''; // TODO
      case AstTypes.VariableLengthCharacterSet:
        // Technically, `VariableLengthCharacterSet` nodes shouldn't be included in transformer
        // output since none of its kinds are directly supported by `regex`, but `kind: 'grapheme'`
        // (only) is allowed through so we can check options `allowBestEffort` and `target` here
        return generateVariableLengthCharacterSet(node, state);
      default:
        // Note: Node types `Directive` and `Subroutine` are never included in transformer output
        throw new Error(`Unexpected node type "${node.type}"`);
    }
  }
  return gen(ast);
}

const FlagModifierVisitor = {
  AnyGroup: {
    enter({node}, state) {
      state.pushModFlags(
        node.flags ?
          getNewCurrentFlags(state.getCurrentModFlags(), node.flags) :
          {...state.getCurrentModFlags()}
      );
    },
    exit(_, state) {
      state.popModFlags();
    },
  },
  Backreference(_, state) {
    // Can't know for sure, so assume the backref will include chars with case
    state.setHasCased();
  },
  Character({node}, state) {
    if (charHasCase(String.fromCodePoint(node.value))) {
      state.setHasCased();
    }
  },
  CharacterSet({node}, state) {
    if (node.kind === AstCharacterSetKinds.any) {
      state.setHasDot();
    } else if (node.kind === AstCharacterSetKinds.property && UnicodePropertiesWithCase.has(node.value)) {
      state.setHasCased();
    }
  },
};

const BaseEscapeChars = new Set([
  '$', '(', ')', '*', '+', '.', '?', '[', '\\', ']', '^', '{', '|', '}',
]);
const CharacterClassEscapeChars = new Set([
  '-', '\\', ']', '^',
]);
const CharacterClassEscapeCharsFlagV = new Set([
  '(', ')', '-', '/', '[', '\\', ']', '^', '{', '|', '}',
  // Double punctuators (also `-` and `^`)
  '!', '#', '$', '%', '&', '*', '+', ',', '.', ':', ';', '<', '=', '>', '?', '@', '`', '~',
]);

const CharCodeEscapeMap = new Map([
  [ 9, r`\t`], // horizontal tab
  [10, r`\n`], // line feed
  [11, r`\v`], // vertical tab
  [12, r`\f`], // form feed
  [13, r`\r`], // carriage return
]);

function charHasCase(char) {
  return /^\p{Cased}$/u.test(char);
}

function generateCharacter({value}, state) {
  const char = String.fromCodePoint(value);
  if (CharCodeEscapeMap.has(value)) {
    return CharCodeEscapeMap.get(value);
  }
  if (
    // Control chars, etc.; condition modeled on the Chrome developer console's display for strings
    value < 32 || (value > 126 && value < 160) ||
    // Avoid corrupting a preceding backref by immediately following it with a literal digit
    (state.lastNode.type === AstTypes.Backreference && isIntCharCode(value))
  ) {
    // Don't convert value `0` to `\0` since that's corruptible by following literal digits
    return r`\x${value.toString(16).padStart(2, '0')}`;
  }
  const escapeChars = state.inCharacterClass ?
    (state.minTargetES2024 ? CharacterClassEscapeCharsFlagV : CharacterClassEscapeChars) :
    BaseEscapeChars;
  if (escapeChars.has(char)) {
    return '\\' + char;
  }
  if (state.useAppliedIgnoreCase && state.currentFlags.ignoreCase && charHasCase(char)) {
    const cases = getIgnoreCaseMatchChars(char);
    return state.inCharacterClass ?
      cases.join('') :
      (cases.length > 1 ? `[${cases.join('')}]` : cases[0]);
  }
  return char;
}

function generateFlags(node, state) {
  return (
    (node.hasIndices ? 'd' : '') +
    (node.global ? 'g' : '') +
    (state.appliedGlobalFlags.ignoreCase ? 'i' : '') +
    (node.multiline ? 'm' : '') +
    (state.appliedGlobalFlags.dotAll ? 's' : '') +
    (node.sticky ? 'y' : '')
    // Note: `regex` doesn't allow explicitly adding flags it handles implicitly, so there are no
    // `unicode` (flag u) or `unicodeSets` (flag v) props; those flags are added later
  );
}

function generateVariableLengthCharacterSet({kind}, state) {
  if (kind !== AstVariableLengthCharacterSetKinds.grapheme) {
    throw new Error(`Unexpected varcharset kind "${kind}"`);
  }
  if (!state.allowBestEffort) {
    throw new Error(r`Use of "\X" requires option allowBestEffort`);
  }
  // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows overqualified and
  // underqualified emoji using a general pattern that matches all Unicode sequences that follow
  // the structure of valid emoji. That actually makes it more accurate for matching any grapheme
  const emojiGrapheme = state.minTargetES2024 ? r`\p{RGI_Emoji}` : emojiRegex().source;
  // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>
  return r`(?>\r\n|${emojiGrapheme}|\P{M}\p{M}*)`;
}

function getGroupPrefix(node, canUseFlagMods) {
  if (node.atomic) {
    return '>';
  }
  let mods = '';
  if (node.flags && canUseFlagMods) {
    const {enable, disable} = node.flags;
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
    dotAll: !disable?.dotAll && (!!enable?.dotAll || current.dotAll),
    ignoreCase: !disable?.ignoreCase && (!!enable?.ignoreCase || current.ignoreCase),
  };
}

function isIntCharCode(value) {
  return value > 47 && value < 58;
}

export {
  generate,
};
