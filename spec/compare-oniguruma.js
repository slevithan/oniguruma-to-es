import { error } from 'node:console';
import {toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import oniguruma from 'vscode-oniguruma';

// Help with improving this tester or moving it into Jasmine specs would be very welcome!
// Note: vscode-oniguruma 2.0.1 uses Oniguruma 6.9.8

compare([
  [r`\x7F`, '\x7F'],
  [r`\x80`, '\x80'],
  [r`\x07F`, '\x7F'],
  [r`\O`, '\n'],
]);

async function compare(tests) {
  let numSame = 0;
  let numDiff = 0;
  for (let i = 0; i < tests.length; i++) {
    const [pattern, str] = tests[i];
    let libMatch;
    let onigMatch;
    try {
      libMatch = toRegExp(pattern).exec(str);
    } catch (err) {
      libMatch = err;
    }
    try {
      onigMatch = await onigurumaExec(pattern, str);
    } catch (err) {
      onigMatch = err;
    }
    const lib = getDetails(libMatch);
    const onig = getDetails(onigMatch);
    const searched = `[/${pattern}/ with str "${esc(str)}"]`;
    if ((lib.result === onig.result && lib.index === onig.index) || (lib.error && onig.error)) {
      numSame++;
      ok(i, `Results match ${searched}`);
      continue;
    }
    numDiff++;
    if (lib.error) {
      err(i, `Only lib errored ${searched}`);
    } else if (onig.error) {
      err(i, `Only onig errored ${searched}`);
    } else if (lib.result !== onig.result) {
      err(i, `Results differ ${searched} lib: ${lib.result && `"${esc(lib.result)}"`}, onig: ${onig.result && `"${esc(onig.result)}"`}`);
    } else if (lib.index !== onig.index) {
      err(i, `Positions differ ${searched} lib: ${lib.index}, onig: ${onig.index}`);
    }
  }
  numSame &&= `${ansi.green}${numSame}${ansi.reset}`;
  numDiff &&= `${ansi.red}${numDiff}${ansi.reset}`;
  console.log(`\nFinished: ${numSame} same, ${numDiff} different`);
}

async function loadOniguruma() {
  const wasmPath = path.join(import.meta.dirname, '..', 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');
  const wasmBin = readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasmBin);
}

async function onigurumaExec(pattern, str) {
  await loadOniguruma();
  // See https://github.com/microsoft/vscode-oniguruma/blob/main/main.d.ts
  const re = new oniguruma.OnigScanner([pattern]);
  const match = re.findNextMatchSync(str, 0);
  if (!match) {
    return null;
  }
  const m = match.captureIndices[0];
  return {
    '0': str.slice(m.start, m.end),
    index: m.start,
  };
}

function ok(i, msg) {
  console.log(`  ${i}. ${ansi.green}🆗${ansi.reset} ${msg}`);
}

function err(i, msg) {
  console.log(`  ${i}. ${ansi.red}❌ ${msg}${ansi.reset}`);
}

function esc(str) {
  return str.
    replace(/\n/g, '\\n').
    replace(/\r/g, '\\r').
    replace(/\0/g, '\\0');
}

function getDetails(match) {
  if (!match) {
    return {
      result: null,
      index: null,
    }
  }
  if (match instanceof Error) {
    return {
      result: null,
      index: null,
      error: match,
    };
  }
  return {
    result: match[0],
    index: match.index,
  };
}

const ansi = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};
