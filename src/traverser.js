import {AstAssertionKinds, AstTypes} from './parser.js';

function traverse(ast, visitor) {
  function traverseArray(array, parent) {
    for (const node of array) {
      traverseNode(node, parent);
    }
  }
  function traverseNode(node, parent) {
    const {type, kind} = node;
    const methods = visitor[type];
    if (methods?.enter) {
      methods.enter(node, parent);
    }
    switch (type) {
      case AstTypes.Alternative:
      case AstTypes.CharacterClass:
        traverseArray(node.elements, node);
        break;
      case AstTypes.Assertion:
        if (kind === AstAssertionKinds.lookahead || kind === AstAssertionKinds.lookbehind) {
          traverseArray(node.alternatives, node);
        }
        break;
      case AstTypes.Backreference:
      case AstTypes.Character:
      case AstTypes.CharacterSet:
      case AstTypes.Directive:
      case AstTypes.Flags:
      case AstTypes.Subroutine:
      case AstTypes.VariableLengthCharacterSet:
        break;
      case AstTypes.CapturingGroup:
      case AstTypes.Group:
      case AstTypes.Pattern:
        traverseArray(node.alternatives, node);
        break;
      case AstTypes.CharacterClassIntersection:
        traverseArray(node.classes, node);
        break;
      case AstTypes.CharacterClassRange:
        traverseNode(node.min, node);
        traverseNode(node.max, node);
        break;
      case AstTypes.Quantifier:
        traverseNode(node.element, node);
        break;
      case AstTypes.RegExp:
        traverseNode(node.pattern, node);
        traverseNode(node.flags, node);
        break;
      default:
        throw new Error(`Unexpected node type "${type}"`);
    }
    if (methods?.exit) {
      methods.exit(node, parent);
    }
  }
  traverseNode(ast, null);
}

export {
  traverse,
};
