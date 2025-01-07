import {TokenCharacterSetKinds, TokenDirectiveKinds, TokenGroupKinds, TokenTypes} from './tokenize.js';
import {traverse} from './traverse.js';
import {JsUnicodePropertiesMap, JsUnicodePropertiesOfStringsMap, PosixProperties, slug} from './unicode.js';
import {getOrCreate, r, throwIfNot} from './utils.js';
import {hasOnlyChild} from './utils-ast.js';

const AstTypes = {
  Alternative: 'Alternative',
  Assertion: 'Assertion',
  Backreference: 'Backreference',
  CapturingGroup: 'CapturingGroup',
  Character: 'Character',
  CharacterClass: 'CharacterClass',
  CharacterClassIntersection: 'CharacterClassIntersection',
  CharacterClassRange: 'CharacterClassRange',
  CharacterSet: 'CharacterSet',
  Directive: 'Directive',
  Flags: 'Flags',
  Group: 'Group',
  Pattern: 'Pattern',
  Quantifier: 'Quantifier',
  Regex: 'Regex',
  Subroutine: 'Subroutine',
  VariableLengthCharacterSet: 'VariableLengthCharacterSet',
  // Used only by the transformer for Regex+ ASTs
  Recursion: 'Recursion',
};

const AstAssertionKinds = {
  line_end: 'line_end',
  line_start: 'line_start',
  lookahead: 'lookahead',
  lookbehind: 'lookbehind',
  search_start: 'search_start',
  string_end: 'string_end',
  string_end_newline: 'string_end_newline',
  string_start: 'string_start',
  word_boundary: 'word_boundary',
};

// Identical values
const AstCharacterSetKinds = TokenCharacterSetKinds;
const AstDirectiveKinds = TokenDirectiveKinds;

const AstVariableLengthCharacterSetKinds = {
  grapheme: 'grapheme',
  newline: 'newline',
};

/**
@typedef {{
  type: 'Regex';
  parent: null;
  pattern: Object;
  flags: Object;
}} OnigurumaAst
*/
/**
@param {import('./tokenize.js').TokenizerResult} tokenizerResult
@param {{
  skipBackrefValidation?: boolean;
  skipPropertyNameValidation?: boolean;
  verbose?: boolean;
}} [options]
@returns {OnigurumaAst}
*/
function parse({tokens, flags, rules}, options) {
  const opts = {
    skipBackrefValidation: false,
    skipPropertyNameValidation: false,
    verbose: false,
    ...options,
  };
  const context = {
    capturingGroups: [],
    current: 0,
    hasNumberedRef: false,
    namedGroupsByName: new Map(),
    parent: null,
    skipBackrefValidation: opts.skipBackrefValidation,
    skipPropertyNameValidation: opts.skipPropertyNameValidation,
    subroutines: [],
    token: null,
    tokens,
    verbose: opts.verbose,
    walk,
  };
  function walk(parent, state) {
    const token = tokens[context.current];
    context.parent = parent;
    context.token = token;
    // Advance for the next iteration
    context.current++;
    switch (token.type) {
      case TokenTypes.Alternator:
        // Top-level only; groups handle their own alternators
        return createAlternative();
      case TokenTypes.Assertion:
        return createAssertionFromToken(token);
      case TokenTypes.Backreference:
        return parseBackreference(context);
      case TokenTypes.Character:
        return createCharacter(token.value, {useLastValid: !!state.isCheckingRangeEnd});
      case TokenTypes.CharacterClassHyphen:
        return parseCharacterClassHyphen(context, state);
      case TokenTypes.CharacterClassOpen:
        return parseCharacterClassOpen(context, state);
      case TokenTypes.CharacterSet:
        return parseCharacterSet(context);
      case TokenTypes.Directive:
        return createDirectiveFromToken(token);
      case TokenTypes.GroupOpen:
        return parseGroupOpen(context, state);
      case TokenTypes.Quantifier:
        return parseQuantifier(context);
      case TokenTypes.Subroutine:
        return parseSubroutine(context);
      case TokenTypes.VariableLengthCharacterSet:
        return createVariableLengthCharacterSet(token.kind);
      default:
        throw new Error(`Unexpected token type "${token.type}"`);
    }
  }
  const ast = createRegex(createPattern(), createFlags(flags));
  let top = ast.pattern.alternatives[0];
  while (context.current < tokens.length) {
    const node = walk(top, {});
    if (node.type === AstTypes.Alternative) {
      ast.pattern.alternatives.push(node);
      top = node;
    } else {
      top.elements.push(node);
    }
  }
  // `context` updated by preceding `walk` loop
  const {capturingGroups, hasNumberedRef, namedGroupsByName, subroutines} = context;
  // Validation that requires knowledge about the complete pattern
  if (hasNumberedRef && namedGroupsByName.size && !rules.captureGroup) {
    throw new Error('Numbered backref/subroutine not allowed when using named capture');
  }
  for (const {ref} of subroutines) {
    if (typeof ref === 'number') {
      // Relative nums are already resolved
      if (ref > capturingGroups.length) {
        throw new Error(`Subroutine uses a group number that's not defined`);
      }
    } else if (!namedGroupsByName.has(ref)) {
      throw new Error(r`Subroutine uses a group name that's not defined "\g<${ref}>"`);
    } else if (namedGroupsByName.get(ref).length > 1) {
      throw new Error(r`Subroutine uses a duplicate group name "\g<${ref}>"`);
    }
  }
  // Add `parent` properties now that we have a final AST
  traverse({node: ast}, null, {
    AnyNode({node, parent}) {
      node.parent = parent;
    },
  });
  return ast;
}

// Supported (if the backref appears to the right of the reffed capture's opening paren):
// - `\k<name>`, `\k'name'`
// - When named capture not used:
//   - `\n`, `\nn`, `\nnn`
//   - `\k<n>`, `\k'n'
//   - `\k<-n>`, `\k'-n'`
// Unsupported:
// - `\k<+n>`, `\k'+n'` - Note that, Unlike Oniguruma, Onigmo doesn't support this as special
//   syntax and therefore considers it a valid group name.
// - Backref with recursion level (with num or name): `\k<n+level>`, `\k<n-level>`, etc.
//   (Onigmo also supports `\k<-n+level>`, `\k<-n-level>`, etc.)
// Backrefs in Onig use multiplexing for duplicate group names (the rules can be complicated when
// overlapping with subroutines), but a `Backreference`'s simple `ref` prop doesn't capture these
// details so multiplexed ref pointers need to be derived when working with the AST
function parseBackreference(context) {
  const {raw} = context.token;
  const hasKWrapper = /^\\k[<']/.test(raw);
  const ref = hasKWrapper ? raw.slice(3, -1) : raw.slice(1);
  const fromNum = (num, isRelative = false) => {
    const numCapturesToLeft = context.capturingGroups.length;
    let orphan = false;
    // Note: It's not an error for numbered backrefs to come before their referenced group in Onig,
    // but an error is the best path for this library because:
    // 1. Most placements are mistakes and can never match (based on the Onig behavior for backrefs
    //    to nonparticipating groups).
    // 2. Erroring matches the behavior of named backrefs.
    // 3. The edge cases where they're matchable rely on rules for backref resetting within
    //    quantified groups that are different in JS and aren't emulatable. Note that it's not a
    //    backref in the first place if using `\10` or higher and not as many capturing groups are
    //    defined to the left (it's an octal or identity escape).
    // [TODO] Ideally this would be refactored to include the backref in the AST when it's not an
    // error in Onig (due to the reffed group being defined to the right), and the error handling
    // would move to the transformer
    if (num > numCapturesToLeft) {
      // [WARNING] Skipping the error breaks assumptions and might create edge case issues, since
      // backrefs are required to come after their captures; unfortunately this option is needed
      // for TextMate grammars
      if (context.skipBackrefValidation) {
        orphan = true;
      } else {
        throw new Error(`Not enough capturing groups defined to the left "${raw}"`);
      }
    }
    context.hasNumberedRef = true;
    return createBackreference(isRelative ? numCapturesToLeft + 1 - num : num, {orphan});
  };
  if (hasKWrapper) {
    const numberedRef = /^(?<sign>-?)0*(?<num>[1-9]\d*)$/.exec(ref);
    if (numberedRef) {
      return fromNum(+numberedRef.groups.num, !!numberedRef.groups.sign);
    }
    // Invalid in a backref name even when valid in a group name
    if (/[-+]/.test(ref)) {
      throw new Error(`Invalid backref name "${raw}"`);
    }
    if (!context.namedGroupsByName.has(ref)) {
      throw new Error(`Group name not defined to the left "${raw}"`);
    }
    return createBackreference(ref);
  }
  return fromNum(+ref);
}

function parseCharacterClassHyphen(context, state) {
  const {parent, tokens, walk} = context;
  const prevSiblingNode = parent.elements.at(-1);
  const nextToken = tokens[context.current];
  if (
    !state.isCheckingRangeEnd &&
    prevSiblingNode &&
    prevSiblingNode.type !== AstTypes.CharacterClass &&
    prevSiblingNode.type !== AstTypes.CharacterClassRange &&
    nextToken &&
    nextToken.type !== TokenTypes.CharacterClassOpen &&
    nextToken.type !== TokenTypes.CharacterClassClose &&
    nextToken.type !== TokenTypes.CharacterClassIntersector
  ) {
    const nextNode = walk(parent, {
      isCheckingRangeEnd: true,
      ...state,
    });
    if (prevSiblingNode.type === AstTypes.Character && nextNode.type === AstTypes.Character) {
      parent.elements.pop();
      return createCharacterClassRange(prevSiblingNode, nextNode);
    }
    throw new Error('Invalid character class range');
  }
  // Literal hyphen
  return createCharacter(45);
}

function parseCharacterClassOpen(context, state) {
  const {token, tokens, verbose, walk} = context;
  const firstClassToken = tokens[context.current];
  let node = createCharacterClass({negate: token.negate});
  const intersection = node.elements[0];
  let nextToken = throwIfUnclosedCharacterClass(firstClassToken);
  while (nextToken.type !== TokenTypes.CharacterClassClose) {
    if (nextToken.type === TokenTypes.CharacterClassIntersector) {
      intersection.classes.push(createCharacterClass({negate: false, baseOnly: true}));
      // Skip the intersector
      context.current++;
    } else {
      const cc = intersection.classes.at(-1);
      cc.elements.push(walk(cc, state));
    }
    nextToken = throwIfUnclosedCharacterClass(tokens[context.current], firstClassToken);
  }
  if (!verbose) {
    optimizeCharacterClassIntersection(intersection);
  }
  // Simplify tree if we don't need the intersection wrapper
  if (intersection.classes.length === 1) {
    const cc = intersection.classes[0];
    // Only needed if `!verbose`; otherwise an intersection's direct kids are never negated
    cc.negate = node.negate !== cc.negate;
    node = cc;
  }
  // Skip the closing square bracket
  context.current++;
  return node;
}

function parseCharacterSet({token, skipPropertyNameValidation}) {
  let {kind, negate, value} = token;
  if (kind === TokenCharacterSetKinds.property) {
    const normalized = slug(value);
    if (PosixProperties.has(normalized)) {
      kind = TokenCharacterSetKinds.posix;
      value = normalized;
    } else {
      return createUnicodeProperty(value, {
        negate,
        skipPropertyNameValidation,
      });
    }
  }
  if (kind === TokenCharacterSetKinds.posix) {
    return {
      type: AstTypes.CharacterSet,
      kind: AstCharacterSetKinds.posix,
      negate,
      value,
    };
  }
  return createCharacterSet(kind, {negate});
}

function parseGroupOpen(context, state) {
  const {token, tokens, capturingGroups, namedGroupsByName, verbose, walk} = context;
  let node = createByGroupKind(token);
  // Track capturing group details for backrefs and subroutines (before parsing the group's
  // contents so nested groups with the same name are tracked in order)
  if (node.type === AstTypes.CapturingGroup) {
    capturingGroups.push(node);
    if (node.name) {
      getOrCreate(namedGroupsByName, node.name, []).push(node);
    }
  }
  let nextToken = throwIfUnclosedGroup(tokens[context.current]);
  while (nextToken.type !== TokenTypes.GroupClose) {
    if (nextToken.type === TokenTypes.Alternator) {
      node.alternatives.push(createAlternative());
      // Skip the alternator
      context.current++;
    } else {
      const alt = node.alternatives.at(-1);
      alt.elements.push(walk(alt, state));
    }
    nextToken = throwIfUnclosedGroup(tokens[context.current]);
  }
  if (!verbose) {
    node = getOptimizedGroup(node);
  }
  // Skip the closing parenthesis
  context.current++;
  return node;
}

function parseQuantifier({token, parent}) {
  const {min, max, greedy, possessive} = token;
  const quantifiedNode = parent.elements.at(-1);
  if (
    !quantifiedNode ||
    quantifiedNode.type === AstTypes.Assertion ||
    quantifiedNode.type === AstTypes.Directive
  ) {
    throw new Error(`Quantifier requires a repeatable token`);
  }
  const node = createQuantifier(quantifiedNode, min, max, greedy, possessive);
  parent.elements.pop();
  return node;
}

// Onig subroutine behavior:
// - Subroutines can appear before the groups they reference; ex: `\g<1>(a)` is valid.
// - Multiple subroutines can reference the same group.
// - Subroutines can reference groups that themselves contain subroutines, followed to any depth.
// - Subroutines can be used recursively, and `\g<0>` recursively references the whole pattern.
// - Subroutines can use relative references (backward or forward); ex: `\g<+1>(.)\g<-1>`.
// - Subroutines don't get their own capturing group numbers; ex: `(.)\g<1>\2` is invalid.
// - Subroutines use the flags that apply to their referenced group, so e.g.
//   `(?-i)(?<a>a)(?i)\g<a>` is fully case sensitive.
// - Differences from PCRE/Perl/Regex+ subroutines:
//   - Subroutines can't reference duplicate group names (though duplicate names are valid if no
//     subroutines reference them).
//   - Subroutines can't use absolute or relative numbers if named capture is used anywhere.
//   - Named backrefs must be to the right of their group definition, so the backref in
//     `\g<a>\k<a>(?<a>)` is invalid (not directly related to subroutines).
//   - Subroutines don't restore capturing group match values (for backrefs) upon exit, so e.g.
//     `(?<a>(?<b>[ab]))\g<a>\k<b>` matches `abb` but not `aba`; same for numbered.
// The interaction of backref multiplexing (an Onig-specific feature) and subroutines is complex:
// - Only the most recent value matched by a capturing group and its subroutines is considered for
//   backref multiplexing, and this also applies to capturing groups nested within a group that's
//   referenced by a subroutine.
// - Although a subroutine can't reference a group with a duplicate name, it can reference a group
//   with a nested capture whose name is duplicated (e.g. outside of the referenced group).
//   - These duplicate names can then multiplex; but only the most recent value matched from within
//     the outer group (or the subroutines that reference it) is available for multiplexing.
//   - Ex: With `(?<a>(?<b>[123]))\g<a>\g<a>(?<b>0)\k<b>`, the backref `\k<b>` can only match `0`
//     or whatever was matched by the most recently matched subroutine. If you took out `(?<b>0)`,
//     no multiplexing would occur.
function parseSubroutine(context) {
  const {token, capturingGroups, subroutines} = context;
  let ref = token.raw.slice(3, -1);
  const numberedRef = /^(?<sign>[-+]?)0*(?<num>[1-9]\d*)$/.exec(ref);
  if (numberedRef) {
    const num = +numberedRef.groups.num;
    const numCapturesToLeft = capturingGroups.length;
    context.hasNumberedRef = true;
    ref = {
      '': num,
      '+': numCapturesToLeft + num,
      '-': numCapturesToLeft + 1 - num,
    }[numberedRef.groups.sign];
    if (ref < 1) {
      throw new Error('Invalid subroutine number');
    }
  // Special case for full-pattern recursion; can't be `+0`, `-0`, `00`, etc.
  } else if (ref === '0') {
    ref = 0;
  }
  const node = createSubroutine(ref);
  subroutines.push(node);
  return node;
}

function createAlternative() {
  return {
    type: AstTypes.Alternative,
    elements: [],
  };
}

function createAssertionFromToken({type, kind, negate}) {
  if (type === TokenTypes.GroupOpen) {
    return createLookaround({
      behind: kind === TokenGroupKinds.lookbehind,
      negate,
    });
  }
  const nodeKind = throwIfNot({
    '^': AstAssertionKinds.line_start,
    '$': AstAssertionKinds.line_end,
    '\\A': AstAssertionKinds.string_start,
    '\\b': AstAssertionKinds.word_boundary,
    '\\B': AstAssertionKinds.word_boundary,
    '\\G': AstAssertionKinds.search_start,
    '\\z': AstAssertionKinds.string_end,
    '\\Z': AstAssertionKinds.string_end_newline,
  }[kind], `Unexpected assertion kind "${kind}"`);
  const node = {
    type: AstTypes.Assertion,
    kind: nodeKind,
  };
  if (nodeKind === AstAssertionKinds.word_boundary) {
    node.negate = kind === r`\B`;
  }
  return node;
}

function createBackreference(ref, options) {
  const orphan = !!options?.orphan;
  return {
    type: AstTypes.Backreference,
    ...(orphan && {orphan}),
    ref,
  };
}

function createByGroupKind(token) {
  const {kind, number, name, flags} = token;
  switch (kind) {
    case TokenGroupKinds.atomic:
      return createGroup({atomic: true});
    case TokenGroupKinds.capturing:
      return createCapturingGroup(number, name);
    case TokenGroupKinds.group:
      return createGroup({flags});
    case TokenGroupKinds.lookahead:
    case TokenGroupKinds.lookbehind:
      return createAssertionFromToken(token);
    default:
      throw new Error(`Unexpected group kind "${kind}"`);
  }
}

function createCapturingGroup(number, name) {
  const hasName = name !== undefined;
  if (hasName && !isValidGroupNameOniguruma(name)) {
    throw new Error(`Group name "${name}" invalid in Oniguruma`);
  }
  return {
    type: AstTypes.CapturingGroup,
    number,
    ...(hasName && {name}),
    alternatives: [createAlternative()],
  };
}

function createCharacter(charCode, options) {
  const opts = {
    useLastValid: false,
    ...options,
  };
  if (charCode > 0x10FFFF) {
    const hex = charCode.toString(16);
    if (opts.useLastValid) {
      charCode = 0x10FFFF;
    } else if (charCode > 0x13FFFF) {
      throw new Error(`Invalid code point out of range "\\x{${hex}}"`);
    } else {
      throw new Error(`Invalid code point out of range in JS "\\x{${hex}}"`);
    }
  }
  return {
    type: AstTypes.Character,
    value: charCode,
  };
}

function createCharacterClass(options) {
  const opts = {
    baseOnly: false,
    negate: false,
    ...options,
  };
  return {
    type: AstTypes.CharacterClass,
    negate: opts.negate,
    elements: opts.baseOnly ? [] : [createCharacterClassIntersection()],
  };
}

function createCharacterClassIntersection() {
  return {
    type: AstTypes.CharacterClassIntersection,
    classes: [createCharacterClass({negate: false, baseOnly: true})],
  };
}

function createCharacterClassRange(min, max) {
  if (max.value < min.value) {
    throw new Error('Character class range out of order');
  }
  return {
    type: AstTypes.CharacterClassRange,
    min,
    max,
  };
}

function createCharacterSet(kind, {negate}) {
  const node = {
    type: AstTypes.CharacterSet,
    kind: throwIfNot(AstCharacterSetKinds[kind], `Unexpected character set kind "${kind}"`),
  };
  if (
    kind === TokenCharacterSetKinds.digit ||
    kind === TokenCharacterSetKinds.hex ||
    kind === TokenCharacterSetKinds.space ||
    kind === TokenCharacterSetKinds.word
  ) {
    node.negate = negate;
  }
  return node;
}

function createDirectiveFromToken({kind, flags}) {
  const node = {
    type: AstTypes.Directive,
    kind: throwIfNot(AstDirectiveKinds[kind], `Unexpected directive kind "${kind}"`),
  };
  // Can't optimize by simply creating a `Group` with a `flags` prop and wrapping the remainder of
  // the open group or pattern in it, because the flag modifier's effect might extend across
  // alternation. Ex: `a(?i)b|c` is equivalent to `a(?i:b)|(?i:c)`, not `a(?i:b|c)`
  if (kind === TokenDirectiveKinds.flags) {
    node.flags = flags;
  }
  return node;
}

function createFlags({ignoreCase, dotAll, extended, digitIsAscii, spaceIsAscii, wordIsAscii}) {
  return {
    type: AstTypes.Flags,
    ignoreCase,
    dotAll,
    extended,
    digitIsAscii,
    spaceIsAscii,
    wordIsAscii,
  };
}

function createGroup(options) {
  const atomic = options?.atomic;
  const flags = options?.flags;
  return {
    type: AstTypes.Group,
    ...(atomic && {atomic}),
    ...(flags && {flags}),
    alternatives: [createAlternative()],
  };
}

function createLookaround(options) {
  const opts = {
    behind: false,
    negate: false,
    ...options,
  };
  return {
    type: AstTypes.Assertion,
    kind: opts.behind ? AstAssertionKinds.lookbehind : AstAssertionKinds.lookahead,
    negate: opts.negate,
    alternatives: [createAlternative()],
  };
}

function createPattern() {
  return {
    type: AstTypes.Pattern,
    alternatives: [createAlternative()],
  };
}

function createQuantifier(element, min, max, greedy, possessive) {
  const node = {
    type: AstTypes.Quantifier,
    min,
    max,
    greedy,
    possessive,
    element,
  };
  if (max < min) {
    return {
      ...node,
      min: max,
      max: min,
      possessive: true,
    };
  }
  return node;
}

function createRegex(pattern, flags) {
  return {
    type: AstTypes.Regex,
    pattern,
    flags,
  };
}

function createSubroutine(ref) {
  return {
    type: AstTypes.Subroutine,
    ref,
  };
}

function createUnicodeProperty(value, options) {
  const opts = {
    negate: false,
    skipPropertyNameValidation: false,
    ...options,
  };
  return {
    type: AstTypes.CharacterSet,
    kind: AstCharacterSetKinds.property,
    value: opts.skipPropertyNameValidation ? value : getJsUnicodePropertyName(value),
    negate: opts.negate,
  }
}

function createVariableLengthCharacterSet(kind) {
  return {
    type: AstTypes.VariableLengthCharacterSet,
    kind: throwIfNot({
      '\\R': AstVariableLengthCharacterSetKinds.newline,
      '\\X': AstVariableLengthCharacterSetKinds.grapheme,
    }[kind], `Unexpected varcharset kind "${kind}"`),
  };
}

// Unlike Onig, JS Unicode property names are case sensitive, don't ignore spaces, hyphens, and
// underscores, and require underscores in specific positions
function getJsUnicodePropertyName(value) {
  const slugged = slug(value);
  if (JsUnicodePropertiesOfStringsMap.has(slugged)) {
    // Variable-length properties of strings aren't supported by Onig
    throw new Error(r`Unicode property "\p{${value}}" unsupported in Oniguruma`);
  }
  const jsName = JsUnicodePropertiesMap.get(slugged);
  if (jsName) {
    return jsName;
  }
  // Assume it's a script name (avoids including heavyweight data for long list of script names);
  // JS requires formatting `Like_This`, so use best effort to reformat the name (covers a lot, but
  // isn't able to map for all possible formatting differences)
  return value.
    trim().
    replace(/[- _]+/g, '_').
    replace(/[A-Z][a-z]+(?=[A-Z])/g, '$&_'). // `PropertyName` to `Property_Name`
    replace(/[A-Za-z]+/g, m => m[0].toUpperCase() + m.slice(1).toLowerCase());
}

// If a direct child group is needlessly nested, return it instead (after modifying it)
function getOptimizedGroup(node) {
  const firstAltFirstEl = node.alternatives[0].elements[0];
  if (
    node.type === AstTypes.Group &&
    hasOnlyChild(node, kid => kid.type === AstTypes.Group) &&
    !(node.atomic && firstAltFirstEl.flags) &&
    !(node.flags && (firstAltFirstEl.atomic || firstAltFirstEl.flags))
  ) {
    if (node.atomic) {
      firstAltFirstEl.atomic = true;
    } else if (node.flags) {
      firstAltFirstEl.flags = node.flags;
    }
    return firstAltFirstEl;
  }
  return node;
}

function isValidGroupNameOniguruma(name) {
  return !/^(?:[-\d]|$)/.test(name);
}

// For any intersection classes that contain only a class, swap the parent with its (modded) child
function optimizeCharacterClassIntersection(intersection) {
  for (let i = 0; i < intersection.classes.length; i++) {
    const cc = intersection.classes[i];
    const firstChild = cc.elements[0];
    if (cc.elements.length === 1 && firstChild.type === AstTypes.CharacterClass) {
      intersection.classes[i] = firstChild;
      firstChild.negate = cc.negate !== firstChild.negate;
    }
  }
}

function throwIfUnclosedCharacterClass(token, firstClassToken) {
  return throwIfNot(
    token,
    // Easier to understand error when applicable
    `${firstClassToken?.value === 93 ? 'Empty' : 'Unclosed'} character class`
  );
}

function throwIfUnclosedGroup(token) {
  return throwIfNot(token, 'Unclosed group');
}

export {
  AstAssertionKinds,
  AstCharacterSetKinds,
  AstDirectiveKinds,
  AstTypes,
  AstVariableLengthCharacterSetKinds,
  createAlternative,
  createBackreference,
  createCapturingGroup,
  createCharacter,
  createCharacterClass,
  createCharacterClassIntersection,
  createCharacterClassRange,
  createCharacterSet,
  createFlags,
  createGroup,
  createLookaround,
  createPattern,
  createQuantifier,
  createRegex,
  createSubroutine,
  createUnicodeProperty,
  createVariableLengthCharacterSet,
  parse,
};
