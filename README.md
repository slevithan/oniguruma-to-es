# Oniguruma-To-ES

A lightweight **Oniguruma to JavaScript RegExp transpiler** that runs in the browser or on your server. Use it to:

- Take advantage of Oniguruma's extended regex capabilities in JavaScript.
- Run regexes intended for Oniguruma in JavaScript, such as those used in TextMate grammars (used by VS Code, [Shiki](https://shiki.matsu.io/) syntax highlighter, etc.).
- Share regexes across your Ruby and JavaScript code.

Compared to running the actual [Oniguruma](https://github.com/kkos/oniguruma) C library in JavaScript via WASM bindings (e.g. via [vscode-oniguruma](https://github.com/microsoft/vscode-oniguruma) or [node-oniguruma](https://github.com/atom/node-oniguruma)), this library is **much lighter weight** and its regexes **run much faster** since they run as native JavaScript.

### [Try the demo REPL](https://slevithan.github.io/oniguruma-to-es/demo/)

Oniguruma-To-ES deeply understands all of the hundreds of large and small differences in Oniguruma and JavaScript regex syntax and behavior across multiple JavaScript version targets. It's *obsessive* about precisely following Oniguruma syntax rules and ensuring that the emulated features it supports have **exactly the same behavior**, even in extreme edge cases. A few uncommon features can't be perfectly emulated and allow rare differences, but if you don't want to allow this, you can disable the `allowBestEffort` option to throw for such patterns (see details below).

## 📜 Contents

- [Install and use](#️-install-and-use)
- [API](#-api)
- [Options](#-options)
- [Supported features](#-supported-features)
- [Unicode / mixed case-sensitivity](#️-unicode--mixed-case-sensitivity)

## 🕹️ Install and use

```sh
npm install oniguruma-to-es
```

```js
import {compile} from 'oniguruma-to-es';
```

In browsers:

```html
<script type="module">
  import {compile} from 'https://esm.run/oniguruma-to-es';
  compile(String.raw`…`);
</script>
```

<details>
  <summary>Using a global name (no import)</summary>

```html
<script src="https://cdn.jsdelivr.net/npm/oniguruma-to-es/dist/index.min.js"></script>
<script>
  const {compile} = OnigurumaToES;
</script>
```
</details>

## 🔑 API

### `compile`

Transpiles an Oniguruma regex pattern and flags to native JavaScript.

```ts
function compile(
  pattern: string,
  flags?: OnigurumaFlags,
  options?: CompileOptions
): {
  pattern: string;
  flags: string;
};
```

The returned `pattern` and `flags` can be provided directly to the JavaScript `RegExp` constructor. Various JavaScript flags might have been added or removed compared to the Oniguruma flags provided, as part of the emulation process.

#### Type `OnigurumaFlags`

A string with `i`, `m`, and `x` in any order (all optional).

> [!IMPORTANT]
> Oniguruma and JavaScript both have an `m` flag but with different meanings. Oniguruma's `m` is equivalent to JavaScript's `s` (`dotAll`).

#### Type `CompileOptions`

```ts
type CompileOptions = {
    allowBestEffort?: boolean;
    maxRecursionDepth?: number | null;
    optimize?: boolean;
    target?: 'ES2018' | 'ES2024' | 'ESNext';
};
```

See [Options](#-options) for more details.

### `toRegExp`

Transpiles an Oniguruma regex pattern and flags and returns a native JavaScript `RegExp`.

```ts
function toRegExp(
  pattern: string,
  flags?: string,
  options?: CompileOptions
): RegExp;
```

The `flags` string can be any combination of Oniguruma flags `i`, `m`, and `x`, plus JavaScript flags `d` and `g`. Oniguruma's flag `m` is equivalent to JavaScript's flag `s`. See [Options](#-options) for more details.

> [!TIP]
> Try it in the [demo REPL](https://slevithan.github.io/oniguruma-to-es/demo/).

### `toOnigurumaAst`

Generates an Oniguruma AST from an Oniguruma pattern and flags.

```ts
function toOnigurumaAst(
  pattern: string,
  flags?: OnigurumaFlags
): OnigurumaAst;
```

### `toRegexAst`

Generates a [`regex`](https://github.com/slevithan/regex) AST from an Oniguruma pattern and flags.

```ts
function toRegexAst(
  pattern: string,
  flags?: OnigurumaFlags
): RegexAst;
```

`regex`'s syntax and behavior is a strict superset of native JavaScript, so the AST is very close to representing native ESNext JavaScript `RegExp` but with some added features (atomic groups, possessive quantifiers, recursion). The `regex` AST doesn't use some of `regex`'s extended features like flag `x` or subroutines because they follow PCRE behavior and work somewhat differently than in Oniguruma. The AST represents what's needed to precisely reproduce the Oniguruma behavior using `regex`.

## 🔩 Options

These options are shared by functions [`compile`](#compile) and [`toRegExp`](#toregexp).

### `allowBestEffort`

Allows results that differ from Oniguruma in rare cases. If `false`, throws if the pattern can't be emulated with identical behavior for the given `target`.

*Default: `true`.*

<details>
  <summary>More details</summary>

Specifically, this option enables the following additional features, depending on `target`:

- All targets (`ESNext` and earlier):
  - Enables use of `\X` using a close approximation of a Unicode extended grapheme cluster.
  - Enables recursion (e.g. via `\g<0>`) using a depth limit specified via option `maxRecursionDepth`.
- `ES2024` and earlier:
  - Enables use of case-insensitive backreferences to case-sensitive groups.
- `ES2018`:
  - Enables use of POSIX classes `[:graph:]` and `[:print:]` using ASCII versions rather than the Unicode versions available for `ES2024` and later. Other POSIX classes always use Unicode.
</details>

### `maxRecursionDepth`

If `null`, any use of recursion throws. If an integer between `2` and `100` (and `allowBestEffort` is `true`), common recursion forms are supported and recurse up to the specified max depth.

*Default: `6`.*

<details>
  <summary>More details</summary>

Using a high limit is not a problem if needed. Although there can be a performance cost (minor unless it's exacerbating an existing issue with runaway backtracking), there is no effect on regexes that don't use recursion.
</details>

### `optimize`

Simplify the generated pattern when it doesn't change the meaning.

*Default: `true`.*

### `target`

Sets the JavaScript language version for generated patterns and flags. Later targets allow faster processing, simpler generated source, and support for additional features.

*Default: `'ES2024'`.*

<details open>
  <summary>More details</summary>

- `ES2018`: Uses JS flag `u`.
  - Emulation restrictions: Character class intersection, nested negated character classes, and Unicode properties added after ES2018 are not allowed.
  - Generated regexes might use ES2018 features that require Node.js 10 or a browser version released during 2018 to 2023 (in Safari's case). Minimum requirement for any regex is Node.js 6 or a 2016-era browser.
- `ES2024`: Uses JS flag `v`.
  - No emulation restrictions.
  - Generated regexes require Node.js 20 or a 2023-era browser ([compat table](https://caniuse.com/mdn-javascript_builtins_regexp_unicodesets)).
- `ESNext`: Uses JS flag `v` and allows use of flag groups and duplicate group names.
  - Benefits: Faster transpilation, simpler generated source, and duplicate group names are preserved across separate alternation paths.
  - Generated regexes might use features that require Node.js 23 or a 2024-era browser (except Safari, which lacks support).
</details>

## ✅ Supported features

Following are the supported features by target. Targets `ES2024` and `ESNext` have the same emulation capabilities, although resulting regexes might differ (though not in the strings they match).

Notice that nearly every feature has at least subtle differences from JavaScript. Some features and sub-features listed as unsupported can be added in future versions, but some are not emulatable with native JavaScript regexes. Unsupported features throw an error.

<table>
  <tr>
    <th colspan="2">Feature</th>
    <th>Example</th>
    <th>ES2018</th>
    <th>ES2024+</th>
    <th>Subfeatures &amp; JS differences</th>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="3">Flags</th>
    <td><code>i</code></td>
    <td><code>i</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Unicode case folding (same as JS with flag <code>u</code>, <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>m</code></td>
    <td><code>m</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Equivalent to JS flag <code>s</code> (<code>dotAll</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>x</code></td>
    <td><code>x</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Unicode whitespace ignored<br>
      ✔ Line comments with <code>#</code><br>
      ✔ Whitespace/comments allowed between a token and its quantifier<br>
      ✔ Whitespace/comments between a quantifier and the <code>?</code>/<code>+</code> that makes it lazy/possessive changes it to a chained quantifier<br>
      ✔ Whitespace/comments separate tokens (ex: <code>\1 0</code>)<br>
      ✔ Whitespace and <code>#</code> not ignored in char classes<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="2" valign="top">Flag modifiers</th>
    <td>Groups</td>
    <td><code>(?im-x:…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Unicode case folding for <code>i</code><br>
      ✔ Allows enabling and disabling the same flag (priority: disable)<br>
      ✔ Allows lone or multiple <code>-</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>Directives</td>
    <td><code>(?im-x)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Continues until end of pattern or group (spanning alternatives)<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="9">Characters</th>
    <td>Literal</td>
    <td><code>E</code>, <code>!</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Code point based matching (same as JS with flag <code>u</code>, <code>v</code>)<br>
      ✔ Standalone <code>]</code>, <code>{</code>, <code>}</code> don't require escaping<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Identity escape</td>
    <td><code>\E</code>, <code>\!</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Different allowed set than JS<br>
      ✔ Invalid for multibyte chars<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Char escapes</td>
    <td><code>\t</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ JS set plus <code>\a</code>, <code>\e</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\x</code></td>
    <td><code>\xA0</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ 1 hex digit <code>\xA</code><br>
      ✔ 2 hex digits <code>\xA0</code> (same as JS)<br>
      ✔ Incomplete <code>\x</code> is invalid (like JS with flag <code>u</code>, <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\u</code></td>
    <td><code>\uFFFF</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Incomplete <code>\u</code> is invalid (like JS with flag <code>u</code>, <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\u{…}</code></td>
    <td><code>\u{A}</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Allows whitespace padding<br>
      ✔ Allows leading 0s up to 6 total hex digits (JS allows unlimited)<br>
      ✔ Incomplete <code>\u{</code> is invalid (like JS with flag <code>u</code>, <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Escaped num</td>
    <td><code>\20</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Can be backref, error, null, octal, identity escape, or any of these combined with literal digits, based on complex rules that differ from JS<br>
      ✔ Always handles escaped single digit 1-9 outside char class as backref<br>
      ✔ Allows null with 1-3 0s (unlike JS in any mode)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Control</td>
    <td><code>\cA</code>, <code>\C-A</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ With A-Za-z (JS: only <code>\c</code> form)<br>
      ✔ Incomplete <code>\c</code> is invalid (like JS with flag <code>u</code>, <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td colspan="2">Other (very rare)</td>
    <td align="middle">❌</td>
    <td align="middle">❌</td>
    <td>
      Not yet supported:<br>
      ● <code>\cx</code>, <code>\C-x</code> with non-A-Za-z<br>
      ● Meta-code <code>\M-x</code>, <code>\M-\C-x</code><br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="5">Character sets</th>
    <td>Digit, word</td>
    <td><code>\d</code>, <code>\w</code>, etc.</td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS (ASCII)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Hex digit</td>
    <td><code>\h</code>, <code>\H</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ ASCII<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Whitespace</td>
    <td><code>\s</code>, <code>\S</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ ASCII (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Dot</td>
    <td><code>.</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Excludes only <code>\n</code> (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Unicode property</td>
    <td><code>\p{L}</code>,<br><code>\P{L}</code></td>
    <td align="middle">✅<sup>[1]</sup></td>
    <td align="middle">✅</td>
    <td>
      ✔ Categories<br>
      ✔ Binary properties<br>
      ✔ Scripts<br>
      ✔ Aliases<br>
      ✔ POSIX properties<br>
      ✔ Negate with <code>\p{^…}</code>, <code>\P{^…}</code><br>
      ✔ Insignificant spaces, underscores, and casing in names<br>
      ✔ <code>\p</code>, <code>\P</code> without <code>{</code> is identity escape (like JS without flag <code>u</code>, <code>v</code>)<br>
      ✔ JS prefixes invalid (ex: <code>Script=</code>)<br>
      ✔ JS properties of strings invalid<br>
      ❌ Blocks (wontfix<sup>[2]</sup>)<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="2">Variable-length sets</th>
    <td>Newline</td>
    <td><code>\R</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Matched atomically<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Grapheme</td>
    <td><code>\X</code></td>
    <td align="middle">☑️</td>
    <td align="middle">☑️</td>
    <td>
      ● Uses a close approximation<br>
      ✔ Matched atomically<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="6">Character classes</th>
    <td>Base</td>
    <td><code>[…]</code>, <code>[^…]</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Unescaped <code>-</code> is literal char in some contexts (different than JS rules in any mode)<br>
      ✔ Fewer chars require escaping than JS<br>
      ✔ No subtraction operator (from JS flag <code>v</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Empty</td>
    <td><code>[]</code>, <code>[^]</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Invalid (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Ranges</td>
    <td><code>[a-z]</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS with flag <code>u</code>, <code>v</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>POSIX classes</td>
    <td><code>[[:word:]]</code></td>
    <td align="middle">☑️<sup>[3]</sup></td>
    <td align="middle">✅</td>
    <td>
      ✔ All use Unicode interpretations<br>
      ✔ Negate with <code>[:^…:]</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>Nested classes</td>
    <td><code>[…[…]]</code></td>
    <td align="middle">☑️<sup>[4]</sup></td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS with flag <code>v</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>Intersection</td>
    <td><code>[…&amp;&amp;…]</code></td>
    <td align="middle">❌</td>
    <td align="middle">✅</td>
    <td>
      ✔ Doesn't require nested classes for union and ranges (unlike JS)<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="7">Assertions</th>
    <td>Line start, end</td>
    <td><code>^</code>, <code>$</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Multiline mode only (compared to JS)<br>
      ✔ Only <code>\n</code> as newline (unlike JS)<br>
      ✔ Allows following quantifier (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>String start, end</td>
    <td><code>\A</code>, <code>\z</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Like JS <code>^</code> <code>$</code> without JS flag <code>m</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>String end or before terminating newline</td>
    <td><code>\Z</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Only <code>\n</code> as newline<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Search start</td>
    <td><code>\G</code></td>
    <td align="middle">☑️</td>
    <td align="middle">☑️</td>
    <td>
      ● Supported when used at start of pattern (if no top-level alternation) and when at start of all top-level alternatives<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Word boundary</td>
    <td><code>\b</code>, <code>\B</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Unicode interpretation (unlike JS)<br>
      ✔ Allows following quantifier (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Lookahead</td>
    <td><code>(?=…)</code>,<br><code>(?!…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Allows following quantifier (unlike JS with flag <code>u</code>, <code>v</code>)<br>
      ✔ Values captured within min-0 quantified lookahead remain referenceable (unlike JS)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Lookbehind</td>
    <td><code>(?&lt;=…)</code>,<br><code>(?&lt;!…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Variable-length quantifiers within lookbehind invalid (unlike JS)<br>
      ✔ Allows variable-length top-level alternatives<br>
      ✔ Allows following quantifier (unlike JS in any mode)<br>
      ✔ Values captured within min-0 quantified lookbehind remain referenceable<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="3">Quantifiers</th>
    <td>Greedy, lazy</td>
    <td><code>*</code>, <code>+?</code>, <code>{2}</code>, etc.</td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Possessive</td>
    <td><code>?+</code>, <code>*+</code>, <code>++</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ <code>+</code> suffix doesn't possessivize <code>{…}</code> quantifiers (creates a chained quantifier instead)<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Chained</td>
    <td><code>**</code>, <code>??+*</code>, <code>{2,3}+</code>, etc.</td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Each applies itself to the preceding repetition<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="4">Groups</th>
    <td>Noncapturing</td>
    <td><code>(?:…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Atomic</td>
    <td><code>(?&gt;…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Supported<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Capturing</td>
    <td><code>(…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Is noncapturing if any named capture is used<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Named capturing</td>
    <td><code>(?&lt;n&gt;…)</code>,<br><code>(?'n'…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Allows duplicate names<br>
      ✔ Error for group names invalid in Oniguruma or JS<br>
    </td>
  </tr>

  <tr valign="top">
    <th align="left" rowspan="7">Other</th>
    <td>Comment groups</td>
    <td><code>(?#…)</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Allows escaping <code>\)</code>, <code>\\</code><br>
      ✔ Comments allowed between a token and its quantifier<br>
      ✔ Comments between a quantifier and the <code>?</code>/<code>+</code> that makes it lazy/possessive changes it to a chained quantifier<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Alternation</td>
    <td><code>…|…</code></td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Same as JS<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Keep</td>
    <td><code>\K</code></td>
    <td align="middle">☑️</td>
    <td align="middle">☑️</td>
    <td>
      ● Supported if used at top level and no top-level alternation is used<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Absence operators</td>
    <td><code>(?~…)</code></td>
    <td align="middle">❌</td>
    <td align="middle">❌</td>
    <td>
      ● Some forms are supportable<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Conditionals</td>
    <td><code>(?(1)…)</code></td>
    <td align="middle">❌</td>
    <td align="middle">❌</td>
    <td>
      ● Some forms are supportable<br>
    </td>
  </tr>
  <tr valign="top">
    <td colspan="2">Unsupported JS features are handled using Oniguruma syntax rules</td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ <code>[\q{…}]</code> matches literal <code>q</code>, etc.<br>
      ✔ <code>[a--b]</code> includes the invalid reversed range <code>a</code> to <code>-</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td colspan="2">Invalid Oniguruma syntax</td>
    <td align="middle">✅</td>
    <td align="middle">✅</td>
    <td>
      ✔ Error; not passed through<br>
    </td>
  </tr>

  <tr valign="top">
    <td colspan="7"><b>Not yet complete…</b></td>
  </tr>
</table>

As detailed as the table above is, it doesn't include all aspects that Oniguruma-To-ES emulates. For example, most aspects that work the same as JavaScript are omitted, as are aspects of non-JavaScript features that work the same in other regex flavors that support them.

### Footnotes

1. Target `ES2018` doesn't allow Unicode property names added in JavaScript specifications after ES2018.
2. Unicode blocks are easily emulatable but their character data would significantly increase library weight, and they're a flawed, arguably-unuseful feature (use Unicode scripts and other properties instead).
3. With target `ES2018`, the specific POSIX classes `[:graph:]` and `[:print:]` use ASCII versions rather than the Unicode versions available for target `ES2024` and later, and they result in an error if option `allowBestEffort` is disabled.
4. Target `ES2018` doesn't allow nested negated character classes.

## ㊗️ Unicode / mixed case-sensitivity

Oniguruma-To-ES fully supports mixed case-sensitivity (and handles the Unicode edge cases) regardless of JavaScript [target](#target). It also restricts Unicode properties to those supported by Oniguruma and the target JavaScript version.

Oniguruma-To-ES focuses on being lightweight to make it better for use in browsers. This is partly achieved by not including heavyweight Unicode character data, which imposes a couple of minor/rare restrictions:

- Character class intersection and nested negated character classes are unsupported with target `ES2018`. Use target `ES2024` or later if you need support for these Oniguruma features.
- With targets before `ESNext`, a handful of Unicode properties that target a specific character case (ex: `\p{Lower}`) can't be used case-insensitively in patterns that contain other characters with a specific case that are used case-sensitively.
  - In other words, almost every usage is fine, including `A\p{Lower}`, `(?i:A\p{Lower})`, `(?i:A)\p{Lower}`, `(?i:A(?-i:\p{Lower}))`, and `\w(?i:\p{Lower})`, but not `A(?i:\p{Lower})`.
  - Using these properties case-insensitively is basically never done intentionally, so you're unlikely to encounter this error unless it's catching a mistake.

## 👀 Similar projects

[JsRegex](https://github.com/jaynetics/js_regex) transpiles [Onigmo](https://github.com/k-takata/Onigmo) regexes to JavaScript (Onigmo is a fork of Oniguruma that has slightly different syntax/behavior). JsRegex is written in Ruby and relies on the [Regexp::Parser](https://github.com/ammar/regexp_parser) Ruby gem, which means regexes must be pre-transpiled on the server to use them in JavaScript. In contrast, Oniguruma-To-ES is written in JavaScript and does its own parsing, so it can be used at runtime. JsRegex also produces regexes with more edge cases that don't perfectly follow Oniguruma's behavior, in addition to the Oniguruma/Onigmo differences.

## 🏷️ About

Oniguruma-To-ES was created by [Steven Levithan](https://github.com/slevithan).

If you want to support this project, I'd love your help by contributing improvements, sharing it with others, or [sponsoring](https://github.com/sponsors/slevithan) ongoing development.

© 2024–present. MIT License.
