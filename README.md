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

The returned `pattern` and `flags` can be provided directly to the `RegExp` constructor.

#### Type `OnigurumaFlags`

A string with `i`, `m`, and `x` in any order (all optional).

> [!WARNING]
> Oniguruma's flag `m` is equivalent to JavaScript's flag `s` (`dotAll`).

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

Flags are any combination of Oniguruma flags `i`, `m`, and `x`, and JavaScript flags `d` and `g`. Oniguruma's flag `m` is equivalent to JavaScript's flag `s`.

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

`regex` syntax and behavior is a strict superset of native JavaScript `RegExp`, so the AST is very close to representing native ESNext JavaScript but with some added features (atomic groups, possessive quantifiers, recursion). The `regex` AST doesn't use some `regex` features like flag `x` or subroutines because they follow PCRE behavior and work somewhat differently than in Oniguruma. The AST represents what's needed to precisely reproduce the Oniguruma behavior.

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

Sets the JavaScript language version for generated patterns and flags. Later targets allow faster processing, simpler generated source, and support for additional Oniguruma features.

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

<table >
  <tr>
    <th colspan="2">Description</th>
    <th>Example</th>
    <th>ES2018</th>
    <th>ES2024</th>
    <th>ESNext</th>
    <th>Comments</th>
  </tr>
  <tr valign="top">
    <th rowspan="3"><b>Flags</b></th>
    <td><code>i</code></td>
    <td><code>/i</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Unicode case folding<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>m</code></td>
    <td><code>/m</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Equivalent to JS flag <code>s</code> (<code>dotAll</code>)<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>x</code></td>
    <td><code>/x</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Unicode whitespace chars ignored<br>
      🗸 Whitespace not allowed between a quantifier and the <code>?</code>/<code>+</code> that makes it lazy/possessive<br>
      🗸 Line comments with <code>#</code><br>
      🗸 Whitespace/comments separate tokens (ex: <code>\1 0</code>)<br>
      🗸 Whitespace and <code>#</code> not ignored in char classes<br>
    </td>
  </tr>
  <tr valign="top">
    <th rowspan="2" valign="top"><b>Flag modifiers</b></th>
    <td>Groups</td>
    <td><code>(?im-x:…)</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Allows enabling and disabling the same flag (priority: disable)<br>
      🗸 Allows lone or multiple <code>-</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td>Directives</td>
    <td><code>(?im-x)</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Continues until end of pattern or group (spanning alternatives)<br>
    </td>
  </tr>
  <tr valign="top">
    <th colspan="2"><b>Comment groups</b></th>
    <td><code>(?#…)</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Allows escaping <code>\)</code><br>
    </td>
  </tr>
  <tr valign="top">
    <th rowspan="9"><b>Characters</b></th>
    <td>Literal</td>
    <td><code>E!</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Code point based matching<br>
      🗸 <code>]</code>, <code>{</code>, <code>}</code> don't require escaping<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Identity</td>
    <td><code>\E\!</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Different set than JS<br>
      🗸 Invalid for multibyte chars<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Metachar</td>
    <td><code>\t</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 JS set plus <code>\a</code>, <code>\e</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\xNN</code></td>
    <td><code>\xA0</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 1-digit hex <code>\xA</code><br>
      🗸 2-digit hex <code>\xA0</code><br>
      🗸 Incomplete <code>\x</code> invalid<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\uNNNN</code></td>
    <td><code>\uFFFF</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Incomplete <code>\u</code> invalid<br>
    </td>
  </tr>
  <tr valign="top">
    <td><code>\u{N…}</code></td>
    <td><code>\u{A}</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Incomplete <code>\u{…}</code> invalid<br>
      🗸 Allows padding<br>
      🗸 Allows leading 0s up to 6 total digits<br>
      🗸 Invalid above 10FFFF<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Escaped num</td>
    <td><code>\20</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 Can be null, backref, error, octal, identity escape, literal, or multiple, based on complex context<br>
      🗸 Always treat escaped single digit 1-9 outside char class as backref<br>
      🗸 Throws if not enough captures<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Control</td>
    <td><code>\C-A</code></td>
    <td>✅</td>
    <td>✅</td>
    <td>✅</td>
    <td>
      🗸 <code>\cx</code> with A-Za-z<br>
      🗸 <code>\C-x</code> with A-Za-z<br>
    </td>
  </tr>
  <tr valign="top">
    <td>Other</td>
    <td><code>\M-\1</code></td>
    <td>✖️</td>
    <td>✖️</td>
    <td>✖️</td>
    <td>
      Not yet supported; all are extremely rare<br>
      🗙 <code>\cx</code>, <code>\C-x</code> with non-A-Za-z<br>
      🗙 Meta-code <code>\M-x</code>, <code>\M-\C-x</code><br>
    </td>
  </tr>
  <tr valign="top">
    <td colspan="7"><b>Work in progress…</b></td>
  </tr>
</table>

## ㊗️ Unicode / mixed case-sensitivity

Oniguruma-To-ES fully supports mixed case-sensitivity (and handles the Unicode edge cases) regardless of JavaScript [target](#target). It also restricts Unicode properties to those supported by Oniguruma and the target JavaScript version.

Oniguruma-To-ES focuses on being lightweight to make it better for use in browsers. This is partly achieved by not including heavyweight Unicode character data, which imposes a couple of minor/rare restrictions:

- Character class intersection and nested negated character classes are unsupported with target `ES2018`. Use target `ES2024` or later if you need support for these Oniguruma features.
- A handful of Unicode properties that target a specific character case (ex: `\p{Lower}`) can't be used case-insensitively in patterns that contain other characters with a specific case that are used case-sensitively.
  - In other words, almost every usage is fine, inluding `A\p{Lower}`, `(?i:A\p{Lower})`, `(?i:A)\p{Lower}`, `(?i:A(?-i:\p{Lower}))`, and `\w(?i:\p{Lower})`, but not `A(?i:\p{Lower})`.
  - Using these properties case-insensitively is basically never done intentionally, so you're unlikely to encounter this error unless it's catching a mistake.

## 👀 Similar projects

[JsRegex](https://github.com/jaynetics/js_regex) transpiles [Onigmo](https://github.com/k-takata/Onigmo) regexes to JavaScript (Onigmo is a fork of Oniguruma that has slightly different syntax/behavior). JsRegex is written in Ruby and relies on the [Regexp::Parser](https://github.com/ammar/regexp_parser) Onigmo parser, which means regexes must be pre-transpiled on the server to use them in JavaScript. In contrast, Oniguruma-To-ES is written in JavaScript, so it can be used at runtime. JsRegex also produces regexes with more edge cases that don't perfectly follow Oniguruma's behavior, in addition to the Oniguruma/Onigmo differences.

## 🏷️ About

Oniguruma-To-ES was created by [Steven Levithan](https://github.com/slevithan).

If you want to support this project, I'd love your help by contributing improvements, sharing it with others, or [sponsoring](https://github.com/sponsors/slevithan) ongoing development.

© 2024–present. MIT License.
