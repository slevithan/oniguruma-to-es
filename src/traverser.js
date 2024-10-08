import {AstAssertionKinds, AstTypes} from './parser.js';

const Accessors = {
  alternatives: 'alternatives',
  classes: 'classes',
  element: 'element',
  elements: 'elements',
  flags: 'flags',
  max: 'max',
  min: 'min',
  pattern: 'pattern',
};

function traverse(ast, visitors) {
  function traverseArray(array, accessor) {
    array.forEach((node, index) => {
      traverseNode(node, accessor, index);
    });
  }
  function traverseNode(node, accessor, index) {
    const context = {ast, accessor, index};
    const methods = visitors[node.type];
    methods?.enter?.(node, context);
    switch (node.type) {
      case AstTypes.Alternative:
      case AstTypes.CharacterClass:
        traverseArray(node.elements, Accessors.elements);
        break;
      case AstTypes.Assertion:
        if (node.kind === AstAssertionKinds.lookahead || node.kind === AstAssertionKinds.lookbehind) {
          traverseArray(node.alternatives, Accessors.alternatives);
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
        traverseArray(node.alternatives, Accessors.alternatives);
        break;
      case AstTypes.CharacterClassIntersection:
        traverseArray(node.classes, Accessors.classes);
        break;
      case AstTypes.CharacterClassRange:
        traverseNode(node.min, Accessors.min);
        traverseNode(node.max, Accessors.max);
        break;
      case AstTypes.Quantifier:
        traverseNode(node.element, Accessors.element);
        break;
      case AstTypes.Regex:
        traverseNode(node.pattern, Accessors.pattern);
        traverseNode(node.flags, Accessors.flags);
        break;
      default:
        throw new Error(`Unexpected node type "${node.type}"`);
    }
    methods?.exit?.(node, context);
  }
  traverseNode(ast);
}

export {
  traverse,
};
