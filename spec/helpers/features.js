import {envFlags} from '../../src/utils.js';

const maxTestTargetForFlagGroups = envFlags.flagGroups ? null : 'ES2024';
const minTestTargetForFlagGroups = envFlags.flagGroups ? 'ES2025' : Infinity;
const minTestTargetForFlagV = 'ES2024';

export {
  maxTestTargetForFlagGroups,
  minTestTargetForFlagGroups,
  minTestTargetForFlagV,
};
