import {AstAssertionKinds, AstTypes} from './parser.js';
import {throwIfNot} from './utils.js';

function traverse(ast, visitor) {
  function traverseArray(array, parent) {
    for (let i = 0; i < array.length; i++) {
      const keyShift = traverseNode(array[i], parent, i, array);
      i = Math.max(-1, i + keyShift);
    }
  }
  function traverseNode(node, parent = null, key = null, container = null) {
    let keyShift = 0;
    const path = {
      node,
      parent,
      ast,
      key,
      container,
      remove() {
        throwIfNot(container, 'Container expected').splice(Math.max(0, key + keyShift), 1);
        keyShift -= 1;
      },
      // Run before `remove` due to `keyShift`
      removePrevSiblings() {
        throwIfNot(container, 'Container expected').splice(0, Math.max(0, key + keyShift));
        keyShift -= key;
      },
      // TODO: Remove if unused
      insertBefore(newNode) {
        throwIfNot(container, 'Container expected').splice(Math.max(0, key - 1 + keyShift), 0, newNode);
        setParent(newNode, parent);
        keyShift += 1;
      },
      replaceWith(newNode) {
        setParent(newNode, parent);
        if (container) {
          container[Math.max(0, key + keyShift)] = newNode;
        } else {
          parent[key] = newNode;
        }
      },
    };
    const methods = visitor[node.type] ?? visitor['*Else'];
    const enterFn = typeof methods === 'function' ? methods : methods?.enter;
    const exitFn = methods?.exit;
    enterFn?.(path);
    switch (node.type) {
      case AstTypes.Alternative:
      case AstTypes.CharacterClass:
        traverseArray(node.elements, node);
        break;
      case AstTypes.Assertion:
        if (node.kind === AstAssertionKinds.lookahead || node.kind === AstAssertionKinds.lookbehind) {
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
        traverseNode(node.min, node, 'min');
        traverseNode(node.max, node, 'max');
        break;
      case AstTypes.Quantifier:
        traverseNode(node.element, node, 'element');
        break;
      case AstTypes.Regex:
        traverseNode(node.pattern, node, 'pattern');
        traverseNode(node.flags, node, 'flags');
        break;
      default:
        throw new Error(`Unexpected node type "${node.type}"`);
    }
    exitFn?.(path);
    return keyShift;
  }
  traverseNode(ast);
}

function setParent(node, parent) {
  // The traverser can work with ASTs whose nodes include or don't include `parent` props, so only
  // update the parent if a prop for it exists
  if ('parent' in node) {
    node.parent = parent;
  }
}

export {
  traverse,
};
