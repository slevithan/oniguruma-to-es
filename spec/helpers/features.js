const duplicateCaptureNamesSupported = (() => {
  try {
    new RegExp('(?<n>)|(?<n>)');
  } catch (e) {
    return false;
  }
  return true;
})();

const maxTargetForDuplicateNames = duplicateCaptureNamesSupported ? null : 'ES2024';

export {
  maxTargetForDuplicateNames,
};
