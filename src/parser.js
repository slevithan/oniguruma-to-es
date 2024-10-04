import {TokenCharacterSetKinds, TokenDirectiveKinds, TokenGroupKinds, TokenTypes} from './tokenizer.js';
import {charHasCase, KeylessUnicodeProperties} from './unicode.js';

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
  RegExp: 'RegExp',
  VariableLengthCharacterSet: 'VariableLengthCharacterSet',
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
  newline: 'newline',
  grapheme: 'grapheme',
};

function parse({tokens, jsFlags, captureNames}, {optimize} = {}) {
  const context = {
    optimize,
    current: 0,
    capturingNodes: new Map(),
    numCapturesToLeft: 0,
    walk: parent => {
      let token = tokens[context.current];
      // Advance for the next iteration
      context.current++;
      switch (token.type) {
        case TokenTypes.Alternator:
          // Only handles top-level alternation; groups handle their own alternators
          return createAlternative(parent.parent);
        case TokenTypes.Assertion:
          return createAssertionFromToken(parent, token);
        case TokenTypes.Backreference:
          return parseBackreference(context, parent, token, !!captureNames.length, jsFlags.ignoreCase);
        case TokenTypes.Character:
          // TODO: Set arg `inCaseInsensitiveCharacterClass` correctly
          return createCharacterFromToken(parent, token, jsFlags.ignoreCase, false);
        case TokenTypes.CharacterClassHyphen:
          return parseCharacterClassHyphen(context, parent, token, tokens);
        case TokenTypes.CharacterClassOpen:
          return parseCharacterClassOpen(context, parent, token, tokens, jsFlags.ignoreCase);
        case TokenTypes.CharacterSet:
          return createCharacterSetFromToken(parent, token, jsFlags.dotAll);
        case TokenTypes.Directive:
          return createDirective(parent, token.kind);
        case TokenTypes.GroupOpen:
          return parseGroupOpen(context, parent, token, tokens);
        case TokenTypes.Quantifier:
          return parseQuantifier(parent, token);
        case TokenTypes.VariableLengthCharacterSet:
          return createVariableLengthCharacterSet(parent, token.kind);
        default:
          throw new Error(`Unexpected token type "${token.type}"`);
      }
    },
  };
  const ast = createRegExp(createPattern(null), createFlags(null, jsFlags));
  let top = ast.pattern.alternatives[0];
  while (context.current < tokens.length) {
    const node = context.walk(top);
    if (node.type === AstTypes.Alternative) {
      ast.pattern.alternatives.push(node);
      top = node;
    } else {
      top.elements.push(node);
    }
  }
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
function parseBackreference(context, parent, token, hasNamedCapture, flagIgnoreCase) {
  const {numCapturesToLeft, capturingNodes} = context;
  const {raw, ignoreCase} = token;
  const ignoreCaseArgs = [ignoreCase, flagIgnoreCase];
  const hasKWrapper = /^\\k[<']/.test(raw);
  const ref = hasKWrapper ? raw.slice(3, -1) : raw.slice(1);
  const fromNum = (num, isRelative = false) => {
    if (num > numCapturesToLeft) {
      throw new Error(`Not enough capturing groups defined to the left: "${raw}"`);
    }
    return createBackreference(parent, [
      capturingNodes.get(isRelative ? numCapturesToLeft + 1 - num : num).node
    ], ...ignoreCaseArgs);
  };
  if (hasKWrapper) {
    const numberedRef = /^(?<relative>-)?0*(?<num>[1-9]\d*)$/.exec(ref);
    if (numberedRef) {
      if (hasNamedCapture) {
        throw new Error(`Numbered backref not allowed when using named capture: "${raw}"`);
      }
      return fromNum(+numberedRef.groups.num, !!numberedRef.groups.relative);
    } else {
      if (/[-+]/.test(ref)) {
        throw new Error(`Invalid backref name: "${raw}"`);
      }
      // TODO: Convert invalid JS group names to a generated valid value
      if (!capturingNodes.has(ref)) {
        throw new Error(`Group name not defined to the left: "${raw}"`);
      }
      return createBackreference(parent, capturingNodes.get(ref).map(({node}) => node), ...ignoreCaseArgs);
    }
  }
  return fromNum(+ref);
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

function parseCharacterClassOpen(context, parent, token, tokens, flagIgnoreCase) {
  let node = createCharacterClassFromToken(parent, token, flagIgnoreCase);
  const intersection = node.elements[0];
  let nextToken = throwIfUnclosedCharacterClass(tokens[context.current]);
  while (nextToken.type !== TokenTypes.CharacterClassClose) {
    if (nextToken.type === TokenTypes.CharacterClassIntersector) {
      intersection.classes.push(createCharacterClassBase(intersection));
      // Skip the intersector
      context.current++;
    } else {
      const cc = intersection.classes.at(-1);
      cc.elements.push(context.walk(cc));
    }
    nextToken = throwIfUnclosedCharacterClass(tokens[context.current]);
  }
  if (context.optimize) {
    // TODO: Move logic out
    for (let i = 0; i < intersection.classes.length; i++) {
      const cc = intersection.classes[i];
      const firstChild = cc.elements[0];
      if (cc.elements.length === 1 && firstChild.type === AstTypes.CharacterClass) {
        intersection.classes[i] = firstChild;
        firstChild.parent = intersection;
        firstChild.negate = cc.negate !== firstChild.negate;
      }
    }
  }
  // Simplify tree if we don't need the intersection wrapper
  if (intersection.classes.length === 1) {
    const cc = intersection.classes[0];
    cc.parent = parent;
    // Only needed if `optimize` is on; otherwise an intersection's direct kids are never negated
    cc.negate = node.negate !== cc.negate;
    node = cc;
  }
  // Skip the closing square bracket
  context.current++;
  return node;
}

function parseGroupOpen(context, parent, token, tokens) {
  let node = createByGroupKind(parent, token);

  // Track capturing group details for backrefs and subroutines. Track before parsing the group's
  // contents so that nested groups with the same name are tracked in order
  if (node.type === AstTypes.CapturingGroup) {
    const nodeWithDetails = {
      node,
      // Track for subroutines that might reference the group
      ignoreCase: token.ignoreCase, // TODO: Handle `ignoreCase` for subroutines (elsewhere)
    };
    if (node.name) {
      if (!context.capturingNodes.has(node.name)) {
        context.capturingNodes.set(node.name, []);
      }
      context.capturingNodes.get(node.name).push(nodeWithDetails);
    } else {
      context.capturingNodes.set(node.number, nodeWithDetails);
    }
    context.numCapturesToLeft++;
  }

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

  if (context.optimize) {
    // TODO: Move `if` logic out
    const firstAlt = node.alternatives[0];
    const firstEl = firstAlt.elements[0];
    if (
      node.alternatives.length === 1 &&
      node.type === AstTypes.Group &&
      firstAlt.elements.length === 1 &&
      firstEl.type === AstTypes.Group
    ) {
      firstEl.parent = node.parent;
      firstEl.atomic ||= node.atomic;
      node = firstEl;
    }
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

function createBackreference(parent, refs, tokenIgnoreCase, flagIgnoreCase) {
  const node = {
    ...getNodeBase(parent, AstTypes.Backreference),
    refs,
  };
  if (!flagIgnoreCase && tokenIgnoreCase) {
    // Only used when a pattern is partially case insensitive; otherwise flag i is relied on
    node.ignoreCase = true;
  }
  return node;
}

function createByGroupKind(parent, token) {
  const {kind, number, name} = token;
  switch (kind) {
    case TokenGroupKinds.atomic:
      return createGroup(parent, true);
    case TokenGroupKinds.capturing:
      return createCapturingGroup(parent, number, name);
    case TokenGroupKinds.group:
      return createGroup(parent);
    case TokenGroupKinds.lookahead:
    case TokenGroupKinds.lookbehind:
      return createAssertionFromToken(parent, token);
    default:
      throw new Error(`Unexpected group kind "${kind}"`);
  }
}

function createCapturingGroup(parent, number, name) {
  const node = {
    ...getNodeBase(parent, AstTypes.CapturingGroup),
    number,
  };
  if (name !== undefined) {
    if (/^(?:[-\d]|$)/.test(name)) {
      throw new Error(`Invalid group name: "${name}"`);
    }
    // TODO: Convert invalid JS group names to a generated valid value
    node.name = name;
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
function createCharacterFromToken(parent, token, flagIgnoreCase, inCaseInsensitiveCharacterClass) {
  const {charCode} = token;
  const node = createCharacter(parent, charCode);
  if (
    !flagIgnoreCase &&
    (token.ignoreCase || inCaseInsensitiveCharacterClass) &&
    charHasCase(String.fromCodePoint(charCode))
  ) {
    // Only used when a pattern is partially case insensitive; otherwise flag i is relied on. When
    // mode modifiers are included in a pattern, determining whether to apply character-specific
    // case insensitivity accounts for whether any chars with case (or backrefs) appear in case
    // sensitive segments (if not, flag i is turned on for the whole pattern)
    node.ignoreCase = true;
  }
  return node;
}

function createCharacterClassBase(parent, negate = false) {
  return {
    ...getNodeBase(parent, AstTypes.CharacterClass),
    negate,
    elements: [],
  };
}

function createCharacterClassFromToken(parent, token, flagIgnoreCase) {
  const node = createCharacterClassBase(parent, token.negate);
  if (!flagIgnoreCase && token.ignoreCase) {
    // Only used when a pattern is partially case insensitive; otherwise flag i is relied on
    node.ignoreCase = true;
  }
  return withInitialIntersection(node);
}

function createCharacterClassIntersection(parent) {
  const intersection = getNodeBase(parent, AstTypes.CharacterClassIntersection);
  intersection.classes = [createCharacterClassBase(intersection)];
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

function createCharacterSetFromToken(parent, token, flagDotAll) {
  const {kind, negate, property} = token;
  const node = {
    ...getNodeBase(parent, AstTypes.CharacterSet),
    kind: throwIfNot(AstCharacterSetKinds[kind], `Unexpected character set kind "${kind}"`),
  };
  if (kind === TokenCharacterSetKinds.any && token.dotAll && !flagDotAll) {
    node.dotAll = true;
  } else if (
    kind === TokenCharacterSetKinds.digit ||
    kind === TokenCharacterSetKinds.hex ||
    kind === TokenCharacterSetKinds.property ||
    kind === TokenCharacterSetKinds.space ||
    kind === TokenCharacterSetKinds.word
  ) {
    node.negate = negate;
    if (kind === TokenCharacterSetKinds.property) {
      node.property = getJsUnicodePropertyName(property);
    }
  }
  return node;
}

function createDirective(parent, kind) {
  return {
    ...getNodeBase(parent, AstTypes.Directive),
    kind: throwIfNot(AstDirectiveKinds[kind], `Unexpected directive kind "${kind}"`),
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

function createGroup(parent, atomic = false) {
  return withInitialAlternative({
    ...getNodeBase(parent, AstTypes.Group),
    atomic,
  });
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

function createVariableLengthCharacterSet(parent, kind) {
  return {
    ...getNodeBase(parent, AstTypes.VariableLengthCharacterSet),
    kind: throwIfNot({
      '\\R': AstVariableLengthCharacterSetKinds.newline,
      '\\X': AstVariableLengthCharacterSetKinds.grapheme,
    }[kind], `Unexpected varchar set kind "${kind}"`),
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
