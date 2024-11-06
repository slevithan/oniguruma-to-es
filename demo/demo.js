const state = {
  flags: {
    i: getValue('flag-i'),
    m: getValue('flag-m'),
    x: getValue('flag-x'),
  },
  opts: {
    allowSubclassBasedEmulation: getValue('option-allowSubclassBasedEmulation'),
    emulation: getValue('option-emulation'),
    global: getValue('option-global'),
    hasIndices: getValue('option-hasIndices'),
    maxRecursionDepth: getValue('option-maxRecursionDepth'),
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
  outputEl.classList.remove('error', 'subclass');
  infoEl.classList.add('hidden');
  const opts = {
    ...state.opts,
    maxRecursionDepth: state.opts.maxRecursionDepth === '' ? null : +state.opts.maxRecursionDepth,
  };
  let output = '';
  try {
    // Use `compile` but display output as if `toRegExp` was called. This avoids erroring when the
    // selected `target` includes features that don't work in the user's browser
    const compiled = OnigurumaToES.compile(input, flags, opts);
    if (opts.allowSubclassBasedEmulation && compiled._internal) {
      infoEl.classList.remove('hidden');
      outputEl.classList.add('subclass');
      output = getFormattedSubclass(compiled.pattern, compiled.flags, {
        strategy: compiled._internal.strategy,
        subpattern: compiled._internal.subpattern,
      });
    } else {
      output = `/${getRegExpLiteralPattern(compiled.pattern)}/${compiled.flags}`;
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

function getFormattedSubclass(pattern, flags, {strategy, subpattern}) {
  return `new WrappedRegExp('${
    pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  }', '${
    flags
  }', {\n  strategy: '${strategy}',${subpattern ? `\n  subpattern: '${subpattern}',` : ''}\n})`;
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
