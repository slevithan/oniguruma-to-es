import {TokenCharacterSetKinds, TokenGroupKinds, TokenTypes} from './tokenizer.js';
import {charHasCase, KeylessUnicodeProperties} from './unicode.js';

const AstTypes = {
  Alternative: 'Alternative',
  Assertion: 'Assertion',
  AtomicGroup: 'AtomicGroup',
  Backreference: 'Backreference',
  CapturingGroup: 'CapturingGroup',
  Character: 'Character',
  CharacterClass: 'CharacterClass',
  CharacterClassIntersection: 'CharacterClassIntersection',
  CharacterClassRange: 'CharacterClassRange',
  CharacterSet: 'CharacterSet',
  Flags: 'Flags',
  Group: 'Group',
  Pattern: 'Pattern',
  Quantifier: 'Quantifier',
  RegExp: 'RegExp',
  // Non-final representations
  ICharacter: 'ICharacter',
  ICharacterClass: 'ICharacterClass',
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

function parse({tokens, jsFlags}) {
  const context = {
    current: 0,
    walk: parent => {
      let token = tokens[context.current];
      // Advance for the next iteration
      context.current++;
      switch (token.type) {
        case TokenTypes.Alternator:
          // Only handles top-level alternation (groups handle their own)
          return createAlternative(parent.parent);
        case TokenTypes.Assertion:
          return createAssertionFromToken(parent, token);
        case TokenTypes.Backreference:
          return createBackreference(parent, token.ref);
        case TokenTypes.Character:
          // TODO: Set arg `inCaseInsensitiveCharacterClass` correctly
          return createCharacterFromToken(parent, token, jsFlags.ignoreCase, false);
        case TokenTypes.CharacterClassHyphen:
          return parseCharacterClassHyphen(context, parent, token, tokens);
        case TokenTypes.CharacterClassOpen:
          return parseCharacterClassOpen(context, parent, token, tokens, jsFlags.ignoreCase);
        case TokenTypes.CharacterSet:
          return createCharacterSetFromToken(parent, token, jsFlags.dotAll);
        case TokenTypes.GroupOpen:
          return parseGroupOpen(context, parent, token, tokens);
        case TokenTypes.Quantifier:
          return parseQuantifier(parent, token);
        default:
          throw new Error(`Unexpected token type "${token.type}"`);
      }
    },
  };
  const ast = createRegExp(createPattern(null), createFlags(null, jsFlags));
  let top = ast.pattern.alternatives[0];
  while (context.current < tokens.length) {
    const result = context.walk(top);
    if (result.type === AstTypes.Alternative) {
      ast.pattern.alternatives.push(result);
      top = result;
    } else {
      top.elements.push(result);
    }
  }
  return ast;
}

function parseCharacterClassHyphen(context, parent, token, tokens) {
  const prevNode = parent.elements.at(-1);
  const nextToken = tokens[context.current];
  if (
    prevNode &&
    prevNode.type !== AstTypes.CharacterClass &&
    nextToken &&
    nextToken.type !== TokenTypes.CharacterClassOpen &&
    nextToken.type !== TokenTypes.CharacterClassClose &&
    nextToken.type !== TokenTypes.CharacterClassIntersector
  ) {
    const nextNode = context.walk(parent);
    // No need to check `ICharacter` since the tokenizer only sets `ignoreCase` on the outer class
    if (prevNode.type === AstTypes.Character && nextNode.type === AstTypes.Character) {
      parent.elements.pop();
      const node = createCharacterClassRange(parent, prevNode, nextNode);
      prevNode.parent = node;
      nextNode.parent = node;
      return node;
    }
    throw new Error('Invalid character class range');
  }
  return createCharacterFromToken(parent, token);
}

function parseCharacterClassOpen(context, parent, token, tokens, ignoreCase) {
  const node = createCharacterClassFromToken(parent, token, ignoreCase);
  const intersection = node.elements[0];
  let nextToken = throwIfUnclosedCharacterClass(tokens[context.current]);
  while (nextToken.type !== TokenTypes.CharacterClassClose) {
    if (nextToken.type === TokenTypes.CharacterClassIntersector) {
      intersection.classes.push(createCharacterClassBase(intersection, false));
      // Skip the intersector
      context.current++;
    } else {
      const cc = intersection.classes.at(-1);
      cc.elements.push(context.walk(cc));
    }
    nextToken = throwIfUnclosedCharacterClass(tokens[context.current]);
  }
  // Simplify tree for classes that contain a single non-negated class
  for (const cc of intersection.classes) {
    const firstChild = cc.elements[0];
    if (
      cc.elements.length === 1 &&
      firstChild.type === AstTypes.CharacterClass &&
      !firstChild.negate
    ) {
      replaceElementsPropWithElementsFrom(cc, firstChild);
    }
  }
  // Simplify tree if we don't need the intersection wrapper
  if (intersection.classes.length === 1) {
    replaceElementsPropWithElementsFrom(node, intersection.classes[0]);
  }
  // Skip the closing square bracket
  context.current++;
  return node;
}

function parseGroupOpen(context, parent, token, tokens) {
  const node = createByGroupKind(parent, token);
  let nextToken = throwIfUnclosedGroup(tokens[context.current]);
  while (nextToken.type !== TokenTypes.GroupClose) {
    if (nextToken.type === TokenTypes.Alternator) {
      node.alternatives.push(createAlternative(node));
      // Skip the alternator
      context.current++;
    } else {
      const alt = node.alternatives.at(-1);
      alt.elements.push(context.walk(alt));
    }
    nextToken = throwIfUnclosedGroup(tokens[context.current]);
  }
  // Skip the closing parenthesis
  context.current++;
  return node;
}

function parseQuantifier(parent, token) {
  // First child in `Alternative`
  if (!parent.elements.length) {
    throw new Error('Nothing to repeat');
  }
  const node = createQuantifier(
    parent,
    parent.elements.at(-1),
    token.min,
    token.max,
    token.greedy,
    token.possessive
  );
  node.element.parent = node;
  parent.elements.pop();
  return node;
}

function createAlternative(parent) {
  return {
    ...getNodeBase(parent, AstTypes.Alternative),
    elements: [],
  };
}

function createAssertionFromToken(parent, token) {
  const base = getNodeBase(parent, AstTypes.Assertion);
  if (token.type === TokenTypes.GroupOpen) {
    return withInitialAlternative({
      ...base,
      kind: token.kind === TokenGroupKinds.lookbehind ?
        AstAssertionKinds.lookbehind :
        AstAssertionKinds.lookahead,
      negate: token.negate,
    });
  }
  const kind = throwIfNot({
    '^': AstAssertionKinds.line_start,
    '$': AstAssertionKinds.line_end,
    '\\A': AstAssertionKinds.string_start,
    '\\b': AstAssertionKinds.word_boundary,
    '\\B': AstAssertionKinds.word_boundary,
    '\\G': AstAssertionKinds.search_start,
    '\\z': AstAssertionKinds.string_end,
    '\\Z': AstAssertionKinds.string_end_newline,
  }[token.kind], `Unexpected assertion kind "${token.kind}"`);
  const node = {
    ...base,
    kind,
  };
  if (kind === AstAssertionKinds.word_boundary) {
    node.negate = token.kind === '\\B';
  }
  return node;
}

function createAtomicGroup(parent) {
  return withInitialAlternative(getNodeBase(parent, AstTypes.AtomicGroup));
}

function createBackreference(parent, ref) {
  return {
    ...getNodeBase(parent, AstTypes.Backreference),
    ref,
  };
}

function createByGroupKind(parent, token) {
  switch (token.kind) {
    case TokenGroupKinds.atomic:
      return createAtomicGroup(parent);
    case TokenGroupKinds.capturing:
      return createCapturingGroupFromToken(parent, token);
    case TokenGroupKinds.group:
      return createGroup(parent);
    case TokenGroupKinds.lookahead:
    case TokenGroupKinds.lookbehind:
      return createAssertionFromToken(parent, token);
    default:
      throw new Error(`Unexpected group kind "${token.kind}"`);
  }
}

function createCapturingGroupFromToken(parent, token) {
  const {number, name, ignoreCase} = token;
  const node = {
    ...getNodeBase(parent, AstTypes.CapturingGroup),
    number,
  };
  if (name) {
    node.name = name;
  }
  if (ignoreCase) {
    // Track this for subroutines that might reference the group
    // TODO: Delete the prop after handling
    node.ignoreCase = ignoreCase;
  }
  return withInitialAlternative(node);
}

function createCharacter(parent, charCode) {
  return {
    ...getNodeBase(parent, AstTypes.Character),
    value: charCode,
  };
}

// Create node from token type `Character` or `CharacterClassHyphen`
function createCharacterFromToken(parent, token, ignoreCase, inCaseInsensitiveCharacterClass) {
  const char = String.fromCodePoint(token.charCode);
  if (
    !ignoreCase &&
    (token.ignoreCase || inCaseInsensitiveCharacterClass) &&
    charHasCase(char)
  ) {
    return createICharacter(parent, char);
  }
  return createCharacter(parent, token.charCode);
}

// TODO: Transform this away
// Only used when a pattern is partially case insensitive; otherwise flag i is relied on. When mode
// modifiers are included in a pattern, determining whether to apply character-specific case
// insensitivity accounts for whether any chars with case (or backrefs) appear in case sensitive
// segments (if not, flag i is turned on for the whole pattern)
function createICharacter(parent, char) {
  // Unicode case folding is complicated, and this doesn't support all aspects of it.
  // - Ex: Doesn't derive/add titlecase versions of chars like Serbo-Croatian 'ǅ'.
  // - Ex: Doesn't handle language-specific edge cases like Turkish İ. In JS, both
  //   `/i/iv.test('İ')` and `/İ/iv.test('i')` return `false`, although lowercase `İ` is `i`.
  return {
    ...getNodeBase(parent, AstTypes.ICharacter),
    lower: char.toLowerCase(),
    upper: char.toUpperCase(),
  };
}

function createCharacterClassBase(parent, negate) {
  return {
    ...getNodeBase(parent, AstTypes.CharacterClass),
    negate,
    elements: [],
  };
}

function createCharacterClassFromToken(parent, token, ignoreCase) {
  if (!ignoreCase && token.ignoreCase) {
    return createICharacterClassFromToken(parent, token);
  }
  return withInitialIntersection(createCharacterClassBase(parent, token.negate));
}

// TODO: Transform this away
function createICharacterClassFromToken(parent, token) {
  const node = withInitialIntersection(createCharacterClassBase(parent, token.negate));
  node.type = AstTypes.ICharacterClass;
  return node;
}

function createCharacterClassIntersection(parent) {
  const intersection = getNodeBase(parent, AstTypes.CharacterClassIntersection);
  intersection.classes = [createCharacterClassBase(intersection, false)];
  return intersection;
}

function createCharacterClassRange(parent, min, max) {
  if (max.value < min.value) {
    throw new Error('Character class range out of order');
  }
  return {
    ...getNodeBase(parent, AstTypes.CharacterClassRange),
    min,
    max,
  };
}

function createCharacterSetFromToken(parent, token, dotAll) {
  const {kind} = token;
  if (kind === TokenCharacterSetKinds.any && token.dotAll && !dotAll) {
    // Negated empty char class matches any char including newlines
    return createCharacterClassBase(parent, true);
  }
  const node = {
    ...getNodeBase(parent, AstTypes.CharacterSet),
    kind: AstCharacterSetKinds[kind],
  };
  if (
    kind === TokenCharacterSetKinds.digit ||
    kind === TokenCharacterSetKinds.hex ||
    kind === TokenCharacterSetKinds.property ||
    kind === TokenCharacterSetKinds.space ||
    kind === TokenCharacterSetKinds.word
  ) {
    node.negate = token.negate;
    if (kind === TokenCharacterSetKinds.property) {
      node.property = getJsUnicodePropertyName(token.property);
    }
  }
  return node;
}

function createFlags(parent, {ignoreCase, multiline, dotAll}) {
  return {
    ...getNodeBase(parent, AstTypes.Flags),
    ignoreCase,
    multiline,
    dotAll,
    // Always add flag v because that gives us JS support for important Onig features (nested
    // classes, set intersection, Unicode properties, \u{...}) and allows relying on one set of JS
    // regex syntax (but requires translating for v's strict rules)
    unicodeSets: true,
    // JS regex flags not provided by the Onig tokenizer
    global: false,
    hasIndices: false,
    sticky: false,
    unicode: false,
  };
}

function createGroup(parent) {
  return withInitialAlternative(getNodeBase(parent, AstTypes.Group));
}

function createPattern(parent) {
  return withInitialAlternative(getNodeBase(parent, AstTypes.Pattern));
}

function createQuantifier(parent, element, min, max, greedy, possessive) {
  if (max < min) {
    throw new Error('Quantifier range out of order');
  }
  return {
    ...getNodeBase(parent, AstTypes.Quantifier),
    min,
    max,
    greedy,
    possessive,
    element,
  };
}

function createRegExp(pattern, flags) {
  return {
    ...getNodeBase(null, AstTypes.RegExp),
    pattern,
    flags,
  };
}

function getNodeBase(parent, type) {
  return {
    type,
    parent,
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
    // Try `Title_Case` last so we pass this version through in case it's a script name that's not
    // found in `KeylessUnicodeProperties`
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

function replaceElementsPropWithElementsFrom(newParent, oldParent) {
  newParent.elements = oldParent.elements;
  for (const child of newParent.elements) {
    child.parent = newParent;
  }
}

function throwIfNot(value, msg) {
  if (!value) {
    throw new Error(msg ?? 'Value expected');
  }
  return value;
}

function throwIfUnclosedCharacterClass(token) {
  return throwIfNot(token, 'Unclosed character class');
}

function throwIfUnclosedGroup(token) {
  return throwIfNot(token, 'Unclosed group');
}

function withInitialAlternative(node) {
  const alt = createAlternative(node);
  node.alternatives = [alt];
  return node;
}

function withInitialIntersection(node) {
  const intersection = createCharacterClassIntersection(node);
  node.elements = [intersection];
  return node;
}

export {
  parse,
};
