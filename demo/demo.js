let useFlagI = getValue('flag-i');
let useFlagM = getValue('flag-m');
let useFlagX = getValue('flag-x');
let optionAllowBestEffortValue = getValue('option-allow-best-effort');
let optionMaxRecursionDepthValue = getValue('option-max-recursion-depth');
let optionOptimizeValue = getValue('option-optimize');
let optionTargetValue = getValue('option-target');

function getValue(id) {
  const el = document.getElementById(id);
  return el.type === 'checkbox' ? el.checked : el.value;
}

const inputEl = document.getElementById('input');
autoGrow(inputEl);
showOutput(inputEl);

function showOutput(el) {
  const input = el.value;
  const flags = `${useFlagI ? 'i' : ''}${useFlagM ? 'm' : ''}${useFlagX ? 'x' : ''}`;
  const outputEl = document.getElementById('output');
  outputEl.classList.remove('error');
  let output = '';
  try {
    const re = toRegExp(input, flags, {
      allowBestEffort: optionAllowBestEffortValue,
      maxRecursionDepth: +optionMaxRecursionDepthValue,
      optimize: optionOptimizeValue,
      target: optionTargetValue,
    });
    output = `/${re.source}/${re.flags}`;
  } catch (e) {
    outputEl.classList.add('error');
    output = `Error: ${e.message}`;
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

function setFlagI(checked) {
  useFlagI = checked;
  showOutput(inputEl);
}
function setFlagM(checked) {
  useFlagM = checked;
  showOutput(inputEl);
}
function setFlagX(checked) {
  useFlagX = checked;
  showOutput(inputEl);
}
function setOptionAllowBestEffort(checked) {
  optionAllowBestEffortValue = checked;
  showOutput(inputEl);
}
function setOptionMaxRecursionDepth(value) {
  optionMaxRecursionDepthValue = value;
  showOutput(inputEl);
}
function setOptionOptimize(checked) {
  optionOptimizeValue = checked;
  showOutput(inputEl);
}
function setOptionTarget(value) {
  optionTargetValue = value;
  showOutput(inputEl);
}
