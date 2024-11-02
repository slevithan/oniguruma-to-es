import {areMatchDetailsEqual, err, ok, onigurumaResult, transpiledRegExpResult} from "./utils.js";

exec(process.argv.slice(2));

// Basic Oniguruma console-based tester that also does a comparison with Oniguruma-to-ES results
async function exec([pattern, str]) {
  if (!(typeof pattern === 'string' && typeof str === 'string')) {
    err(null, 'pattern and str args expected');
    return;
  }

  const libMatches = [];
  let libMatch = transpiledRegExpResult(pattern, str, 0);
  while (libMatch.result) {
    libMatches.push(libMatch);
    libMatch = transpiledRegExpResult(pattern, str, libMatch.index + libMatch.result.length);
  }
  const onigMatches = [];
  let onigMatch = await onigurumaResult(pattern, str, 0);
  while (onigMatch.result) {
    onigMatches.push(onigMatch);
    onigMatch = await onigurumaResult(pattern, str, onigMatch.index + onigMatch.result.length);
  }

  console.log('Pattern:', pattern);
  console.log('String:', str);
  if (onigMatch.error) {
    err(null, `Oniguruma error: ${onigMatch.error.message}`);
  } else {
    console.log('Oniguruma results:', onigMatches);
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
      ok(null, 'Oniguruma and library results matched');
    }
  }
}
