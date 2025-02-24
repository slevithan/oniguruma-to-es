import {Accuracy, Target} from './options.js';
import {asciiSpaceChar, defaultWordChar, JsUnicodePropertyMap, PosixClassMap} from './unicode.js';
import {cp, getNewCurrentFlags, getOrInsert, isMinTarget, r} from './utils.js';
import emojiRegex from 'emoji-regex-xs';
import {hasOnlyChild, isConsumptiveGroup, slug} from 'oniguruma-parser';
import {AstAssertionKinds, AstCharacterSetKinds, AstDirectiveKinds, AstLookaroundAssertionKinds, AstTypes, AstVariableLengthCharacterSetKinds, createAlternative, createAssertion, createBackreference, createCapturingGroup, createCharacterSet, createGroup, createLookaroundAssertion, createQuantifier, createUnicodeProperty, parse} from 'oniguruma-parser/parse';
import {tokenize} from 'oniguruma-parser/tokenize';
import {traverse} from 'oniguruma-parser/traverse';

/**
@typedef {{
  type: 'Regex';
  parent: null;
  pattern: Object;
  flags: Object;
  options: Object;
  _originMap: Map<Object, Object>;
  _strategy: string?;
}} RegexPlusAst
*/
/**
Transforms an Oniguruma AST in-place to a [Regex+](https://github.com/slevithan/regex) AST.
Assumes target ES2025, expecting the generator to down-convert to the desired JS target version.

Regex+'s syntax and behavior is a strict superset of native JavaScript, so the AST is very close
to representing native ES2025 `RegExp` but with some added features (atomic groups, possessive
quantifiers, recursion). The AST doesn't use some of Regex+'s extended features like flag x or
subroutines because they follow PCRE behavior and work somewhat differently than in Oniguruma. The
AST represents what's needed to precisely reproduce Oniguruma behavior using Regex+.
@param {import('./parse.js').OnigurumaAst} ast
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
    // - `VariableLengthCharacterSet` kind `grapheme` (`\X`): An exact representation would require
    //   heavy Unicode data; a best-effort approximation requires knowing the target.
    // - `CharacterSet` kind `posix` with values `graph` and `print`: Their complex Unicode-based
    //   representations would be hard to change to ASCII-based after the fact in the generator
    //   based on `target`/`accuracy`, so produce the appropriate structure here.
    accuracy: 'default',
    asciiWordBoundaries: false,
    avoidSubclass: false,
    bestEffortTarget: 'ES2025',
    ...options,
  };
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
  traverse({node: ast}, firstPassState, FirstPassVisitor);
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
  traverse({node: ast}, secondPassState, SecondPassVisitor);
  const thirdPassState = {
    groupsByName: secondPassState.groupsByName,
    highestOrphanBackref: 0,
    numCapturesToLeft: 0,
    reffedNodesByReferencer: secondPassState.reffedNodesByReferencer,
  };
  traverse({node: ast}, thirdPassState, ThirdPassVisitor);
  ast._originMap = secondPassState.groupOriginByCopy;
  ast._strategy = firstPassState.strategy;
  return ast;
}

const FirstPassVisitor = {
  AbsentFunction({node, replaceWith}) {
    // Convert absent repeater `(?~…)` to `(?:(?:(?!…)\p{Any})*)`
    const group = prepContainer(createGroup(), [
      adoptAndSwapKids(createLookaroundAssertion({negate: true}), node.alternatives),
      createUnicodeProperty('Any'),
    ]);
    const quantifier = createQuantifier(group, 0, Infinity);
    group.parent = quantifier;
    replaceWith(prepContainer(createGroup(), [quantifier]));
  },

  Alternative: {
    enter({node, parent, key}, {flagDirectivesByAlt}) {
      // Look for own-level flag directives when entering an alternative because after traversing
      // the directive itself, any subsequent flag directives will no longer be at the same level
      const flagDirectives = node.elements.filter(el => el.kind === AstDirectiveKinds.flags);
      for (let i = key + 1; i < parent.alternatives.length; i++) {
        const forwardSiblingAlt = parent.alternatives[i];
        getOrInsert(flagDirectivesByAlt, forwardSiblingAlt, []).push(...flagDirectives);
      }
    },
    exit({node}, {flagDirectivesByAlt}) {
      // Wait until exiting to wrap an alternative's nodes with flag groups that extend flag
      // directives from prior sibling alternatives because doing this at the end allows inner
      // nodes to accurately check their level in the tree
      if (flagDirectivesByAlt.get(node)?.length) {
        const flags = getCombinedFlagModsFromFlagNodes(flagDirectivesByAlt.get(node));
        if (flags) {
          const flagGroup = prepContainer(createGroup({flags}), node.elements);
          // Manually set the parent since we're not using `replaceWith`
          flagGroup.parent = node;
          node.elements = [flagGroup];
        }
      }
    },
  },

  Assertion({node, key, container, ast, remove, replaceWith}, state) {
    const {kind, negate} = node;
    const {asciiWordBoundaries, avoidSubclass, supportedGNodes, wordIsAscii} = state;
    if (kind === AstAssertionKinds.grapheme_boundary) {
      // Supported by the parser but not yet for transpilation
      throw new Error(`Unsupported grapheme boundary "\\${negate ? 'Y' : 'y'}"`);
    } else if (kind === AstAssertionKinds.line_end) {
      // Onig's only line break char is line feed, unlike JS
      replaceWith(parseFragment(r`(?=\z|\n)`));
    } else if (kind === AstAssertionKinds.line_start) {
      // Onig's only line break char is line feed, unlike JS. Onig's `^` doesn't match after a
      // string-terminating line feed
      replaceWith(parseFragment(r`(?<=\A|\n(?!\z))`, {skipLookbehindValidation: true}));
    } else if (kind === AstAssertionKinds.search_start) {
      if (supportedGNodes.has(node)) {
        ast.flags.sticky = true;
        remove();
      } else {
        const prev = container[key - 1]; // parent.elements[key - 1]
        // Not all ways of blocking the `\G` from matching are covered (ex: a node prior to the
        // prev node could block), but blocked `\G` is an edge case so it's okay if some blocked
        // cases resulting in the standard error for being unsupported
        if (prev && isAlwaysNonZeroLength(prev)) {
          replaceWith(prepContainer(createLookaroundAssertion({negate: true})));
        } else if (avoidSubclass) {
          throw new Error(r`Uses "\G" in a way that requires a subclass`);
        } else {
          replaceWith(createAssertion(AstAssertionKinds.string_start));
          state.strategy = 'clip_search';
        }
      }
    } else if (kind === AstAssertionKinds.string_end_newline) {
      replaceWith(parseFragment(r`(?=\n?\z)`));
    } else if (kind === AstAssertionKinds.word_boundary && !wordIsAscii && !asciiWordBoundaries) {
      const b = `(?:(?<=${defaultWordChar})(?!${defaultWordChar})|(?<!${defaultWordChar})(?=${defaultWordChar}))`;
      const B = `(?:(?<=${defaultWordChar})(?=${defaultWordChar})|(?<!${defaultWordChar})(?!${defaultWordChar}))`;
      replaceWith(parseFragment(negate ? B : b));
    }
    // Kinds `string_end` and `string_start` don't need transformation since JS flag m isn't used
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

  CharacterSet({node, replaceWith}, {accuracy, minTargetEs2024, digitIsAscii, spaceIsAscii, wordIsAscii}) {
    const {kind, negate, value} = node;
    // Flag D with `\d`, `\p{Digit}`, `[[:digit:]]`
    if (digitIsAscii && (kind === AstCharacterSetKinds.digit || value === 'digit')) {
      replaceWith(createCharacterSet(AstCharacterSetKinds.digit, {negate}));
      return;
    }
    // Flag S with `\s`, `\p{Space}`, `[[:space:]]`
    if (spaceIsAscii && (kind === AstCharacterSetKinds.space || value === 'space')) {
      replaceWith(setNegate(parseFragment(asciiSpaceChar), negate));
      return;
    }
    // Flag W with `\w`, `\p{Word}`, `[[:word:]]`
    if (wordIsAscii && (kind === AstCharacterSetKinds.word || value === 'word')) {
      replaceWith(createCharacterSet(AstCharacterSetKinds.word, {negate}));
      return;
    }
    if (kind === AstCharacterSetKinds.any) {
      replaceWith(createUnicodeProperty('Any'));
    } else if (kind === AstCharacterSetKinds.digit) {
      replaceWith(createUnicodeProperty('Nd', {negate}));
    } else if (kind === AstCharacterSetKinds.hex) {
      replaceWith(createUnicodeProperty('AHex', {negate}));
    } else if (kind === AstCharacterSetKinds.non_newline) {
      replaceWith(parseFragment(r`[^\n]`));
    } else if (kind === AstCharacterSetKinds.space) {
      // Can't use JS's Unicode-based `\s` since unlike Onig it includes `\uFEFF`, excludes `\x85`
      replaceWith(createUnicodeProperty('space', {negate}));
    } else if (kind === AstCharacterSetKinds.word) {
      replaceWith(setNegate(parseFragment(defaultWordChar), negate));
    } else if (kind === AstCharacterSetKinds.property) {
      if (!JsUnicodePropertyMap.has(slug(value))) {
        // Assume it's a script; no error checking is the price for avoiding heavyweight Unicode
        // data for all script names
        node.key = 'sc';
      }
    } else if (kind === AstCharacterSetKinds.posix) {
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
        replaceWith(parseFragment(`[${ascii}]`));
      } else {
        replaceWith(setNegate(parseFragment(PosixClassMap.get(value)), negate));
      }
    }
  },

  Directive(path, state) {
    const {node, parent, ast, remove, replaceWith, removeAllPrevSiblings, removeAllNextSiblings} = path;
    const {kind, flags} = node;
    if (kind === AstDirectiveKinds.flags) {
      if (!flags.enable && !flags.disable) {
        // Flag directive without flags; ex: `(?-)`, `(?--)`
        remove();
      } else {
        const flagGroup = prepContainer(createGroup({flags}), removeAllNextSiblings());
        replaceWith(flagGroup);
        traverseReplacement(flagGroup, path, state, FirstPassVisitor);
      }
    } else if (kind === AstDirectiveKinds.keep) {
      const firstAltFirstEl = ast.pattern.alternatives[0].elements[0];
      // Supporting a full-pattern wrapper around `\K` enables use with flag modifiers
      const hasWrapperGroup =
        // Not emulatable if within a `CapturingGroup`
        hasOnlyChild(ast.pattern, kid => kid.type === AstTypes.Group) &&
        firstAltFirstEl.alternatives.length === 1;
      const topLevel = hasWrapperGroup ? firstAltFirstEl : ast.pattern;
      if (parent.parent !== topLevel || topLevel.alternatives.length > 1) {
        throw new Error(r`Uses "\K" in a way that's unsupported`);
      }
      replaceWith(prepContainer(createLookaroundAssertion({behind: true}), removeAllPrevSiblings()));
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
        // support for Onig features nested classes, set intersection, Unicode properties, etc.).
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

  LookaroundAssertion({node}, state) {
    const {kind} = node;
    if (kind === AstLookaroundAssertionKinds.lookbehind) {
      state.passedLookbehind = true;
    }
  },

  Pattern: {
    enter({node}, {supportedGNodes}) {
      // For `\G` to be accurately emulatable using JS flag y, it must be at (and only at) the start
      // of every top-level alternative (with complex rules for what determines being at the start).
      // Additional `\G` error checking in `Assertion` visitor
      const leadingGs = [];
      let hasAltWithLeadG = false;
      let hasAltWithoutLeadG = false;
      for (const alt of node.alternatives) {
        if (alt.elements.length === 1 && alt.elements[0].kind === AstAssertionKinds.search_start) {
          // Remove the `\G` (leaving behind an empty alternative, and without adding JS flag y)
          // since a top-level alternative that includes only `\G` always matches at the start of the
          // match attempt. Note that this is based on Oniguruma's rules, and is different than other
          // regex flavors where `\G` matches at the end of the previous match (a subtle distinction
          // that's relevant after zero-length matches)
          alt.elements.pop();
        } else {
          const leadingG = getLeadingG(alt.elements);
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

  Quantifier({node}) {
    if (node.element.type === AstTypes.Quantifier) {
      // Change e.g. `a**` to `(?:a*)*`
      const group = prepContainer(createGroup(), [node.element]);
      // Manually set the parent since we're not using `replaceWith`
      group.parent = node;
      node.element = group;
    }
  },

  Subroutine({node}, {jsGroupNameMap}) {
    let {ref} = node;
    if (typeof ref === 'string' && !isValidJsGroupName(ref)) {
      ref = getAndStoreJsGroupName(ref, jsGroupNameMap);
      node.ref = ref;
    }
  },

  VariableLengthCharacterSet({node, replaceWith}, {accuracy, minTargetEs2024}) {
    const {kind} = node;
    if (kind === AstVariableLengthCharacterSetKinds.newline) {
      replaceWith(parseFragment('(?>\r\n?|[\n\v\f\x85\u2028\u2029])'));
    } else if (kind === AstVariableLengthCharacterSetKinds.grapheme) {
      if (accuracy === 'strict') {
        throw new Error(r`Use of "\X" requires non-strict accuracy`);
      }
      // `emojiRegex` is more permissive than `\p{RGI_Emoji}` since it allows over/under-qualified
      // emoji using a general pattern that matches any Unicode sequence following the structure of
      // a valid emoji. That actually makes it more accurate for matching any grapheme
      const emoji = minTargetEs2024 ? r`\p{RGI_Emoji}` : emojiRegex().source.replace(/\\u\{/g, `\\x{`);
      // Close approximation of an extended grapheme cluster. Details: <unicode.org/reports/tr29/>.
      // Skip name check to allow `RGI_Emoji` through, which Onig doesn't support
      replaceWith(parseFragment(r`(?>\r\n|${emoji}|\P{M}\p{M}*)`, {skipPropertyNameValidation: true}));
    } else {
      throw new Error(`Unexpected varcharset kind "${kind}"`);
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
        // Recursion doesn't affect any following backrefs to its `ref` (unlike other subroutines),
        // so don't wrap with a capture. The reffed group might have its name removed due to later
        // subroutine expansion
        const recursion = createRecursion(node.number);
        reffedNodesByReferencer.set(recursion, openRefs.get(node.number));
        replaceWith(recursion);
        // This node's kids have been removed from the tree, so no need to traverse them
        skip();
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

  Recursion({node, parent}, {reffedNodesByReferencer}) {
    // Recursion nodes are created during the current traversal; they're only traversed here if a
    // recursion node created during traversal is then copied by a subroutine expansion, e.g. with
    // `(?<a>\g<a>)\g<a>`
    const {ref} = node;
    // Immediate parent is an alternative or quantifier; can skip
    let reffed = parent;
    while ((reffed = reffed.parent)) {
      if (reffed.type === AstTypes.CapturingGroup && (reffed.name === ref || reffed.number === ref)) {
        break;
      }
    }
    // Track the referenced node because `ref`s are rewritten in a subsequent pass; capturing group
    // names and numbers might change due to subroutine expansion and duplicate group names
    reffedNodesByReferencer.set(node, reffed);
  },

  Subroutine(path, state) {
    const {node, replaceWith} = path;
    const {ref} = node;
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
      const reffedGroupFlagMods = getCombinedFlagModsFromFlagNodes(getAllParents(reffedGroupNode, node => {
        return node.type === AstTypes.Group && !!node.flags;
      }));
      const reffedGroupFlags = reffedGroupFlagMods ?
        getNewCurrentFlags(state.globalFlags, reffedGroupFlagMods) :
        state.globalFlags;
      if (!areFlagsEqual(reffedGroupFlags, state.currentFlags)) {
        replacement = prepContainer(createGroup({
          flags: getFlagModsFromFlags(reffedGroupFlags),
        }), [expandedSubroutine]);
      }
    }
    replaceWith(replacement);
    if (!isGlobalRecursion) {
      traverseReplacement(replacement, path, state, SecondPassVisitor);
    }
  },
};

const ThirdPassVisitor = {
  Backreference({node, replaceWith}, state) {
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
      replaceWith(prepContainer(createLookaroundAssertion({negate: true})));
    } else if (participants.length > 1) {
      // Multiplex
      const alts = participants.map(reffed => adoptAndSwapKids(
        createAlternative(),
        [createBackreference(reffed.number)]
      ));
      replaceWith(adoptAndSwapKids(createGroup(), alts));
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

  Recursion({node}, state) {
    if (node.ref === 0) {
      return;
    }
    // For the recursion's `ref`, use `number` rather than `name` because group names might have
    // been removed if they're duplicates within their alternation path, or they might be removed
    // later by the generator (depending on target) if they're duplicates within the overall
    // pattern. Since recursion appears within the group it refs, the reffed node's `number` has
    // already been recalculated
    node.ref = state.reffedNodesByReferencer.get(node).number;
  },

  Regex: {
    exit({node}, state) {
      // [HACK] Add unnamed captures to the end of the regex if needed to allow orphaned backrefs
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
        node.pattern.alternatives.at(-1).elements.push(emptyCapture);
      }
    },
  },
};

function adoptAndSwapKids(parent, kids) {
  kids.forEach(kid => kid.parent = parent);
  parent[getContainerAccessor(parent)] = kids;
  return parent;
}

function areFlagsEqual(a, b) {
  return a.dotAll === b.dotAll && a.ignoreCase === b.ignoreCase;
}

function canParticipateWithNode(capture, node) {
  // Walks to the left (prev siblings), down (sibling descendants), up (parent), then back down
  // (parent's prev sibling descendants) the tree in a loop
  let rightmostPoint = node;
  do {
    if (rightmostPoint.type === AstTypes.Pattern) {
      // End of the line; capture is not in node's alternation path
      return false;
    }
    if (rightmostPoint.type === AstTypes.Alternative) {
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
      if (kid === capture) {
        return true;
      }
      if (hasDescendant(kid, capture)) {
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
      if (key === 'type' && value === AstTypes.CapturingGroup) {
        // Key is the copied node, value is the origin node
        originMap.set(store, originMap.get(obj) ?? obj);
      }
      store[key] = value;
    }
  }
  return store;
}

// `Recursion` nodes are used only by the transformer
function createRecursion(ref) {
  return {
    type: AstTypes.Recursion,
    ref,
  };
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

// Returns the string key for the container that holds the node's kids
function getContainerAccessor(node) {
  for (const accessor of ['alternatives', 'classes', 'elements']) {
    if (node[accessor]) {
      return accessor;
    }
  }
  return null;
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
  // [NOTE] Not handling `Regex` kids (`pattern`, `flags`) and `CharacterClassRange` kids (`min`,
  // `max`) only because not needed by current callers
  if (node.type === AstTypes.Quantifier) {
    return [node.element];
  }
  const accessor = getContainerAccessor(node);
  return accessor && node[accessor];
}

function getLeadingG(els) {
  const firstToConsider = els.find(el => (
    el.kind === AstAssertionKinds.search_start ||
    isLoneGLookaround(el, {negate: false}) ||
    !isAlwaysZeroLength(el)
  ));
  if (!firstToConsider) {
    return null;
  }
  if (firstToConsider.kind === AstAssertionKinds.search_start) {
    return firstToConsider;
  }
  if (firstToConsider.type === AstTypes.LookaroundAssertion) {
    return firstToConsider.alternatives[0].elements[0];
  }
  if (isConsumptiveGroup(firstToConsider)) {
    const gNodesForGroup = [];
    // Recursively find `\G` nodes for all alternatives in the group
    for (const alt of firstToConsider.alternatives) {
      const leadingG = getLeadingG(alt.elements);
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

function hasDescendant(node, descendant) {
  const kids = getKids(node) ?? [];
  for (const kid of kids) {
    if (
      kid === descendant ||
      hasDescendant(kid, descendant)
    ) {
      return true;
    }
  }
  return false;
}

function isAlwaysZeroLength({type}) {
  return type === AstTypes.Assertion ||
    type === AstTypes.Directive ||
    type === AstTypes.LookaroundAssertion;
}

function isAlwaysNonZeroLength(node) {
  const types = [
    AstTypes.Character,
    AstTypes.CharacterClass,
    AstTypes.CharacterSet,
  ];
  return types.includes(node.type) || (
    node.type === AstTypes.Quantifier &&
    node.min &&
    types.includes(node.element.type)
  );
}

function isLoneGLookaround(node, options) {
  const opts = {
    negate: null,
    ...options,
  };
  return (
    node.type === AstTypes.LookaroundAssertion &&
    (opts.negate === null || node.negate === opts.negate) &&
    hasOnlyChild(node, kid => kid.kind === AstAssertionKinds.search_start)
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
  const ast = parse(tokenize(pattern), {
    ...options,
    // Providing a custom set of Unicode property names avoids converting some JS Unicode
    // properties (ex: `\p{Alpha}`) to Onig POSIX classes
    unicodePropertyMap: JsUnicodePropertyMap,
  });
  const alts = ast.pattern.alternatives;
  if (alts.length > 1 || alts[0].elements.length > 1) {
    return adoptAndSwapKids(createGroup(), alts);
  }
  return alts[0].elements[0];
}

function prepContainer(node, kids) {
  const accessor = getContainerAccessor(node);
  // Set the parent for the default container of a new node
  node[accessor][0].parent = node;
  if (kids) {
    adoptAndSwapKids(node[accessor][0], kids);
  }
  return node;
}

function setNegate(node, negate) {
  node.negate = negate;
  return node;
}

function traverseReplacement(replacement, {parent, key, container}, state, visitor) {
  traverse({
    // Don't use the `node` from `path`
    node: replacement,
    parent,
    key,
    container,
  }, state, visitor);
}

export {
  transform,
};
