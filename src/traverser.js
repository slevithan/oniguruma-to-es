import {AstAssertionKinds, AstTypes} from './parser.js';

function traverse(ast, visitors) {
  function traverseArray(array) {
    for (const node of array) {
      traverseNode(node);
    }
  }
  function traverseNode(node) {
    const methods = visitors[node.type];
    methods?.enter?.(node);
    switch (node.type) {
      case AstTypes.Alternative:
      case AstTypes.CharacterClass:
        traverseArray(node.elements);
        break;
      case AstTypes.Assertion:
        if (node.kind === AstAssertionKinds.lookahead || node.kind === AstAssertionKinds.lookbehind) {
          traverseArray(node.alternatives);
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
        traverseArray(node.alternatives);
        break;
      case AstTypes.CharacterClassIntersection:
        traverseArray(node.classes);
        break;
      case AstTypes.CharacterClassRange:
        traverseNode(node.min);
        traverseNode(node.max);
        break;
      case AstTypes.Quantifier:
        traverseNode(node.element);
        break;
      case AstTypes.Regex:
        traverseNode(node.pattern);
        traverseNode(node.flags);
        break;
      default:
        throw new Error(`Unexpected node type "${node.type}"`);
    }
    methods?.exit?.(node);
  }
  traverseNode(ast);
}

export {
  traverse,
};
