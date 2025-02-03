import {toRegExp} from '../src/index.js';
import {cp, r} from '../src/utils.js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// vscode-oniguruma 2.0.1 uses Oniguruma 6.9.8
import oniguruma from 'vscode-oniguruma';

const ansi = {
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[38;2;100;100;100m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  yellow: '\x1b[38;2;253;182;0m',
};

/**
@param {keyof ansi} color
@param {string} str
@returns {string}
*/
function color(color, str) {
  return `${ansi[color]}${str}${ansi.reset}`;
}

function ok(i, msg) {
  console.log(`${typeof i === 'number' ? `  ${i}. ` : ''}${color('green', '✅')} ${msg}`);
}

function err(i, msg) {
  console.log(`${typeof i === 'number' ? `  ${i}. ` : ''}${color('red', '❌')} ${msg}`);
}

/**
@typedef {{
  result: string?;
  index: number?;
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
@type {MatchDetailsFn}
*/
const transpiledRegExpResult = (pattern, str, pos) => {
  let result;
  try {
    // `vscode-oniguruma` uses option `ONIG_OPTION_CAPTURE_GROUP` by default; see
    // <github.com/microsoft/vscode-oniguruma/blob/1970c417eb0ebcaf8c6607774934ab2f89549c92/src/index.ts#L380>
    const options = {rules: {captureGroup: true}};
    if (pos) {
      options.global = true;
    }
    const re = toRegExp(pattern, options);
    if (pos) {
      re.lastIndex = pos;
    }
    result = re.exec(str);
  } catch (err) {
    result = err;
  }
  return getMatchDetails(result);
};

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

async function onigurumaExec(pattern, str, pos = 0) {
  await loadOniguruma();
  // See <github.com/microsoft/vscode-oniguruma/blob/main/main.d.ts>
  const re = new oniguruma.OnigScanner([pattern]);
  const match = re.findNextMatchSync(str, pos);
  re.dispose();
  if (!match) {
    return null;
  }

  // Uncomment to see subpattern match details
  // for (const obj of match.captureIndices) {
  //   obj.match = str.slice(obj.start, obj.end);
  // }
  // console.log(match);

  const m = match.captureIndices[0];
  return {
    '0': str.slice(m.start, m.end),
    index: m.start,
  };
}

async function loadOniguruma() {
  const wasmPath = fileURLToPath(new URL('../node_modules/vscode-oniguruma/release/onig.wasm', import.meta.url));
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

function value(value) {
  if (value === null) {
    return color('gray', value);
  }
  if (typeof value === 'number') {
    return color('blue', value);
  }
  if (typeof value === 'string') {
    return color('cyan', `"${esc(value, ansi.cyan)}"`);
  }
  return String(value);
}

function esc(str, restoreEsc = '') {
  return str.
    replace(/\n/g, `${color('gray', r`\n`)}${restoreEsc}`).
    replace(/\r/g, `${color('gray', r`\r`)}${restoreEsc}`).
    replace(/\0/g, `${color('gray', r`\0`)}${restoreEsc}`);
}

export {
  areMatchDetailsEqual,
  color,
  cp,
  err,
  ok,
  onigurumaResult,
  r,
  transpiledRegExpResult,
  value,
};
