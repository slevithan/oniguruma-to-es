import {getOptions} from './compile.js';
import emojiRegex from 'emoji-regex-xs';
import {AstCharacterSetKinds, AstTypes, AstVariableLengthCharacterSetKinds} from './parse.js';
import {traverse} from './traverse.js';
import {PropertiesWithCase} from './unicode.js';
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
  const canUseFlagMods = TargetNum[options.target] > TargetNum[Target.ES2024];
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
  const state = {
    ...options,
    appliedGlobalFlags,
    currentFlags: {...globalModFlags},
    groupNames: new Set(), // TODO: Use
    inCharacterClass: false, // TODO: Set
    useAppliedDotAll: !canUseFlagMods && hasDotAllDot && hasNonDotAllDot, // TODO: Use
    useAppliedIgnoreCase: !canUseFlagMods && hasCaseInsensitiveNode && hasCaseSensitiveNode, // TODO: Use for Unicode props
  };
  let lastNodeType = null;
  function gen(node) {
    state.lastNodeType = lastNodeType; // TODO: Use for literal digits that follow backrefs
    lastNodeType = node.type;
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
        return ''; // TODO
      case AstTypes.Backreference:
        // Transformed backrefs always use digits
        // [TODO] Following literal digits need to be escaped or delimited to avoid changing the meaning of the backref
        return '\\' + node.ref;
      case AstTypes.CapturingGroup:
        // TODO: For target < ESNext, need to strip duplicate names
        return ''; // TODO
      case AstTypes.Character:
        return generateCharacter(node, state);
      case AstTypes.CharacterClass:
        return `[${node.negate ? '^' : ''}${node.elements.map(gen).join('')}]`;
      case AstTypes.CharacterClassIntersection:
        return node.classes.map(gen).join('&&');
      case AstTypes.CharacterClassRange:
        // TODO: Maybe create the range directly (to deal with case insensitivity), without calling `gen` on the kids
        return ''; // TODO
      case AstTypes.CharacterSet:
        // TODO: Special case for `\p{Any}` to `[^]` since the former is used when parsing fragments
        // in the transformer since the parser follows Onig rules and doesn't allow empty char classes
        return ''; // TODO
      case AstTypes.Flags:
        return generateFlags(node, state);
      case AstTypes.Group:
        if (node.flags) {
          state.currentFlags = getNewCurrentFlags(state.currentFlags, node.flags);
        }
        return `(?${getGroupPrefix(node, canUseFlagMods)}${node.alternatives.map(gen).join('|')})`;
      case AstTypes.Pattern:
        return node.alternatives.map(gen).join('|');
      case AstTypes.Quantifier:
        return ''; // TODO
      case AstTypes.Recursion:
        return ''; // TODO
      case AstTypes.VariableLengthCharacterSet:
        // Technically, `VariableLengthCharacterSet` nodes shouldn't be included in transformer
        // output since none of its kinds are directly supported by `regex`, but `kind: 'grapheme'`
        // (only) is allowed through to enable use here of options `allowBestEffort` and `target`
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
    } else if (node.kind === AstCharacterSetKinds.property && PropertiesWithCase.has(node.value)) {
      state.setHasCased();
    }
  },
};

const CharCodeEscapes = new Map([
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
  // TODO: Add preceding delimiter or escape this char for things that can alter a preceding valid node
  const char = String.fromCodePoint(value);
  const useAppliedIC = state.currentFlags.ignoreCase && state.useAppliedIgnoreCase && charHasCase(char);
  // ASCII A-Za-z can be converted without worrying about Unicode edge cases
  if (useAppliedIC && !state.allowBestEffort && !/[a-z]/iu.test(char)) {
    throw new Error('Uses mixed case sensitivity in a way that requires option allowBestEffort or target ESNext');
  }
  if (CharCodeEscapes.has(value)) {
    return CharCodeEscapes.get(value);
  }
  // Condition modeled on the Chrome developer console's display for strings
  if (value < 32 || (value > 126 && value < 160)) {
    // Don't convert value `0` to `\0` since that's corruptible by following literal digits
    return r`\x${value.toString(16).padStart(2, '0')}`;
  }
  if (false /* is metachar to escape */) {
    if (state.inCharacterClass) {
      return char; // TODO, including reserved double punctuators
    }
    return char; // TODO
  }
  if (useAppliedIC) {
    // Unicode case folding is complicated, and this doesn't support all edge cases.
    // - Doesn't add titlecase-specific versions of chars like Serbo-Croatian 'ǅ' (U+01C5) (lcase 'ǆ', ucase 'Ǆ').
    //   - All titlecase chars: <compart.com/en/unicode/category/Lt>
    // - Some known language-specific and Unicode legacy edge cases are handled, but additional edge cases likely exist.
    // - Language-specific edge cases:
    //   - The lcase of 'İ' (capital I with dot above, U+0130) is small 'i', which ucases as capital 'I'.
    //     - Note: `/i/iv.test('İ')` and `/İ/iv.test('Iiı')` return `false`.
    //   - The ucase of 'ı' (small dotless I, U+0131) is capital 'I', which lcases as small 'i'.
    //     - Note: `/I/iv.test('ı')` and `/ı/iv.test('Iiİ')` return `false`.
    //   - The lcase of 'ẞ' (capital sharp S, U+1E9E) is 'ß' (small sharp S, U+00DF), but the ucase of U+00DF is the two chars 'SS'.
    // - Unicode legacy edge cases:
    //   - The lcase of 'K' (Kelvin, U+212A) is small 'k', which ucases as capital 'K'.
    //   - The lcase of 'Ω' (Ohm, U+2126) is small Omega 'ω', which ucases as capital Omega ('Ω', U+03A9).
    //   - The lcase of 'Å' (Angstrom, U+212B) is small A with ring above 'å' (U+00E5), which ucases as capital A with ring above ('Å', U+00C5).
    // const lower = char.toLowerCase();
    // const upper = char.toUpperCase();
    return char; // TODO
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
  const emojiGrapheme = TargetNum[state.target] >= TargetNum[Target.ES2024] ?
    r`\p{RGI_Emoji}` :
    // `emoji-regex-xs` is more permissive than `\p{RGI_Emoji}` since it allows overqualified and
    // underqualified emoji using a general pattern that matches all Unicode sequences that follow
    // the structure of valid emoji. That actually makes it more accurate for matching any grapheme
    emojiRegex().source;
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

export {
  generate,
};
