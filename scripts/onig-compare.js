import {r} from '../src/utils.js';
import {ansi, areMatchDetailsEqual, err, ok, onigurumaResult, transpiledRegExpResult} from './utils.js';

// Help with improving this script or moving it into Jasmine specs would be very welcome

compare([
  [r`\x7F`, '\x7F'],
  [r`\x80`, '\x80'],
  [r`\x`, '\\x'],
  [r`\p{`, '\\p{'],
  [r`\O`, '\n'],
  [r`\u{A0}`, '\u{A0}\\u{A0}']
]);

async function compare(tests) {
  let numSame = 0;
  let numDiff = 0;
  for (let i = 0; i < tests.length; i++) {
    const [pattern, str] = tests[i];
    const lib = transpiledRegExpResult(pattern, str);
    const onig = await onigurumaResult(pattern, str);
    const searched = `/${pattern}/ with str "${esc(str)}" (len ${str.length})`;
    if (areMatchDetailsEqual(lib, onig)) {
      numSame++;
      ok(i, `Results matched for ${searched}${lib.error ? ` ${ansi.yellow}(both errored)${ansi.reset}` : ''}`);
      continue;
    }
    numDiff++;
    if (lib.error) {
      err(i, `Only lib errored for ${searched}`);
    } else if (onig.error) {
      err(i, `Only onig errored for ${searched}`);
    } else if (lib.result !== onig.result) {
      err(i, `Results differed for ${searched}: lib: ${lib.result && `"${esc(lib.result)}"`}, onig: ${onig.result && `"${esc(onig.result)}"`}`);
    } else if (lib.index !== onig.index) {
      err(i, `Match positions differed for ${searched}: lib: ${lib.index}, onig: ${onig.index}`);
    }
  }
  numSame &&= `${ansi.green}${numSame}${ansi.reset}`;
  numDiff &&= `${ansi.red}${numDiff}${ansi.reset}`;
  console.log(`\nFinished: ${numSame} same, ${numDiff} different`);
}

function esc(str) {
  return str.
    replace(/\n/g, '\\n').
    replace(/\r/g, '\\r').
    replace(/\0/g, '\\0');
}
