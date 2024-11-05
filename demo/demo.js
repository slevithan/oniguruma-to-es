const state = {
  flags: {
    i: getValue('flag-i'),
    m: getValue('flag-m'),
    x: getValue('flag-x'),
  },
  opts: {
    allowBestEffort: getValue('option-allow-best-effort'),
    allowSubclassBasedEmulation: getValue('option-subclass'),
    global: getValue('option-global'),
    hasIndices: getValue('option-has-indices'),
    maxRecursionDepth: getValue('option-max-recursion-depth'),
    optimize: getValue('option-optimize'),
    target: getValue('option-target'),
  },
};

const inputEl = document.getElementById('input');
autoGrow(inputEl);
showOutput(inputEl);

function showOutput(el) {
  const input = el.value;
  const flags = `${state.flags.i ? 'i' : ''}${state.flags.m ? 'm' : ''}${state.flags.x ? 'x' : ''}`;
  const outputEl = document.getElementById('output');
  const infoEl = document.getElementById('info');
  outputEl.classList.remove('error');
  infoEl.classList.add('hidden');
  const opts = {
    ...state.opts,
    maxRecursionDepth: state.opts.maxRecursionDepth === '' ? null : +state.opts.maxRecursionDepth,
  };
  let output = '';
  try {
    if (opts.allowSubclassBasedEmulation) {
      const wrappedRe = OnigurumaToES.toRegExp(input, flags, opts);
      if (wrappedRe._internal) {
        infoEl.classList.remove('hidden');
        output = `new WrappedRegExp('${wrappedRe.source.replace(/'/g, "\\'")}', '${wrappedRe.flags}', {
  strategy: '${wrappedRe._internal.strategy}',${wrappedRe._internal.subpattern ? `
  subpattern: '${wrappedRe._internal.subpattern}',` : ''}
})`;
      } else {
        output = getFormattedCompileOutput(input, flags, opts);
      }
    } else {
      output = getFormattedCompileOutput(input, flags, opts);
    }
  } catch (err) {
    outputEl.classList.add('error');
    output = `Error: ${err.message}`;
  }
  outputEl.innerHTML = escapeHtml(output);
}

function autoGrow(el) {
  el.style.height = '0';
  el.style.height = (el.scrollHeight + 5) + 'px';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function getFormattedCompileOutput(input, flags, opts) {
  // Use `compile` but display output as if `toRegExp` was called. This avoids erroring when the
  // selected `target` includes features that don't work in the user's browser
  const re = OnigurumaToES.compile(input, flags, opts);
  return `/${getRegExpLiteralPattern(re.pattern)}/${re.flags}`;
}

function getRegExpLiteralPattern(str) {
  return str ? str.replace(/\\?./gsu, m => m === '/' ? '\\/' : m) : '(?:)';
}

function getValue(id) {
  const el = document.getElementById(id);
  return el.type === 'checkbox' ? el.checked : el.value;
}

function setFlag(flag, value) {
  state.flags[flag] = value;
  showOutput(inputEl);
}

function setOption(option, value) {
  state.opts[option] = value;
  showOutput(inputEl);
}
