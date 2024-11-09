const ui = {
  input: document.getElementById('input'),
  output: document.getElementById('output'),
  subclassInfo: document.getElementById('subclass-info'),
  comparisonInfo: document.getElementById('comparison-info'),
};
const state = {
  flags: {
    i: getValue('flag-i'),
    m: getValue('flag-m'),
    x: getValue('flag-x'),
  },
  opts: {
    accuracy: getValue('option-accuracy'),
    avoidSubclass: getValue('option-avoidSubclass'),
    global: getValue('option-global'),
    hasIndices: getValue('option-hasIndices'),
    maxRecursionDepth: getValue('option-maxRecursionDepth'),
    target: getValue('option-target'),
    verbose: getValue('option-verbose'),
  },
  comparison: getValue('comparison'),
};

autoGrow();
showTranspiled();

function autoGrow() {
  ui.input.style.height = '0';
  ui.input.style.height = (ui.input.scrollHeight + 5) + 'px';
}

function showTranspiled() {
  ui.output.classList.remove('error', 'subclass');
  ui.subclassInfo.classList.add('hidden');
  const options = {
    ...state.opts,
    flags: `${state.flags.i ? 'i' : ''}${state.flags.m ? 'm' : ''}${state.flags.x ? 'x' : ''}`,
    maxRecursionDepth: state.opts.maxRecursionDepth === '' ? null : +state.opts.maxRecursionDepth,
  };
  const errorObj = {error: true};
  let details;
  let result = '';
  try {
    // Use `toDetails` but display as if `toRegExp` was called. This avoids erroring when the
    // selected `target` includes features that don't work in the user's browser
    details = OnigurumaToES.toDetails(ui.input.value, options);
    if (details.strategy) {
      result = getFormattedSubclass(details.pattern, details.flags, details.strategy);
      ui.subclassInfo.classList.remove('hidden');
      ui.output.classList.add('subclass');
    } else {
      result = `/${getRegExpLiteralPattern(details.pattern)}/${details.flags}`;
    }
  } catch (err) {
    details = errorObj;
    result = `Error: ${err.message}`;
    ui.output.classList.add('error');
  }
  ui.output.innerHTML = escapeHtml(result);

  // ## Compare to all other accuracy/target combinations
  if (!state.comparison) {
    ui.comparisonInfo.classList.add('hidden');
    return;
  }
  ui.comparisonInfo.classList.remove('hidden');
  const otherTargetAccuracyCombinations = ['ES2018', 'ES2024', 'ESNext'].flatMap(
    t => ['loose', 'default', 'strict'].map(a => ({target: t, accuracy: a}))
  ).filter(c => c.target !== options.target || c.accuracy !== options.accuracy);
  const differents = [];
  // Collect the different results, including differences in error status
  for (const other of otherTargetAccuracyCombinations) {
    let otherDetails;
    try {
      otherDetails = OnigurumaToES.toDetails(ui.input.value, {...options, ...other});
    } catch (err) {
      otherDetails = errorObj;
    } finally {
      if (!areDetailsEqual(details, otherDetails)) {
        differents.push({
          ...other,
          error: !!otherDetails.error,
        });
      }
    }
  }
  // Compose and display message about differences or lack thereof
  let str = 'Tested all 9 <code>target</code>/<code>accuracy</code> combinations.';
  if (differents.length) {
    const withError = [];
    const withDiff = [];
    differents.forEach(d => (d.error ? withError : withDiff).push(d));
    if (withError.length) {
      str += ` Can't emulate for ${listDifferents(withError)}.`;
    }
    if (withDiff.length) {
      str += ` Emulation ${details.error ? 'is possible' : 'used different details'} for ${listDifferents(withDiff)}.`;
    }
    ui.comparisonInfo.innerHTML = `<p>🔀 ${str}</p>`;
  } else {
    ui.comparisonInfo.innerHTML = `<p>🟰 ${str} Results were the same${
      details.error ? '' : `, except <code>ES2018</code> used flag <code>u</code>`
    }.</p>`;
  }
}

function areDetailsEqual(a, b) {
  if (a.error && b.error) {
    return true;
  }
  if (a.error !== b.error) {
    return false;
  }
  return a.pattern === b.pattern &&
    a.flags.replace(/[vu]/, '') === b.flags.replace(/[vu]/, '') &&
    a.strategy?.name === b.strategy?.name &&
    a.strategy?.subpattern === b.strategy?.subpattern;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function getFormattedSubclass(pattern, flags, {name, subpattern}) {
  return `new EmulatedRegExp('${
    pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  }', '${
    flags
  }', {\n  name: '${name}',${subpattern ? `\n  subpattern: '${subpattern}',` : ''}\n})`;
}

function getRegExpLiteralPattern(str) {
  return str ? str.replace(/\\?./gsu, m => m === '/' ? '\\/' : m) : '(?:)';
}

function getValue(id) {
  const el = document.getElementById(id);
  return el.type === 'checkbox' ? el.checked : el.value;
}

function listDifferents(arr) {
  const target = {};
  for (const a of arr) {
    target[a.target] ?? (target[a.target] = []);
    target[a.target].push(a.accuracy);
  }
  return Object.keys(target).map(t => {
    return `target <code>${t}</code> with ${
      target[t].length > 1 ? 'accuracies' : 'accuracy'
    } <code>${target[t].join('</code>/<code>')}</code>`;
  }).join(', ');
}

function setComparison(value) {
  state.comparison = value;
  showTranspiled();
}

function setFlag(flag, value) {
  state.flags[flag] = value;
  showTranspiled();
}

function setOption(option, value) {
  state.opts[option] = value;
  showTranspiled();
}
