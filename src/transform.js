import {Accuracy, Target} from './options.js';
import {asciiSpaceChar, defaultWordChar, JsUnicodePropertyMap, PosixClassMap} from './unicode.js';
import {cp, getNewCurrentFlags, getOrInsert, isMinTarget, r} from './utils.js';
import emojiRegex from 'emoji-regex-xs';
import {createAlternative, createAssertion, createBackreference, createCapturingGroup, createCharacterClass, createCharacterSet, createGroup, createLookaroundAssertion, createQuantifier, createSubroutine, createUnicodeProperty, parse, slug} from 'oniguruma-parser/parser';
import {traverse} from 'oniguruma-parser/traverser';

/**
@import {AbsenceFunctionNode, AlternativeContainerNode, AlternativeElementNode, AssertionNode, CapturingGroupNode, CharacterClassNode, CharacterSetNode, DirectiveNode, LookaroundAssertionNode, NamedCalloutNode, OnigurumaAst, QuantifierNode, Node} from 'oniguruma-parser/parser';
*/

/**
@typedef {
  OnigurumaAst & {
    options: {
      disable: {[key: string]: boolean};
      force: {[key: string]: boolean};
    };
    _originMap: Map<CapturingGroupNode, CapturingGroupNode>;
    _strategy: string?;
  }
} RegexPlusAst
*/
/**
Transforms an Oniguruma AST in-place to a [Regex+](https://github.com/slevithan/regex) AST.
Assumes target ES2025, expecting the generator to down-convert to the desired JS target version.

Regex+'s syntax and behavior is a strict superset of native JavaScript, so the AST is very close
to representing native ES2025 `RegExp` but with some added features (atomic groups, possessive
quantifiers, recursion). The AST doesn't use some of Regex+'s extended features like flag x or
subroutines because they follow PCRE behavior and work somewhat differently than in Oniguruma. The
AST represents what's needed to precisely reproduce Oniguruma behavior using Regex+.
@param {OnigurumaAst} ast
@param {{
  accuracy?: keyof Accuracy;
  asciiWordBoundaries?: boolean;
  avoidSubclass?: boolean;
  bestEffortTarget?: keyof Target;
}} [options]
@returns {RegexPlusAst}
*/
function transform(ast, options) {
  const opts = {
    // A couple edge cases exist where options `accuracy` and `bestEffortTarget` are used:
    // - `CharacterSet` kind `grapheme` (`\X`): An exact representation would require heavy Unicode
    //   data; a best-effort approximation requires knowing the target.
    // - `CharacterSet` kind `posix` with values `graph` and `print`: Their complex Unicode-based
    //   representations would be hard to change to ASCII-based after the fact in the generator
    //   based on `target`/`accuracy`, so produce the appropriate structure here.
    accuracy: 'default',
    asciiWordBoundaries: false,
    avoidSubclass: false,
    bestEffortTarget: 'ES2025',
    ...options,
  };
  // Add `parent` properties to all nodes to help during traversal; also expected by the generator
  addParentProperties(ast);
  const firstPassState = {
    accuracy: opts.accuracy,
    asciiWordBoundaries: opts.asciiWordBoundaries,
    avoidSubclass: opts.avoidSubclass,
    flagDirectivesByAlt: new Map(),
    jsGroupNameMap: new Map(),
    minTargetEs2024: isMinTarget(opts.bestEffortTarget, 'ES2024'),
    passedLookbehind: false,
    strategy: null,
    // Subroutines can appear before the groups they ref, so collect reffed nodes for a second pass 
    subroutineRefMap: new Map(),
    supportedGNodes: new Set(),
    digitIsAscii: ast.flags.digitIsAscii,
    spaceIsAscii: ast.flags.spaceIsAscii,
    wordIsAscii: ast.flags.wordIsAscii,
  };
  traverse(ast, FirstPassVisitor, firstPassState);
  // Global flags modified by the first pass
  const globalFlags = {
    dotAll: ast.flags.dotAll,
    ignoreCase: ast.flags.ignoreCase,
  };
  // The interplay of subroutines (with Onig's unique rules/behavior for them; see comments in the
  // parser for details) with backref multiplexing (a unique Onig feature), flag modifiers, and
  // duplicate group names (which might be indirectly referenced by subroutines even though
  // subroutines can't directly reference duplicate names) is extremely complicated to emulate in
  // JS in a way that handles all edge cases, so we need multiple passes to do it
  const secondPassState = {
    currentFlags: globalFlags,
    prevFlags: null,
    globalFlags,
    groupOriginByCopy: new Map(),
    groupsByName: new Map(),
    multiplexCapturesToLeftByRef: new Map(),
    openRefs: new Map(),
    reffedNodesByReferencer: new Map(),
    subroutineRefMap: firstPassState.subroutineRefMap,
  };
  traverse(ast, SecondPassVisitor, secondPassState);
  const thirdPassState = {
    groupsByName: secondPassState.groupsByName,
    highestOrphanBackref: 0,
    numCapturesToLeft: 0,
    reffedNodesByReferencer: secondPassState.reffedNodesByReferencer,
  };
  traverse(ast, ThirdPassVisitor, thirdPassState);
  ast._originMap = secondPassState.groupOriginByCopy;
  ast._strategy = firstPassState.strategy;
  return ast;
}

const FirstPassVisitor = {
  /**
  @param {{node: AbsenceFunctionNode}} path
  */
  AbsenceFunction({node, parent, replaceWith}) {
    const {body, kind} = node;
    if (kind === 'repeater') {
      // Convert `(?~…)` to `(?:(?:(?!…)\p{Any})*)`
      const negLookahead = createLookaroundAssertion({negate: true});
      negLookahead.body = body;
      const innerGroup = createGroup();
      innerGroup.body[0].body.push(negLookahead, createUnicodeProperty('Any'));
      const quantifier = createQuantifier('greedy', 0, Infinity, innerGroup);
      const outerGroup = createGroup();
      outerGroup.body[0].body.push(quantifier);
      replaceWith(setParentDeep(outerGroup, parent), {traverse: true});
    } else {
      throw new Error(`Unsupported absence function "(?~|"`);
    }
  },

  Alternative: {
    enter({node, parent, key}, {flagDirectivesByAlt}) {
      // Look for own-level flag directives when entering an alternative because after traversing
      // the directive itself, any subsequent flag directives will no longer be at the same level
      const flagDirectives = node.body.filter(el => el.kind === 'flags');
      for (let i = key + 1; i < parent.body.length; i++) {
        const forwardSiblingAlt = parent.body[i];
        getOrInsert(flagDirectivesByAlt, forwardSiblingAlt, []).push(...flagDirectives);
      }
    },
    exit({node}, {flagDirectivesByAlt}) {
      // Wait until exiting to wrap an alternative's nodes with flag groups that extend flag
      // directives from prior sibling alternatives, because doing this at the end allows inner
      // nodes to accurately check their level in the tree
      if (flagDirectivesByAlt.get(node)?.length) {
        const flags = getCombinedFlagModsFromFlagNodes(flagDirectivesByAlt.get(node));
        if (flags) {
          const flagGroup = createGroup({flags});
          flagGroup.body[0].body = node.body;
          node.body = [setParentDeep(flagGroup, node)];
        }
      }
    },
  },

  /**
  @param {{node: AssertionNode}} path
  */
  Assertion({node, parent, key, container, root, remove, replaceWith}, state) {
    const {kind, negate} = node;
    const {asciiWordBoundaries, avoidSubclass, supportedGNodes, wordIsAscii} = state;
    if (kind === 'grapheme_boundary') {
      // Supported by the parser but not yet for transpilation
      throw new Error(`Unsupported grapheme boundary "\\${negate ? 'Y' : 'y'}"`);
    } else if (kind === 'line_end') {
      // Onig's only line break char is line feed, unlike JS
      replaceWith(setParentDeep(parseFragment(r`(?=\z|\n)`), parent));
    } else if (kind === 'line_start') {
      // Onig's only line break char is line feed, unlike JS. Onig's `^` doesn't match after a
      // string-terminating line feed
      replaceWith(setParentDeep(parseFragment(r`(?<=\A|\n(?!\z))`, {skipLookbehindValidation: true}), parent));
    } else if (kind === 'search_start') {
      if (supportedGNodes.has(node)) {
        root.flags.sticky = true;
        remove();
      } else {
        const prev = container[key - 1]; // parent.body[key - 1]
        // Not all ways of blocking the `\G` from matching are covered here (ex: a node prior to
        // the `prev` node could block), but blocked `\G` is an edge case and it's okay if some
        // blocked cases result in the standard error for being unsupported without a subclass
        if (prev && isAlwaysNonZeroLength(prev)) {
          replaceWith(setParentDeep(createLookaroundAssertion({negate: true}), parent));
        } else if (avoidSubclass) {
          throw new Error(r`Uses "\G" in a way that requires a subclass`);
        } else {
          replaceWith(setParent(createAssertion('string_start'), parent));
          state.strategy = 'clip_search';
        }
      }
    } else if (kind === 'string_end' || kind === 'string_start') {
      // Don't need transformation since JS flag m isn't used
    } else if (kind === 'string_end_newline') {
      replaceWith(setParentDeep(parseFragment(r`(?=\n?\z)`), parent));
    } else if (kind === 'word_boundary') {
      if (!wordIsAscii && !asciiWordBoundaries) {
        const b = `(?:(?<=${defaultWordChar})(?!${defaultWordChar})|(?<!${defaultWordChar})(?=${defaultWordChar}))`;
        const B = `(?:(?<=${defaultWordChar})(?=${defaultWordChar})|(?<!${defaultWordChar})(?!${defaultWordChar}))`;
        replaceWith(setParentDeep(parseFragment(negate ? B : b), parent));
      }
    } else {
      throw new Error(`Unexpected assertion kind "${kind}"`);
    }
  },

  Backreference({node}, {jsGroupNameMap}) {
    let {ref} = node;
    if (typeof ref === 'string' && !isValidJsGroupName(ref)) {
      ref = getAndStoreJsGroupName(ref, jsGroupNameMap);
      node.ref = ref;
    }
  },

  CapturingGroup({node}, {jsGroupNameMap, subroutineRefMap}) {
    let {name} = node;
    if (name && !isValidJsGroupName(name)) {
      name = getAndStoreJsGroupName(name, jsGroupNameMap);
      node.name = name;
    }
    subroutineRefMap.set(node.number, node);
    if (name) {
      subroutineRefMap.set(name, node);
    }
  },

  /**
  @param {{parent: CharacterClassNode}} path
  */
  CharacterClassRange({node, parent, replaceWith}) {
    if (parent.kind === 'intersection') {
      // JS doesn't allow intersection with ranges without a wrapper class
      const cc = createCharacterClass();
      cc.body.push(node);
      replaceWith(setParentDeep(cc, parent), {traverse: true});
    }
  },

  /**
  @param {{node: CharacterSetNode}} path
  */
  CharacterSet({node, parent, replaceWith}, {accuracy, minTargetEs2024, digitIsAscii, spaceIsAscii, wordIsAscii}) {
    const {kind, negate, value} = node;
    // Flag D with `\d`, `\p{Digit}`, `[[:digit:]]`
    if (digitIsAscii && (kind === 'digit' || value === 'digit')) {
      replaceWith(setParent(createCharacterSet('digit', {negate}), parent));
      return;
    }
    // Flag S with `\s`, `\p{Space}`, `[[:space:]]`
    if (spaceIsAscii && (kind === 'space' || value === 'space')) {
      replaceWith(setParentDeep(setNegate(parseFragment(asciiSpaceChar), negate), parent));
      return;
    }
    // Flag W with `\w`, `\p{Word}`, `[[:word:]]`
    if (wordIsAscii && (kind === 'word' || value === 'word')) {
      replaceWith(setParent(createCharacterSet('word', {negate}), parent));
      return;
    }
    if (kind === 'any') {
      replaceWith(setParent(createUnicodeProperty('Any'), parent));
    } else if (kind === 'digit') {
      replaceWith(setParent(createUnicodeProperty('Nd', {negate}), parent));
    } else if (kind === 'dot') {
      // No-op; doesn't need transformation
    } else if (kind === 'grapheme') {
      if (accuracy === 'strict') {
        throw new Error(r`Use of "\X" requires non-strict accuracy`);
      }
      // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows over/under-qualified
      // emoji using a general pattern that matches any Unicode sequence following the structure of
      // a valid emoji. That actually makes it more accurate for matching any grapheme
      const emoji = minTargetEs2024 ? r`\p{RGI_Emoji}` : emojiRegex().source.replace(/\\u\{/g, `\\x{`);
      // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>.
      // Skip property name validation to allow `RGI_Emoji` through, since Onig doesn't support it
      replaceWith(setParentDeep(parseFragment(r`(?>\r\n|${emoji}|\P{M}\p{M}*)`, {skipPropertyNameValidation: true}), parent));
    } else if (kind === 'hex') {
      replaceWith(setParent(createUnicodeProperty('AHex', {negate}), parent));
    } else if (kind === 'newline') {
      replaceWith(setParentDeep(parseFragment(negate ? '[^\n]' : '(?>\r\n?|[\n\v\f\x85\u2028\u2029])'), parent));
    } else if (kind === 'posix') {
      if (!minTargetEs2024 && (value === 'graph' || value === 'print')) {
        if (accuracy === 'strict') {
          throw new Error(`POSIX class "${value}" requires min target ES2024 or non-strict accuracy`);
        }
        let ascii = {
          graph: '!-~',
          print: ' -~',
        }[value];
        if (negate) {
          // POSIX classes are always nested in a char class; manually invert the range rather than
          // using `[^…]` so it can be unwrapped since ES2018 doesn't support nested classes
          ascii = `\0-${cp(ascii.codePointAt(0) - 1)}${cp(ascii.codePointAt(2) + 1)}-\u{10FFFF}`;
        }
        replaceWith(setParentDeep(parseFragment(`[${ascii}]`), parent));
      } else {
        replaceWith(setParentDeep(setNegate(parseFragment(PosixClassMap.get(value)), negate), parent));
      }
    } else if (kind === 'property') {
      if (!JsUnicodePropertyMap.has(slug(value))) {
        // Assume it's a script; no error checking is the price for avoiding heavyweight Unicode
        // data for all script names
        node.key = 'sc';
      }
    } else if (kind === 'space') {
      // Can't use JS's Unicode-based `\s` since unlike Onig it includes `\uFEFF`, excludes `\x85`
      replaceWith(setParent(createUnicodeProperty('space', {negate}), parent));
    } else if (kind === 'word') {
      replaceWith(setParentDeep(setNegate(parseFragment(defaultWordChar), negate), parent));
    } else {
      throw new Error(`Unexpected character set kind "${kind}"`);
    }
  },

  /**
  @param {{node: DirectiveNode}} path
  */
  Directive({node, parent, root, remove, replaceWith, removeAllPrevSiblings, removeAllNextSiblings}) {
    const {kind, flags} = node;
    if (kind === 'flags') {
      if (!flags.enable && !flags.disable) {
        // Flag directive without flags; ex: `(?-)`, `(?--)`
        remove();
      } else {
        const flagGroup = createGroup({flags});
        flagGroup.body[0].body = removeAllNextSiblings();
        replaceWith(setParentDeep(flagGroup, parent), {traverse: true});
      }
    } else if (kind === 'keep') {
      const firstAltFirstEl = root.body[0].body[0];
      // Supporting a full-pattern wrapper around `\K` enables use with flag modifiers
      const hasWrapperGroup =
        // Not emulatable if within a `CapturingGroup`
        hasOnlyChild(root, kid => kid.type === 'Group') &&
        firstAltFirstEl.body.length === 1;
      const topLevel = hasWrapperGroup ? firstAltFirstEl : root;
      if (parent.parent !== topLevel || topLevel.body.length > 1) {
        throw new Error(r`Uses "\K" in a way that's unsupported`);
      }
      const lookbehind = createLookaroundAssertion({behind: true});
      lookbehind.body[0].body = removeAllPrevSiblings();
      replaceWith(setParentDeep(lookbehind, parent));
    } else {
      throw new Error(`Unexpected directive kind "${kind}"`);
    }
  },

  Flags({node, parent}) {
    if (node.posixIsAscii) {
      // Supported by the parser but not yet for transpilation
      throw new Error('Unsupported flag "P"');
    }
    // Remove Onig flags that aren't available in JS
    [ 'digitIsAscii', // Flag D
      'extended', // Flag x
      'posixIsAscii', // Flag P
      'spaceIsAscii', // Flag S
      'wordIsAscii', // Flag W
    ].forEach(f => delete node[f]);
    Object.assign(node, {
      // JS flag g; no Onig equiv
      global: false,
      // JS flag d; no Onig equiv
      hasIndices: false,
      // JS flag m; no Onig equiv but its behavior is always on in Onig. Onig's only line break
      // char is line feed, unlike JS, so this flag isn't used since it would produce inaccurate
      // results (also allows `^` and `$` to be used in the generator for string start and end)
      multiline: false,
      // JS flag y; no Onig equiv, but used for `\G` emulation
      sticky: node.sticky ?? false,
      // Note: Regex+ doesn't allow explicitly adding flags it handles implicitly, so leave out
      // properties `unicode` (JS flag u) and `unicodeSets` (JS flag v). Keep the existing values
      // for `ignoreCase` (flag i) and `dotAll` (JS flag s, but Onig flag m)
    });
    // Options accepted by Regex+; see <github.com/slevithan/regex#-options>
    parent.options = {
      disable: {
        // Onig uses different rules for flag x than Regex+, so disable the implicit flag
        x: true,
        // Onig has no flag to control "named capture only" mode but contextually applies its
        // behavior when named capturing is used, so disable Regex+'s implicit flag for it
        n: true,
      },
      force: {
        // Always add flag v because we're generating an AST that relies on it (it enables JS
        // support for Onig features nested classes, intersection, Unicode properties, etc.).
        // However, the generator might disable flag v based on its `target` option
        v: true,
      },
    };
  },

  Group({node}) {
    if (!node.flags) {
      return;
    }
    const {enable, disable} = node.flags;
    // Onig's flag x (`extended`) isn't available in JS
    enable?.extended && delete enable.extended;
    disable?.extended && delete disable.extended;
    // JS doesn't support flag groups that enable and disable the same flag; ex: `(?i-i:)`
    enable?.dotAll && disable?.dotAll && delete enable.dotAll;
    enable?.ignoreCase && disable?.ignoreCase && delete enable.ignoreCase;
    // Cleanup
    enable && !Object.keys(enable).length && delete node.flags.enable;
    disable && !Object.keys(disable).length && delete node.flags.disable;
    !node.flags.enable && !node.flags.disable && delete node.flags;
  },

  /**
  @param {{node: LookaroundAssertionNode}} path
  */
  LookaroundAssertion({node}, state) {
    const {kind} = node;
    if (kind === 'lookbehind') {
      state.passedLookbehind = true;
    }
  },

  /**
  @param {{node: NamedCalloutNode}} path
  */
  NamedCallout({node, parent, replaceWith}) {
    const {kind} = node;
    if (kind === 'fail') {
      replaceWith(setParentDeep(createLookaroundAssertion({negate: true}), parent));
    } else {
      throw new Error(`Unsupported named callout "(*${kind.toUpperCase()}"`);
    }
  },

  /**
  @param {{node: QuantifierNode}} path
  */
  Quantifier({node}) {
    if (node.body.type === 'Quantifier') {
      // Change e.g. `a**` to `(?:a*)*`
      const group = createGroup();
      group.body[0].body.push(node.body);
      node.body = setParentDeep(group, node);
    }
  },

  Regex: {
    enter({node}, {supportedGNodes}) {
      // For `\G` to be accurately emulatable using JS flag y, it must be at (and only at) the start
      // of every top-level alternative (with complex rules for what determines being at the start).
      // Additional `\G` error checking in `Assertion` visitor
      const leadingGs = [];
      let hasAltWithLeadG = false;
      let hasAltWithoutLeadG = false;
      for (const alt of node.body) {
        if (alt.body.length === 1 && alt.body[0].kind === 'search_start') {
          // Remove the `\G` (leaving behind an empty alternative, and without adding JS flag y)
          // since a top-level alternative that includes only `\G` always matches at the start of the
          // match attempt. Note that this is based on Oniguruma's rules, and is different than other
          // regex flavors where `\G` matches at the end of the previous match (a subtle distinction
          // that's relevant after zero-length matches)
          alt.body.pop();
        } else {
          const leadingG = getLeadingG(alt.body);
          if (leadingG) {
            hasAltWithLeadG = true;
            Array.isArray(leadingG) ?
              leadingGs.push(...leadingG) :
              leadingGs.push(leadingG);
          } else {
            hasAltWithoutLeadG = true;
          }
        }
      }
      if (hasAltWithLeadG && !hasAltWithoutLeadG) {
        // Supported `\G` nodes will be removed (and add flag y) when traversed
        leadingGs.forEach(g => supportedGNodes.add(g));
      }
    },
    exit(_, {accuracy, passedLookbehind, strategy}) {
      if (accuracy === 'strict' && passedLookbehind && strategy) {
        throw new Error(r`Uses "\G" in a way that requires non-strict accuracy`);
      }
    },
  },

  Subroutine({node}, {jsGroupNameMap}) {
    let {ref} = node;
    if (typeof ref === 'string' && !isValidJsGroupName(ref)) {
      ref = getAndStoreJsGroupName(ref, jsGroupNameMap);
      node.ref = ref;
    }
  },
};

const SecondPassVisitor = {
  Backreference({node}, {multiplexCapturesToLeftByRef, reffedNodesByReferencer}) {
    const {orphan, ref} = node;
    if (!orphan) {
      // Copy the current state for later multiplexing expansion. That's done in a subsequent pass
      // because backref numbers need to be recalculated after subroutine expansion
      reffedNodesByReferencer.set(node, [...multiplexCapturesToLeftByRef.get(ref).map(({node}) => node)]);
    }
  },

  CapturingGroup: {
    enter(
      { node,
        parent,
        replaceWith,
        skip,
      },
      { groupOriginByCopy,
        groupsByName,
        multiplexCapturesToLeftByRef,
        openRefs,
        reffedNodesByReferencer,
      }
    ) {
      // Has value if we're within a subroutine expansion
      const origin = groupOriginByCopy.get(node);

      // ## Handle recursion; runs after subroutine expansion
      if (origin && openRefs.has(node.number)) {
        // Recursive subroutines don't affect any following backrefs to their `ref` (unlike other
        // subroutines), so don't wrap with a capture. The reffed group might have its name removed
        // due to later subroutine expansion
        const recursion = setParent(createRecursion(node.number), parent);
        reffedNodesByReferencer.set(recursion, openRefs.get(node.number));
        replaceWith(recursion);
        return;
      }
      openRefs.set(node.number, node);

      // ## Track data for backref multiplexing
      multiplexCapturesToLeftByRef.set(node.number, []);
      if (node.name) {
        getOrInsert(multiplexCapturesToLeftByRef, node.name, []);
      }
      const multiplexNodes = multiplexCapturesToLeftByRef.get(node.name ?? node.number);
      for (let i = 0; i < multiplexNodes.length; i++) {
        // Captures added via subroutine expansion (maybe indirectly because they were descendant
        // captures of the reffed group or in a nested subroutine expansion) form a set with their
        // origin group and any other copies of it added via subroutines. Only the most recently
        // matched within this set is added to backref multiplexing. So search the list of already-
        // tracked multiplexed nodes for this group name or number to see if there's a node being
        // replaced by this capture
        const multiplex = multiplexNodes[i];
        if (
          // This group is from subroutine expansion, and there's a multiplex value from either the
          // origin node or a prior subroutine expansion group with the same origin
          (origin === multiplex.node || (origin && origin === multiplex.origin)) ||
          // This group is not from subroutine expansion, and it comes after a subroutine expansion
          // group that refers to this group
          node === multiplex.origin
        ) {
          multiplexNodes.splice(i, 1);
          break;
        }
      }
      multiplexCapturesToLeftByRef.get(node.number).push({node, origin});
      if (node.name) {
        multiplexCapturesToLeftByRef.get(node.name).push({node, origin});
      }

      // ## Track data for duplicate names
      // Pre-ES2025 doesn't allow duplicate names, but ES2025 allows duplicate names that are
      // unique per mutually exclusive alternation path. However, Oniguruma's handling for named
      // subpatterns on match results means we can't use this ES2025 feature even when in an ES2025
      // env. So, if using a duplicate name, remove the name from all but the first instance that
      // wasn't created by subroutine expansion
      if (node.name) {
        const groupsWithSameName = getOrInsert(groupsByName, node.name, new Map());
        let hasDuplicateNameToRemove = false;
        if (origin) {
          // Subroutines and their child captures shouldn't hold duplicate names in the final state
          hasDuplicateNameToRemove = true;
        } else {
          for (const groupInfo of groupsWithSameName.values()) {
            if (!groupInfo.hasDuplicateNameToRemove) {
              // Will change to an unnamed capture in a later pass
              hasDuplicateNameToRemove = true;
              break;
            }
          }
        }
        groupsByName.get(node.name).set(node, {node, hasDuplicateNameToRemove});
      }
    },
    exit({node}, {openRefs}) {
      openRefs.delete(node.number);
    },
  },

  Group: {
    enter({node}, state) {
      // Flag directives have already been converted to flag groups by the previous pass
      state.prevFlags = state.currentFlags;
      if (node.flags) {
        state.currentFlags = getNewCurrentFlags(state.currentFlags, node.flags);
      }
    },
    exit(_, state) {
      state.currentFlags = state.prevFlags;
    },
  },

  Subroutine({node, parent, replaceWith}, state) {
    const {isRecursive, ref} = node;

    // Subroutine nodes with `isRecursive` are created during the current traversal; they're only
    // traversed here if a recursive subroutine created during traversal is then copied by a
    // subroutine expansion, e.g. with `(?<a>\g<a>)\g<a>`
    if (isRecursive) {
      // Immediate parent is an alternative or quantifier; can skip
      let reffed = parent;
      while ((reffed = reffed.parent)) {
        if (reffed.type === 'CapturingGroup' && (reffed.name === ref || reffed.number === ref)) {
          break;
        }
      }
      // Track the referenced node because `ref`s are rewritten in a subsequent pass; capturing
      // group names and numbers might change due to subroutine expansion and duplicate group names
      state.reffedNodesByReferencer.set(node, reffed);
      return;
    }

    const reffedGroupNode = state.subroutineRefMap.get(ref);
    // Other forms of recursion are handled by the `CapturingGroup` visitor
    const isGlobalRecursion = ref === 0;
    const expandedSubroutine = isGlobalRecursion ?
      createRecursion(0) :
      // The reffed group might itself contain subroutines, which are expanded during sub-traversal
      cloneCapturingGroup(reffedGroupNode, state.groupOriginByCopy, null);
    let replacement = expandedSubroutine;
    if (!isGlobalRecursion) {
      // Subroutines take their flags from the reffed group, not the flags surrounding themselves
      const reffedGroupFlagMods = getCombinedFlagModsFromFlagNodes(getAllParents(
        reffedGroupNode,
        p => p.type === 'Group' && !!p.flags
      ));
      const reffedGroupFlags = reffedGroupFlagMods ?
        getNewCurrentFlags(state.globalFlags, reffedGroupFlagMods) :
        state.globalFlags;
      if (!areFlagsEqual(reffedGroupFlags, state.currentFlags)) {
        replacement = createGroup({
          flags: getFlagModsFromFlags(reffedGroupFlags),
        });
        replacement.body[0].body.push(expandedSubroutine);
      }
    }
    replaceWith(setParentDeep(replacement, parent), {traverse: !isGlobalRecursion});
  },
};

const ThirdPassVisitor = {
  Backreference({node, parent, replaceWith}, state) {
    if (node.orphan) {
      state.highestOrphanBackref = Math.max(state.highestOrphanBackref, node.ref);
      // Don't renumber; used with `allowOrphanBackrefs`
      return;
    }
    const reffedNodes = state.reffedNodesByReferencer.get(node);
    const participants = reffedNodes.filter(reffed => canParticipateWithNode(reffed, node));
    // For the backref's `ref`, use `number` rather than `name` because group names might have been
    // removed if they're duplicates within their alternation path, or they might be removed later
    // by the generator (depending on target) if they're duplicates within the overall pattern.
    // Backrefs must come after groups they ref, so reffed node `number`s are already recalculated
    if (!participants.length) {
      // If no participating capture, convert backref to to `(?!)`; backrefs to nonparticipating
      // groups can't match in Onig but match the empty string in JS
      replaceWith(setParentDeep(createLookaroundAssertion({negate: true}), parent));
    } else if (participants.length > 1) {
      // Multiplex
      const alts = participants.map(reffed => {
        const alt = createAlternative();
        alt.body.push(createBackreference(reffed.number));
        return alt;
      });
      const group = createGroup();
      group.body = alts;
      replaceWith(setParentDeep(group, parent));
    } else {
      node.ref = participants[0].number;
    }
  },

  CapturingGroup({node}, state) {
    // Recalculate the number since the current value might be wrong due to subroutine expansion
    node.number = ++state.numCapturesToLeft;
    if (node.name) {
      // Removing duplicate names here rather than in an earlier pass avoids extra complexity when
      // handling subroutine expansion and backref multiplexing
      if (state.groupsByName.get(node.name).get(node).hasDuplicateNameToRemove) {
        delete node.name;
      }
    }
  },

  Regex: {
    exit({node}, state) {
      // HACK: Add unnamed captures to the end of the regex if needed to allow orphaned backrefs
      // to be valid in JS with flag u/v. This is needed to support TextMate grammars, which
      // replace numbered backrefs in their `end` pattern with values matched by captures in their
      // `begin` pattern! See <github.com/microsoft/vscode-textmate/blob/7e0ea282f4f25fef12a6c84fa4fa7266f67b58dc/src/rule.ts#L661-L663>
      // An `end` pattern, prior to this substitution, might have backrefs to a group that doesn't
      // exist within `end`. This presents a dilemma since both Oniguruma and JS (with flag u/v)
      // error for backrefs to undefined captures. So adding captures to the end is a solution that
      // doesn't change what the regex matches, and lets invalid numbered backrefs through. Note:
      // Orphan backrefs are only allowed if `allowOrphanBackrefs` is enabled
      const numCapsNeeded = Math.max(state.highestOrphanBackref - state.numCapturesToLeft, 0);
      for (let i = 0; i < numCapsNeeded; i++) {
        const emptyCapture = createCapturingGroup();
        node.body.at(-1).body.push(emptyCapture);
      }
    },
  },

  Subroutine({node}, state) {
    if (!node.isRecursive || node.ref === 0) {
      return;
    }
    // For the recursion's `ref`, use `number` rather than `name` because group names might have
    // been removed if they're duplicates within their alternation path, or they might be removed
    // later by the generator (depending on target) if they're duplicates within the overall
    // pattern. Since recursion appears within the group it refs, the reffed node's `number` has
    // already been recalculated
    node.ref = state.reffedNodesByReferencer.get(node).number;
  },
};

function addParentProperties(root) {
  traverse(root, {
    '*'({node, parent}) {
      node.parent = parent;
    },
  });
}

function areFlagsEqual(a, b) {
  return a.dotAll === b.dotAll && a.ignoreCase === b.ignoreCase;
}

function canParticipateWithNode(capture, node) {
  // Walks to the left (prev siblings), down (sibling descendants), up (parent), then back down
  // (parent's prev sibling descendants) the tree in a loop
  let rightmostPoint = node;
  do {
    if (rightmostPoint.type === 'Regex') {
      // End of the line; capture is not in node's alternation path
      return false;
    }
    if (rightmostPoint.type === 'Alternative') {
      // Skip past alts to their parent because we don't want to look at the kids of preceding alts
      continue;
    }
    if (rightmostPoint === capture) {
      // Capture is ancestor of node
      return false;
    }
    const kidsOfParent = getKids(rightmostPoint.parent);
    for (const kid of kidsOfParent) {
      if (kid === rightmostPoint) {
        // Reached rightmost node in sibling list that we want to consider; break to parent loop
        break;
      }
      if (kid === capture || isAncestorOf(kid, capture)) {
        return true;
      }
    }
  } while ((rightmostPoint = rightmostPoint.parent));
  throw new Error('Unexpected path');
}

// Creates a deep copy of the provided node, with special handling:
// - Make `parent` props point to their parent in the copy
// - Update the provided `originMap` for each cloned capturing group (outer and nested)
function cloneCapturingGroup(obj, originMap, up, up2) {
  const store = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'parent') {
      // If the last cloned item was a container array (for holding kids), use the object above it
      store.parent = Array.isArray(up) ? up2 : up;
    } else if (value && typeof value === 'object') {
      store[key] = cloneCapturingGroup(value, originMap, store, up);
    } else {
      if (key === 'type' && value === 'CapturingGroup') {
        // Key is the copied node, value is the origin node
        originMap.set(store, originMap.get(obj) ?? obj);
      }
      store[key] = value;
    }
  }
  return store;
}

function createRecursion(ref) {
  const node = createSubroutine(ref);
  // In the future, the parser will set a `recursive` property on subroutines:
  // <github.com/slevithan/oniguruma-parser/issues/3>. When that's available, this function won't
  // be needed and the related logic in this transformer should change (simplify) to use it
  node.isRecursive = true;
  return node;
}

function getAllParents(node, filterFn) {
  const results = [];
  while ((node = node.parent)) {
    if (!filterFn || filterFn(node)) {
      results.push(node);
    }
  }
  return results;
}

// See also `isValidJsGroupName`
function getAndStoreJsGroupName(name, map) {
  if (map.has(name)) {
    return map.get(name);
  }
  // Onig group names can't start with `$`, but JS names can
  const jsName = `$${map.size}_${name.replace(/^[^$_\p{IDS}]|[^$\u200C\u200D\p{IDC}]/ug, '_')}`;
  map.set(name, jsName);
  return jsName;
}

function getCombinedFlagModsFromFlagNodes(flagNodes) {
  const flagProps = ['dotAll', 'ignoreCase'];
  const combinedFlags = {enable: {}, disable: {}};
  flagNodes.forEach(({flags}) => {
    flagProps.forEach(prop => {
      if (flags.enable?.[prop]) {
        // Need to remove `disable` since disabled flags take precedence
        delete combinedFlags.disable[prop];
        combinedFlags.enable[prop] = true;
      }
      if (flags.disable?.[prop]) {
        combinedFlags.disable[prop] = true;
      }
    });
  });
  if (!Object.keys(combinedFlags.enable).length) {
    delete combinedFlags.enable;
  }
  if (!Object.keys(combinedFlags.disable).length) {
    delete combinedFlags.disable;
  }
  if (combinedFlags.enable || combinedFlags.disable) {
    return combinedFlags;
  }
  return null;
}

function getFlagModsFromFlags({dotAll, ignoreCase}) {
  const mods = {};
  if (dotAll || ignoreCase) {
    mods.enable = {};
    dotAll && (mods.enable.dotAll = true);
    ignoreCase && (mods.enable.ignoreCase = true);
  }
  if (!dotAll || !ignoreCase) {
    mods.disable = {};
    !dotAll && (mods.disable.dotAll = true);
    !ignoreCase && (mods.disable.ignoreCase = true);
  }
  return mods;
}

function getKids(node) {
  if (!node) {
    throw new Error('Node expected');
  }
  // NOTE: Not handling `CharacterClassRange`'s `min`/`max` and `Regex`'s `flags`, only because
  // they haven't been needed by current callers
  const {body} = node;
  return Array.isArray(body) ? body : (body ? [body] : null);
}

function getLeadingG(els) {
  const firstToConsider = els.find(el => (
    el.kind === 'search_start' ||
    isLoneGLookaround(el, {negate: false}) ||
    !isAlwaysZeroLength(el)
  ));
  if (!firstToConsider) {
    return null;
  }
  if (firstToConsider.kind === 'search_start') {
    return firstToConsider;
  }
  if (firstToConsider.type === 'LookaroundAssertion') {
    return firstToConsider.body[0].body[0];
  }
  if (firstToConsider.type === 'CapturingGroup' || firstToConsider.type === 'Group') {
    const gNodesForGroup = [];
    // Recursively find `\G` nodes for all alternatives in the group
    for (const alt of firstToConsider.body) {
      const leadingG = getLeadingG(alt.body);
      if (!leadingG) {
        // Don't return `gNodesForGroup` collected so far since this alt didn't qualify
        return null;
      }
      Array.isArray(leadingG) ?
        gNodesForGroup.push(...leadingG) :
        gNodesForGroup.push(leadingG);
    }
    return gNodesForGroup;
  }
  return null;
}

function isAncestorOf(node, descendant) {
  const kids = getKids(node) ?? [];
  for (const kid of kids) {
    if (
      kid === descendant ||
      isAncestorOf(kid, descendant)
    ) {
      return true;
    }
  }
  return false;
}

/**
Check whether the node has exactly one alternative with one child element, and optionally that the
child satisfies a condition.
@param {AlternativeContainerNode} node
@param {(node: AlternativeElementNode) => boolean} [kidFn]
@returns {boolean}
*/
function hasOnlyChild({body}, kidFn) {
  return (
    body.length === 1 &&
    body[0].body.length === 1 &&
    (!kidFn || kidFn(body[0].body[0]))
  );
}

/**
@param {Node} node
@returns {boolean}
*/
function isAlwaysZeroLength({type}) {
  return (
    type === 'Assertion' ||
    type === 'Directive' ||
    type === 'LookaroundAssertion'
  );
}

/**
@param {Node} node
@returns {boolean}
*/
function isAlwaysNonZeroLength(node) {
  const types = [
    'Character',
    'CharacterClass',
    'CharacterSet',
  ];
  return types.includes(node.type) || (
    node.type === 'Quantifier' &&
    node.min &&
    types.includes(node.body.type)
  );
}

function isLoneGLookaround(node, options) {
  const opts = {
    negate: null,
    ...options,
  };
  return (
    node.type === 'LookaroundAssertion' &&
    (opts.negate === null || node.negate === opts.negate) &&
    hasOnlyChild(node, kid => kid.kind === 'search_start')
  );
}

// See also `getAndStoreJsGroupName`
function isValidJsGroupName(name) {
  // JS group names are more restrictive than Onig; see
  // <developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers>
  return /^[$_\p{IDS}][$\u200C\u200D\p{IDC}]*$/u.test(name);
}

// Returns a single node, either the given node or all nodes wrapped in a noncapturing group
function parseFragment(pattern, options) {
  const ast = parse(pattern, {
    ...options,
    // Providing a custom set of Unicode property names avoids converting some JS Unicode
    // properties (ex: `\p{Alpha}`) to Onig POSIX classes
    unicodePropertyMap: JsUnicodePropertyMap,
  });
  const alts = ast.body;
  if (alts.length > 1 || alts[0].body.length > 1) {
    const group = createGroup();
    group.body = alts;
    return group;
  }
  return alts[0].body[0];
}

function setNegate(node, negate) {
  node.negate = negate;
  return node;
}

function setParent(node, parent) {
  node.parent = parent;
  return node;
}

function setParentDeep(node, parent) {
  addParentProperties(node);
  node.parent = parent;
  return node;
}

export {
  transform,
};
