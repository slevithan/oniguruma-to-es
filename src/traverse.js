import {AstAssertionKinds, AstTypes, getAstTypeAliases} from './parse.js';
import {throwIfNot} from './utils.js';

function traverse(path, state = {}, visitor) {
  let ast = path.node;
  while (ast = ast.parent) {}
  function traverseArray(array, parent) {
    for (let i = 0; i < array.length; i++) {
      const keyShift = traverseNode(array[i], parent, i, array);
      i = Math.max(-1, i + keyShift);
    }
  }
  function traverseNode(node, parent = null, key = null, container = null) {
    let keyShift = 0;
    let skipTraversingKidsOfPath = false;
    const path = {
      node,
      parent,
      key,
      container,
      ast,
      remove() {
        throwIfNot(container, 'Container expected').splice(Math.max(0, key + keyShift), 1);
        keyShift -= 1;
      },
      removeAllNextSiblings() {
        return throwIfNot(container, 'Container expected').splice(key + 1);
      },
      removeAllPrevSiblings() {
        const shifted = key + keyShift;
        keyShift -= shifted;
        return throwIfNot(container, 'Container expected').splice(0, Math.max(0, shifted));
      },
      replaceWith(newNode) {
        setParent(newNode, parent);
        if (container) {
          container[Math.max(0, key + keyShift)] = newNode;
        } else {
          parent[key] = newNode;
        }
      },
      skip() {
        skipTraversingKidsOfPath = true;
      },
    };
    const visitorKey = getAstTypeAliases(node).find(key => !!visitor[key]);
    const methods = visitorKey && visitor[visitorKey];
    const enterFn = typeof methods === 'function' ? methods : methods?.enter;
    const exitFn = methods?.exit;
    enterFn?.(path, state);
    if (!skipTraversingKidsOfPath) {
      switch (node.type) {
        case AstTypes.Regex:
          traverseNode(node.pattern, node, 'pattern');
          traverseNode(node.flags, node, 'flags');
          break;
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
        case AstTypes.Recursion:
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
        default:
          throw new Error(`Unexpected node type "${node.type}"`);
      }
    }
    exitFn?.(path, state);
    return keyShift;
  }
  traverseNode(path.node, path.parent, path.key, path.container);
}

function setParent(node, parent) {
  // The traverser can work with ASTs whose nodes include or don't include `parent` props, so only
  // update the parent if a prop for it exists
  if ('parent' in parent) {
    node.parent = parent;
  }
}

export {
  traverse,
};
