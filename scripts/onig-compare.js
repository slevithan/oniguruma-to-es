import {r} from '../src/utils.js';
import {areMatchDetailsEqual, color, err, ok, onigurumaResult, transpiledRegExpResult} from './utils.js';

// Help with improving this script or comparing with Oniguruma automaticlly in Jasmine specs would
// be very welcome

compare([
  [r`\0`, `\0`],
  [r`\00`, `\0`],
  [r`\000`, `\0`],
  [r`\0000`, `\u{0}0`],
  [r`\c`, r`\c`],
  [r`\O`, `\n`], // Ucase o
  [r`\p`, r`\p`],
  [r`\p{`, r`\p{`],
  [r`\u`, r`\u`],
  [r`\u0`, r`\u0`],
  [r`\u00`, r`\u00`],
  [r`\u000`, r`\u000`],
  [r`\u0000`, `\0`],
  [r`\u{A0}`, `\u{A0}`],
  [r`\x`, r`\x`],
  [r`\x1`, `\x01`],
  [r`\x7F`, `\x7F`],
  [r`\x80`, `\x80`],
]);

async function compare(tests) {
  let numSame = 0;
  let numDiff = 0;
  for (let i = 0; i < tests.length; i++) {
    const [pattern, str] = tests[i];
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
    }
  }
  numSame &&= `${color('green', numSame)}`;
  numDiff &&= `${color('red', numDiff)}`;
  console.log(`\nFinished: ${numSame} same, ${numDiff} different`);
}

function value(value) {
  if (value === null) {
    return color('gray', value);
  }
  if (typeof value === 'number') {
    return color('blue', value);
  }
  if (typeof value === 'string') {
    return color('cyan', `"${esc(value)}"`);
  }
  return String(value);
}

function esc(str) {
  return str.
    replace(/\n/g, '\\n').
    replace(/\r/g, '\\r').
    replace(/\0/g, '\\0');
}
