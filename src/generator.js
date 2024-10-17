import {AstTypes, AstVariableLengthCharacterSetKinds} from './parser.js';
import {traverse} from './traverser.js';
import {r, Target, TargetNum} from './utils.js';
import emojiRegex from 'emoji-regex-xs';

/**
@typedef {import('./compiler.js').Options} Options
*/

/**
Returns a complete set of options, with default values set for options that weren't provided.
@param {Options} options
@returns {Required<Options>}
*/
function getOptions(options) {
  return {
    // Allow results that differ from Oniguruma in extreme edge cases. If `false`, throw if the
    // pattern can't be converted with identical behavior. Ex: Enables the use of `\X`, which uses
    // a close approximation of a Unicode extended grapheme cluster. Recommended: `true`.
    allowBestEffort: false,
    // If not provided, any use of recursion (ex: `a\g<0>?b` or `(?<r>a\g<r>?b)`) throws. If an
    // integer from 2-100 is provided, common forms of recursive patterns are supported and recurse
    // up to the specified max depth. Recommended: `6`.
    maxRecursionDepth: null,
    // JS version for the generated regex pattern and flags. Patterns that can't be emulated using
    // the given target throw.
    // - 'ES2018': Broadest compatibility (uses JS flag u). Unsupported features: nested char
    //             classes and char class intersection.
    // - 'ES2024': Recommended. Uses JS flag v, supported by Node.js 20 and 2023-era browsers.
    // - 'ESNext': Default. Allows use of ES2025+ regex features in generated patterns (flag groups
    //             and duplicate group names). This preserves duplicate group names across separate
    //             alternation paths and allows disabling option `allowBestEffort` with patterns
    //             that used mixed states of case sensitivity for non-ASCII chars with case.
    target: Target.ESNext,
    // Override default values with provided options
    ...options,
  };
}

// Generate a `regex`-compatible pattern, flags, and options from a `regex` AST
function generate(ast, options) {
  options = getOptions(options);
  const applyLocalFlags = TargetNum[options.target] <= TargetNum[Target.ES2024];

  // If we can't use flag groups for flags i and s, we need a pre-pass to get metadata
  // TODO: Consider gathering this data in the transformer to avoid the extra work here
  let meta;
  if (applyLocalFlags) {
    meta = {
      hasCaseInsensitiveNode: false,
      hasCaseSensitiveNode: false,
      hasDotAllDot: false,
      hasNonDotAllDot: false,
      flagStack: [{
        ignoreCase: ast.flags.ignoreCase,
        dotAll: ast.flags.dotAll,
      }],
      isIgnoreCaseOn: () => meta.flagStack.at(-1).ignoreCase,
      isDotAllOn: () => meta.flagStack.at(-1).dotAll,
    };
    traverse({node: ast}, meta, FlagModifierVisitor);
  }

  const state = {
    ...options,
    applyDotAll: applyLocalFlags && meta.hasDotAllDot && meta.hasNonDotAllDot,
    applyIgnoreCase: applyLocalFlags && meta.hasCaseInsensitiveNode && meta.hasCaseSensitiveNode,
    currentFlags: {
      dotAll: false,
      ignoreCase: false,
    },
    groupNames: new Set(),
    inCharacterClass: false,
  };
  function gen(node) {
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
        // Transformed backrefs always use digits. Following literal digits need to be escaped or
        // delimited to avoid changing the meaning of the backref
        return '\\' + node.ref;
      case AstTypes.CapturingGroup:
        // TODO: For target ESNext, need to strip duplicate names
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
        // TODO: Use target `ESNext` to enable flag groups and duplicate group names
        return ''; // TODO
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
  const result = gen(ast);

  if (applyLocalFlags) {
    // Include JS flag i if a case insensitive node was used and no case sensitive nodes were used
    const flagI = (ast.flags.ignoreCase || meta.hasCaseInsensitiveNode) && !meta.hasCaseSensitiveNode;
    // Include JS flag s (Onig flag m) if a dotAll dot was used and no non-dotAll dots were used
    const flagS = (ast.flags.dotAll || meta.hasDotAllDot) && !meta.hasNonDotAllDot;
    result.flags = (flagI ? 'i' : '') + (flagS ? 's' : '') + result.flags.replace(/[is]+/g, '');
  }
  return result;
}

const FlagModifierVisitor = {
  Backreference(path, state) {
    // TODO
  },
  Character(path, state) {
    // TODO
  },
  CharacterSet(path, state) {
    // TODO: Kinds: `any` (for `dotAll`), `property`, `posix`
  },
  Group: {
    enter(path, state) {
      // TODO
    },
    exit(path, state) {
      // TODO
    },
  }
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
  // TODO: Handle local and global state of `ignoreCase`
  // TODO: Throw if `!allowBestEffort` and `hasCase` and local-*only* `ignoreCase` and not ASCII A-Za-z
  // TODO: Add preceding delimiter or escape this char for things that can alter a preceding valid node
  // TODO: Escape chars that need escaping, including reserved double punctuators if in a char class
  // Unicode case folding is complicated, and this doesn't support all edge cases.
  // - Doesn't add titlecase-specific versions of chars like Serbo-Croatian 'ǅ' (U+01C5) (lcase 'ǆ', ucase 'Ǆ').
  //   - More titlecase chars: <compart.com/en/unicode/category/Lt>
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

  const char = String.fromCodePoint(value);
  if (charHasCase(char)) {
    if (state.currentFlags.ignoreCase) {
      state.hasCaseInsensitiveNode = true;
    } else {
      state.hasCaseSensitiveNode = true;
    }
  }
  let result = char;
  if (CharCodeEscapes.has(value)) {
    result = CharCodeEscapes.get(value);
  // Modeled on the Chrome developer console's display for strings
  } else if (value < 32 || (value > 126 && value < 160)) {
    result = r`\x${value.toString(16).padStart(2, '0')}`;
  }
  return result;
}

function generateFlags(node, state) {
  state.currentFlags.dotAll = node.dotAll;
  state.currentFlags.ignoreCase = node.ignoreCase;
  return (
    (node.hasIndices ? 'd' : '') +
    (node.global     ? 'g' : '') +
    (node.ignoreCase ? 'i' : '') +
    (node.multiline  ? 'm' : '') +
    (node.dotAll     ? 's' : '') +
    (node.sticky     ? 'y' : '')
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
  const emoji = TargetNum[state.target] >= TargetNum[Target.ES2024] ?
    r`\p{RGI_Emoji}` :
    // `emoji-regex-xs` is more permissive than `\p{RGI_Emoji}` since it allows overqualified and
    // underqualified emoji using a general pattern that matches all Unicode sequences that follow
    // the structure of valid emoji. That actually makes it more accurate for matching any grapheme
    emojiRegex().source;
  // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>
  return r`(?>\r\n|${emoji}|\P{M}\p{M}*)`;
}

export {
  generate,
  getOptions,
};
