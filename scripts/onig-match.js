import {areMatchDetailsEqual, color, cp, err, ok, onigurumaResult, r, transpiledRegExpResult, value} from './utils.js';

// To run this script:
// - npm run onig:match '\w' 'a'
// - npm run onig:match '\n' '\u{A}'
// Don't use pnpm because it auto-escapes backslashes in string args

exec(process.argv.slice(2));

// Basic Oniguruma tester for the console; also reports a comparison with Oniguruma-to-ES
async function exec([pattern, str]) {
  if (!(typeof pattern === 'string' && typeof str === 'string')) {
    err(null, 'pattern and str args expected');
    return;
  }
  // [HACK] Replace unescaped `\u{…}` in the target string with the referenced code point
  str = str.replace(
    /\\u\{([^\}]+)\}|\\?./gsu,
    (m, code) => m.startsWith(r`\u{`) ? cp(parseInt(code, 16)) : m
  );

  const libMatches = [];
  let libMatch = transpiledRegExpResult(pattern, str, 0);
  while (libMatch.result !== null) {
    libMatches.push(libMatch);
    libMatch = transpiledRegExpResult(pattern, str, libMatch.index + (libMatch.result.length || 1));
  }
  const onigMatches = [];
  let onigMatch = await onigurumaResult(pattern, str, 0);
  while (onigMatch.result !== null) {
    onigMatches.push(onigMatch);
    if (onigMatch.index === str.length) {
      // Guard against zero-length match at the end of the string, since setting the search `pos`
      // beyond the string's length doesn't prevent a search
      break;
    }
    onigMatch = await onigurumaResult(pattern, str, onigMatch.index + (onigMatch.result.length || 1));
  }

  console.log('Pattern:', color('yellow', `/${pattern}/`));
  console.log('String:', `${value(str)} ${color('gray', `(len ${str.length})`)}`);
  if (onigMatch.error) {
    err(null, `Oniguruma error: ${onigMatch.error.message}`);
  } else {
    const result = !onigMatches.length ?
      `${color('gray', 'No match')}` :
      (onigMatches.length > 1 ? onigMatches : onigMatches[0]);
    console.log(`Oniguruma results (${onigMatches.length}):`, result);
  }
  if (!!libMatch.error !== !!onigMatch.error) {
    err(null, `Oniguruma and library results differed (only ${libMatch.error ? 'library' : 'Oniguruma'} threw error)`);
  } else if (libMatches.length !== onigMatches.length) {
    err(null, `Oniguruma and library had different number of results (${onigMatches.length}, ${libMatches.length})`);
  } else {
    let hasDiff = false;
    for (let i = 0; i < libMatches.length; i++) {
      if (!areMatchDetailsEqual(libMatches[i], onigMatches[i])) {
        hasDiff = true;
        break;
      }
    }
    if (hasDiff) {
      err(null, 'Oniguruma and library results differed');
      console.log('Library results:', libMatches);
    } else {
      ok(null, 'Results same for Oniguruma and library');
    }
  }
}
