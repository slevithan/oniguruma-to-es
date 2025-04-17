import {areMatchDetailsEqual, color, cp, err, ok, onigurumaResult, r, transpiledRegExpResult, value} from './script-utils.js';
/**
@import {MatchDetails} from './script-utils.js';
*/

/*
Oniguruma tester for the command line that also reports a comparison with Oniguruma-To-ES.

You can run it using any of the following commands:
$ node scripts/onig-match.js '…' '…'
$ pnpm onig:match '…' '…'
$ npm run onig:match '…' '…'

The first argument is the pattern; the second is the target string. Additional, optional arguments
can be provided in any order.

Insert characters by code point in the target string using `\u{…}`:
$ pnpm onig:match '\n' '\u{A}'

Don't compare to Oniguruma-To-ES results:
$ pnpm onig:match '…' '…' no-compare

The reported run time for Oniguruma includes the time to load the WASM module (in other words, it's
the time to run the regex in Oniguruma *from JS*). The run time for the library includes the time
to transpile the pattern to JS.
*/

exec(process.argv.slice(2));

async function exec(args) {
  const {pattern, target, options} = getArgs(args);
  printInput(pattern, target);

  const onigMatches = [];
  const onigT0 = performance.now();
  let onigMatch = await onigurumaResult(pattern, target, 0);
  while (onigMatch.result !== null) {
    onigMatches.push(onigMatch);
    if (onigMatch.index === target.length) {
      // Guard against zero-length match at the end of the string, since setting the search `pos`
      // beyond the string's length doesn't prevent a search
      break;
    }
    onigMatch = await onigurumaResult(pattern, target, onigMatch.index + (onigMatch.result.length || 1));
  }
  const onigT1 = performance.now();
  printOnigResults(onigMatch, onigMatches);
  console.log(color('gray', `⚡ Oniguruma: ${(onigT1 - onigT0).toFixed(3)}ms`));

  if (!options.compare) {
    console.log(color('gray', '⏩ Skipped library comparison'));
    return;
  }

  const libMatches = [];
  const libT0 = performance.now();
  let libMatch = transpiledRegExpResult(pattern, target, 0);
  while (libMatch.result !== null) {
    libMatches.push(libMatch);
    libMatch = transpiledRegExpResult(pattern, target, libMatch.index + (libMatch.result.length || 1));
  }
  const libT1 = performance.now();
  console.log(color('gray', `⚡ Library: ${(libT1 - libT0).toFixed(3)}ms`));
  printLibComparison(onigMatch, onigMatches, libMatch, libMatches);
}

function getArgs([pattern, target, ...rest]) {
  if (typeof pattern !== 'string' || typeof target !== 'string') {
    err(null, 'pattern and target args expected');
    return;
  }
  const compare = !rest.includes('no-compare');
  // HACK: pnpm, unlike npm, auto-escapes backslashes in string args, so undo that here
  if (process.env.npm_config_user_agent?.startsWith('pnpm/')) {
    pattern = pattern.replace(/\\\\/g, '\\');
    target = target.replace(/\\\\/g, '\\');
  }
  // HACK: Replace unescaped `\u{…}` in the target string with the referenced code point
  target = target.replace(
    /\\u\{([^\}]+)\}|\\?./gsu,
    (m, code) => m.startsWith(r`\u{`) ? cp(parseInt(code, 16)) : m
  );
  return {
    pattern,
    target,
    options: {
      compare,
    },
  };
}

/**
@param {string} pattern
@param {string} target
*/
function printInput(pattern, target) {
  console.log('Pattern:', color('yellow', `/${pattern}/`));
  console.log('String:', `${value(target)} ${color('gray', `(len ${target.length})`)}`);
}

/**
@param {MatchDetails} result
@param {Array<MatchDetails>} matches
*/
function printOnigResults(result, matches) {
  if (result.error) {
    err(null, `Oniguruma error: ${result.error.message}`);
  } else {
    const output = matches.length ?
      (matches.length > 1 ? matches : matches[0]) :
      `${color('gray', 'No match')}`;
    console.log(`Oniguruma results (${matches.length}):`, output);
  }
}

/**
@param {MatchDetails} onigResult
@param {Array<MatchDetails>} onigMatches
@param {MatchDetails} libResult
@param {Array<MatchDetails>} libMatches
@returns {boolean} Whether the results are the same
*/
function printLibComparison(onigResult, onigMatches, libResult, libMatches) {
  if (!!libResult.error !== !!onigResult.error) {
    err(null, `Oniguruma and library results differed (only ${libResult.error ? 'library' : 'Oniguruma'} threw error)`);
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
      return true;
    }
  }
  return false;
}
