import {toRegExp} from '../dist/index.mjs';
import {readFileSync} from 'node:fs';
// vscode-oniguruma 2.0.1 uses Oniguruma 6.9.8
import oniguruma from 'vscode-oniguruma';

const ansi = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
};

function ok(i, msg) {
  console.log(`${i ? `  ${i}. ` : ''}${ansi.green}✅${ansi.reset} ${msg}`);
}

function err(i, msg) {
  console.log(`${i ? `  ${i}. ` : ''}${ansi.red}❌ ${msg}${ansi.reset}`);
}

/**
@typedef {{
  result: string | null;
  index: number | null;
  error?: Error;
}} MatchDetails
*/
/**
@template [T=MatchDetails]
@typedef MatchDetailsFn
@type {{
  (pattern: string, str: string, pos?: number): T;
}}
*/
/**
@param {RegExpExecArray | null | Error} match
@returns {MatchDetails}
*/
function getMatchDetails(match) {
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

/**
@type {MatchDetailsFn<Promise<MatchDetails>>}
*/
const onigurumaResult = async (pattern, str, pos) => {
  let result;
  try {
    result = await onigurumaExec(pattern, str, pos);
  } catch (err) {
    result = err;
  }
  return getMatchDetails(result);
};

/**
@type {MatchDetailsFn}
*/
const transpiledRegExpResult = (pattern, str, pos) => {
  let result;
  try {
    const options = pos ? {global: true} : undefined;
    const re = toRegExp(pattern, '', options);
    if (pos) {
      re.lastIndex = pos;
    }
    result = re.exec(str);
  } catch (err) {
    result = err;
  }
  return getMatchDetails(result);
};

async function onigurumaExec(pattern, str, pos = 0) {
  await loadOniguruma();
  // See https://github.com/microsoft/vscode-oniguruma/blob/main/main.d.ts
  const re = new oniguruma.OnigScanner([pattern]);
  const match = re.findNextMatchSync(str, pos);
  if (!match) {
    return null;
  }
  const m = match.captureIndices[0];
  return {
    '0': str.slice(m.start, m.end),
    index: m.start,
  };
}

async function loadOniguruma() {
  const wasmPath = `${import.meta.dirname}/../node_modules/vscode-oniguruma/release/onig.wasm`;
  const wasmBin = readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasmBin);
}

/**
@param {MatchDetails} a
@param {MatchDetails} b
@returns {boolean}
*/
function areMatchDetailsEqual(a, b) {
  return !(a.index !== b.index || a.result !== b.result || !!a.error !== !!b.error);
}

export {
  ansi,
  areMatchDetailsEqual,
  err,
  ok,
  onigurumaResult,
  transpiledRegExpResult,
};
