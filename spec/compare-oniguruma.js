import {toRegExp} from '../dist/index.mjs';
import {r} from '../src/utils.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import oniguruma from 'vscode-oniguruma';

// Help with improving this tester or moving it into Jasmine specs would be very welcome!
// Note: vscode-oniguruma 2.0.1 uses Oniguruma 6.9.8

const tests = [
  [r`\Aa`, 'a'],
];

async function compare() {
  let numOk = 0;
  let numErr = 0;
  for (let i = 0; i < tests.length; i++) {
    const [pattern, str] = tests[i];
    const libMatch = toRegExp(pattern).exec(str);
    const onigMatch = await onigurumaExec(pattern, str);
    const libValue = libMatch && libMatch[0];
    const libIndex = libMatch && libMatch.index;
    const onigValue = onigMatch && onigMatch[0];
    const onigIndex = onigMatch && onigMatch.index;
    if (libValue !== onigValue) {
      numErr++;
      err(`${i}. Results differ ["${pattern}" with str "${str}"] lib: ${libMatch && `"${libValue}"`}, onig: ${onigMatch && `"${onigValue}"`}`);
    } else if (libIndex !== onigIndex) {
      numErr++;
      err(`${i}. Positions differ ["${pattern}" with str "${str}"] lib: ${libIndex}, onig: ${onigIndex}`);
    } else {
      numOk++;
      ok(`${i}. Results match ["${pattern}" with str "${str}"]`);
    }
  }
  console.log(`\nFinished: ${numOk} OK, ${numErr} error${numErr === 1 ? '' : 's'}`);
}

compare();

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

function err(msg) {
  console.log(ansiEscape.red, `❌ ${msg}`, ansiEscape.reset);
}

function ok(msg) {
  console.log(ansiEscape.green, `🆗 ${msg}`, ansiEscape.reset);
}

const ansiEscape = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};
