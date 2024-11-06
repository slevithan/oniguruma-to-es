const duplicateCaptureNamesSupported = (() => {
  try {
    new RegExp('(?<n>)|(?<n>)');
  } catch (e) {
    return false;
  }
  return true;
})();
const maxTestTargetForDuplicateNames = duplicateCaptureNamesSupported ? null : 'ES2024';

const patternModsSupported = (() => {
  try {
    new RegExp('(?i:)');
  } catch (e) {
    return false;
  }
  return true;
})();
const maxTestTargetForPatternMods = patternModsSupported ? null : 'ES2024';
const minTestTargetForPatternMods = patternModsSupported ? 'ESNext' : Infinity;

const minTestTargetForFlagV = 'ES2024';

export {
  maxTestTargetForDuplicateNames,
  maxTestTargetForPatternMods,
  minTestTargetForFlagV,
  minTestTargetForPatternMods,
};
