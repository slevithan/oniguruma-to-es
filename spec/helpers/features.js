export const duplicateCaptureNamesSupported = (() => {
  try {
    new RegExp('(?<n>)|(?<n>)');
  } catch (e) {
    return false;
  }
  return true;
})();
