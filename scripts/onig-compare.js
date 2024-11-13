import {areMatchDetailsEqual, color, cp, err, ok, onigurumaResult, r, transpiledRegExpResult, value} from './utils.js';

// Help with improving this script and/or comparing with Oniguruma automaticlly in Jasmine specs
// would be very welcome

compare([
  [r`\0`, `\u{0}`],
  [r`\00`, `\u{0}`],
  [r`\000`, `\u{0}`],
  [r`[\000]`, `\u{0}`],
  [r`[\000]`, `0`],
  [r`\0000`, `\u{0}0`],
  [r`[\0000]`, `0`],
  [r`\1`, `\u{1}`],
  [r`\10`, cp(0o10)],
  [r`\18`, `\u{1}8`],
  [r`\177`, cp(0o177)],
  [r`\200`, cp(0o200)],
  [r`\c`, `c`],
  [r`[\c]`, `c`],
  [r`\N`, `\n`],
  [r`[\N]`, `\n`],
  [r`\N`, `\r`],
  [r`[\N]`, `\r`],
  [r`[\N]`, `N`],
  [r`\O`, `\n`],
  [r`[\O]`, `\n`],
  [r`\O`, `\r`],
  [r`[\O]`, `\r`],
  [r`[\O]`, `O`],
  [r`\o`, `o`],
  [r`[\o]`, `o`],
  [r`\o{1}`, `\u{1}`, `Octal code points not yet supported`],
  [r`[\o{1}]`, `\u{1}`, `Octal code points not yet supported`],
  [r`\p`, `p`],
  [r`[\p]`, `p`],
  [r`\p{`, `p{`],
  [r`[\p{]`, `p`],
  [r`\u`, `u`, r`Onig bug: pattern-terminating \u as identity escape`],
  [r`\u.`, `ua`],
  [r`[\u]`, `u`],
  [r`\u0`, `u0`],
  [r`[\u0]`, `u`],
  [r`\u00`, `u00`],
  [r`\u000`, `u000`],
  [r`\u0000`, `\u{0}`],
  [r`\uFFFF`, `\u{FFFF}`],
  [r`\u{`, `u{`],
  [r`[\u{]`, `u`],
  [r`\u{A}`, `\u{A}`],
  [r`[\u{A}]`, `u`],
  [r`\x`, `x`, r`Onig bug: pattern-terminating \x as identity escape`],
  [r`\x.`, `xa`, r`Onig bug: incomplete \x doesn't error but fails to match`],
  [r`[\x]`, `x`, r`Onig bug: incomplete \x doesn't error but fails to match`],
  [r`\x1`, `\u{1}`],
  [r`[\x1]`, `\u{1}`],
  [r`\x7F`, `\u{7F}`],
  [r`\x80`, `\u{80}`],
  [r`\x{`, `x{`, r`Incomplete "\x{" as identity unsupported: high ambiguity`],
  [r`[\x{]`, `x`, r`Incomplete "\x{" as identity unsupported: high ambiguity`],
  [r`\x{ 1 }`, `x{ 1 }`, r`Incomplete "\x{" as identity unsupported: high ambiguity`],
  [r`^\x{,2}$`, `xx`, r`Incomplete "\x" as identity unsupported: high ambiguity`],
  [r`^\x{2,}$`, `xx`],
  [r`\x{1}`, `\u{1}`],
  [r`[\x{1}]`, `\u{1}`],
  [r`\x{00000001}`, `\u{1}`], // 8 hex digits
  [r`\x{000000001}`, `\u{1}`], // 9 hex digits
  [r`\x{10FFFF}`, `\u{10FFFF}`],
  [r`\x{0010FFFF}`, `\u{10FFFF}`], // 8 hex digits
  [r`\x{00010FFFF}`, `\u{10FFFF}`], // 9 hex digits
  [r`\x{13FFFF}`, ``, `Beyond Unicode range: JS doesn't support`],
  [r`\x{140000}`, ``],
  [r`\x{0 1}`, `\u{0}\u{1}`, `Code point sequences not yet supported`],
  [r`\💖`, '💖'],
  [`\\\u{10000}`, '\u{10000}'],
]);

async function compare(tests) {
  let numSame = 0;
  let numDiff = 0;
  let numDiffExpected = 0;
  function logExpectedDiff(i, msg) {
    numDiffExpected++;
    console.log(`  └ ${color('gray', `(${i}. Difference expected: ${msg})`)}`);
  }
  for (let i = 0; i < tests.length; i++) {
    const [pattern, str, diffExplanation] = tests[i];
    const libMatch = transpiledRegExpResult(pattern, str);
    const onigMatch = await onigurumaResult(pattern, str);
    const searched = `${color('yellow', `/${pattern}/`)} with ${value(str)} ${color('gray', `(len ${str.length})`)}`;
    if (areMatchDetailsEqual(libMatch, onigMatch)) {
      numSame++;
      let detail = '';
      if (libMatch.error) {
        detail = 'error';
      } else if (libMatch.result === null) {
        detail = 'no match';
      }
      ok(i, `Results same for ${searched}${
        detail ? ` (${color('yellow', detail)})` : ''
      }`);
      if (diffExplanation) {
        logExpectedDiff(i, diffExplanation);
      }
      continue;
    }
    numDiff++;
    if (libMatch.error) {
      err(i, `Only the library errored for ${searched}`);
    } else if (onigMatch.error) {
      err(i, `Only Oniguruma errored for ${searched}`);
    } else if (libMatch.result !== onigMatch.result) {
      err(i, `Results differed for ${searched}: lib: ${value(libMatch.result)}, onig: ${value(onigMatch.result)}`);
    } else if (libMatch.index !== onigMatch.index) {
      err(i, `Match positions differed for ${searched}: lib: ${value(libMatch.index)}, onig: ${value(onigMatch.index)}`);
    } else {
      throw new Error(`Unexpected path for test ${i} ${tests[i]}`);
    }
    if (diffExplanation) {
      logExpectedDiff(i, diffExplanation);
    }
  }
  numSame &&= `${color('green', numSame)}`;
  numDiff &&= `${color('red', numDiff)}`;
  console.log(`\nFinished: ${numSame} same, ${numDiff} different, ${numDiffExpected} differences expected`);
}
