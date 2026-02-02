/**
 * Effect Registries
 *
 * This module exports all effect registries that consolidate:
 * - Parser patterns
 * - Value extractors
 * - Runtime handlers
 * - Documentation
 *
 * Benefits of registry-based architecture:
 * 1. Impossible to have incomplete implementations - everything in one place
 * 2. Self-documenting - each entry has a description
 * 3. Easy to audit - can programmatically check for gaps
 * 4. Easy to add new effects - one file, one place
 * 5. Type-safe - TypeScript ensures all required fields exist
 * 6. Testable - each registry entry can be unit tested in isolation
 */

// Condition Registry
export {
  CONDITIONS,
  getConditionDefinition,
  parseCondition,
  checkCondition,
  REGISTERED_CONDITION_TYPES,
  type ConditionDefinition,
  type ParsedConditionData,
} from './conditionRegistry';

// Filter Registry
export {
  FILTERS,
  getFilterDefinition,
  parseFilter,
  parseAllFilters,
  applyFilter,
  applyFilters,
  REGISTERED_FILTER_PROPERTIES,
  type FilterDefinition,
  type ParsedFilterData,
  type FilterContext,
} from './filterRegistry';

// Trigger Registry
export {
  TRIGGERS,
  getTriggerDefinition,
  parseTrigger,
  doesTriggerMatch,
  REGISTERED_TRIGGER_TYPES,
  type TriggerDefinition,
  type ParsedTriggerData,
  type TriggerContext,
} from './triggerRegistry';

/**
 * Registry Validation Utilities
 */

import { ConditionType, EffectTrigger } from '../types';
import { REGISTERED_CONDITION_TYPES } from './conditionRegistry';
import { REGISTERED_FILTER_PROPERTIES } from './filterRegistry';
import { REGISTERED_TRIGGER_TYPES } from './triggerRegistry';

// Check which condition types are missing from registry
export function getMissingConditionTypes(): ConditionType[] {
  const allTypes = Object.values(ConditionType);
  return allTypes.filter(type => !REGISTERED_CONDITION_TYPES.includes(type));
}

// Check which trigger types are missing from registry
export function getMissingTriggerTypes(): EffectTrigger[] {
  const allTypes = Object.values(EffectTrigger);
  return allTypes.filter(type => !REGISTERED_TRIGGER_TYPES.includes(type));
}

// Validate that registry is complete
export function validateRegistries(): {
  conditionsMissing: ConditionType[];
  triggersMissing: EffectTrigger[];
  isComplete: boolean;
} {
  const conditionsMissing = getMissingConditionTypes();
  const triggersMissing = getMissingTriggerTypes();

  return {
    conditionsMissing,
    triggersMissing,
    isComplete: conditionsMissing.length === 0 && triggersMissing.length === 0,
  };
}

// Get registry statistics
export function getRegistryStats(): {
  conditions: number;
  filters: number;
  triggers: number;
  total: number;
} {
  return {
    conditions: REGISTERED_CONDITION_TYPES.length,
    filters: REGISTERED_FILTER_PROPERTIES.length,
    triggers: REGISTERED_TRIGGER_TYPES.length,
    total: REGISTERED_CONDITION_TYPES.length +
           REGISTERED_FILTER_PROPERTIES.length +
           REGISTERED_TRIGGER_TYPES.length,
  };
}
