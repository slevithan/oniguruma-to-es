import {TokenGroupKinds, TokenTypes} from './tokenizer.js';
import {charHasCase} from './unicode.js';

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
  Flags: 'Flags',
  Group: 'Group',
  Pattern: 'Pattern',
  RegExp: 'RegExp',
  // Non-final representations
  ICharacter: 'ICharacter',
  ICharacterClass: 'ICharacterClass',
};

const AstAssertionKinds = {
  lookahead: 'lookahead',
  lookbehind: 'lookbehind',
};

// TODO: See if the extra args are needed
function parse({tokens, jsFlags, numCaptures, captureNames}) {
  const context = {
    current: 0,
    ignoreCase: jsFlags.ignoreCase,
    walk: parent => {
      let token = tokens[context.current];
      // Advance for the next iteration
      context.current++;
      switch (token.type) {
        case TokenTypes.ALTERNATOR:
          // Only handles top-level alternation (groups handle their own)
          return createAlternative(parent.parent);
        case TokenTypes.BACKREF:
          return createBackreference(parent, token.ref);
        case TokenTypes.CC_HYPHEN:
          return parseCharacterClassHyphen(context, parent, token, tokens);
        case TokenTypes.CC_OPEN:
          return parseCharacterClassOpen(context, parent, token, tokens);
        case TokenTypes.CHAR:
          // TODO: Set arg `inCaseInsensitiveCharacterClass` correctly
          return createCharacterFromToken(parent, token, context.ignoreCase, false);
        case TokenTypes.GROUP_OPEN:
          return parseGroupOpen(context, parent, token, tokens);
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
    nextToken.type !== TokenTypes.CC_OPEN &&
    nextToken.type !== TokenTypes.CC_CLOSE &&
    nextToken.type !== TokenTypes.CC_INTERSECTOR
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

function parseCharacterClassOpen(context, parent, token, tokens) {
  const node = createCharacterClassFromToken(parent, token, context.ignoreCase);
  const intersection = node.elements[0];
  let nextToken = throwIfUnclosedCharacterClass(tokens[context.current]);
  while (nextToken.type !== TokenTypes.CC_CLOSE) {
    if (nextToken.type === TokenTypes.CC_INTERSECTOR) {
      intersection.classes.push(createCharacterClassIntersectionChildClass(intersection));
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
  while (nextToken.type !== TokenTypes.GROUP_CLOSE) {
    if (nextToken.type === TokenTypes.ALTERNATOR) {
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

function createAlternative(parent) {
  return {
    ...getNodeBase(parent, AstTypes.Alternative),
    elements: [],
  };
}

function createAssertionFromToken(parent, token) {
  if (token.type === TokenTypes.GROUP_OPEN) {
    return withInitialAlternative({
      ...getNodeBase(parent, AstTypes.Assertion),
      kind: token.kind === TokenGroupKinds.LOOKBEHIND ?
        AstAssertionKinds.lookbehind :
        AstAssertionKinds.lookahead,
      negate: token.negate,
    });
  }
  // TODO: Add remaining assertion types
  throw new Error(`Unexpected assertion type ${token.type}`);
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
    case TokenGroupKinds.ATOMIC:
      return createAtomicGroup(parent);
    case TokenGroupKinds.CAPTURING:
      return createCapturingGroupFromToken(parent, token);
    case TokenGroupKinds.GROUP:
      return createGroup(parent);
    case TokenGroupKinds.LOOKAHEAD:
    case TokenGroupKinds.LOOKBEHIND:
      return createAssertionFromToken(parent, token);
    default:
      throw new Error(`Unexpected group kind "${token.kind}"`);
  }
}

function createCapturingGroupFromToken(parent, token) {
  return withInitialAlternative({
    ...getNodeBase(parent, AstTypes.CapturingGroup),
    number: token.number,
    ...(token.name ? {name: token.name} : null),
    // Track this for subroutines that might reference the group [TODO]
    ignoreCase: token.ignoreCase,
  });
}

function createCharacter(parent, charCode) {
  return {
    ...getNodeBase(parent, AstTypes.Character),
    value: charCode,
  };
}

// Create node from token type `CHAR` or `CC_HYPHEN`
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

function createCharacterClassFromToken(parent, token, ignoreCase) {
  if (!ignoreCase && token.ignoreCase) {
    return createICharacterClassFromToken(parent, token);
  }
  return withInitialCharacterClassIntersection({
    ...getNodeBase(parent, AstTypes.CharacterClass),
    negate: token.negate,
  });
}

// TODO: Transform this away
function createICharacterClassFromToken(parent, token) {
  return withInitialCharacterClassIntersection({
    ...getNodeBase(parent, AstTypes.ICharacterClass),
    negate: token.negate,
  });
}

function createCharacterClassIntersection(parent) {
  const intersection = getNodeBase(parent, AstTypes.CharacterClassIntersection);
  intersection.classes = [createCharacterClassIntersectionChildClass(intersection)];
  return intersection;
}

function createCharacterClassIntersectionChildClass(parent) {
  return {
    ...getNodeBase(parent, AstTypes.CharacterClass),
    negate: false,
    elements: [],
  };
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

function replaceElementsPropWithElementsFrom(newParent, oldParent) {
  newParent.elements = oldParent.elements;
  for (const child of newParent.elements) {
    child.parent = newParent;
  }
}

function throwIfUnclosedCharacterClass(token) {
  if (!token) {
    throw new Error('Unclosed character class');
  }
  return token;
}

function throwIfUnclosedGroup(token) {
  if (!token) {
    throw new Error('Unclosed group');
  }
  return token;
}

function withInitialAlternative(node) {
  const alt = createAlternative(node);
  node.alternatives = [alt];
  return node;
}

function withInitialCharacterClassIntersection(node) {
  const intersection = createCharacterClassIntersection(node);
  node.elements = [intersection];
  return node;
}

export {
  parse,
};
