import {envSupportsDuplicateNames, envSupportsFlagGroups} from '../../src/utils.js';

const maxTestTargetForDuplicateNames = envSupportsDuplicateNames ? null : 'ES2024';
const maxTestTargetForFlagGroups = envSupportsFlagGroups ? null : 'ES2024';
const minTestTargetForFlagGroups = envSupportsFlagGroups ? 'ES2025' : Infinity;
const minTestTargetForFlagV = 'ES2024';

export {
  maxTestTargetForDuplicateNames,
  maxTestTargetForFlagGroups,
  minTestTargetForFlagGroups,
  minTestTargetForFlagV,
};
