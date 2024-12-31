import {envSupportsFlagGroups} from '../../src/utils.js';

const maxTestTargetForFlagGroups = envSupportsFlagGroups ? null : 'ES2024';
const minTestTargetForFlagGroups = envSupportsFlagGroups ? 'ES2025' : Infinity;
const minTestTargetForFlagV = 'ES2024';

export {
  maxTestTargetForFlagGroups,
  minTestTargetForFlagGroups,
  minTestTargetForFlagV,
};
