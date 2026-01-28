/**
 * Effect Implementation Registry
 *
 * Central registry of which effect types and triggers are actually implemented
 * in the EffectEngine. This is used for:
 * 1. Runtime validation to warn about unimplemented effects
 * 2. Audit scripts to identify implementation gaps
 * 3. Documentation of what's supported
 *
 * IMPORTANT: When adding a new effect type handler to EffectEngine.resolveAction(),
 * you MUST also add it to IMPLEMENTED_EFFECT_TYPES here.
 */

import { EffectType, EffectTrigger, CardEffectDefinition, EffectAction } from './types';

// ============================================
// IMPLEMENTED EFFECT TYPES
// These have case handlers in EffectEngine.resolveAction()
// ============================================

export const IMPLEMENTED_EFFECT_TYPES: ReadonlySet<EffectType> = new Set([
  // Keywords - static abilities
  EffectType.RUSH,
  EffectType.BLOCKER,
  EffectType.DOUBLE_ATTACK,
  EffectType.BANISH,

  // Power modifications
  EffectType.BUFF_SELF,
  EffectType.BUFF_POWER,
  EffectType.BUFF_ANY,
  EffectType.BUFF_COMBAT,
  EffectType.DEBUFF_POWER,
  EffectType.SET_POWER_ZERO,
  EffectType.SET_BASE_POWER,

  // Draw effects
  EffectType.DRAW_CARDS,
  EffectType.MILL_DECK,
  EffectType.DISCARD_FROM_HAND,
  EffectType.LOOK_AT_TOP_DECK,

  // DON! effects
  EffectType.GAIN_ACTIVE_DON,
  EffectType.GAIN_RESTED_DON,
  EffectType.ATTACH_DON,
  EffectType.ADD_DON,

  // KO effects
  EffectType.KO_CHARACTER,
  EffectType.KO_COST_OR_LESS,
  EffectType.KO_POWER_OR_LESS,

  // Card movement
  EffectType.RETURN_TO_HAND,
  EffectType.SEND_TO_DECK_BOTTOM,
  EffectType.SEND_TO_TRASH,

  // State changes
  EffectType.REST_CHARACTER,
  EffectType.ACTIVATE_CHARACTER,
  EffectType.FREEZE,

  // Life effects
  EffectType.ADD_TO_LIFE,
  EffectType.TAKE_LIFE,
  EffectType.LOOK_AT_LIFE,
  EffectType.TRASH_LIFE,

  // Grant effects
  EffectType.GRANT_KEYWORD,

  // Combat restrictions
  EffectType.CANT_BE_BLOCKED,

  // Cost modifications
  EffectType.REDUCE_COST,
  EffectType.INCREASE_COST,
  EffectType.DEBUFF_COST,

  // Attack active (DON!! x1 abilities)
  EffectType.CAN_ATTACK_ACTIVE,

  // Add from trash to hand
  EffectType.DRAW_FROM_TRASH,

  // Opponent effects
  EffectType.OPPONENT_DISCARD,

  // Stage effects
  EffectType.GRANT_RUSH_VS_CHARACTERS,

  // Play from hand/deck effects
  EffectType.PLAY_FROM_HAND,

  // Search/reveal effects
  EffectType.SEARCH_AND_SELECT,
  EffectType.SEARCH_DECK,

  // DON activation
  EffectType.ACTIVE_DON,

  // Play from zones
  EffectType.PLAY_FROM_TRASH,
  EffectType.PLAY_FROM_DECK,

  // Combat restrictions
  EffectType.CANT_ATTACK,

  // Protection effects
  EffectType.IMMUNE_KO,
  EffectType.IMMUNE_EFFECTS,

  // Opponent DON effects
  EffectType.OPPONENT_RETURN_DON,

  // Reveal effects
  EffectType.REVEAL_HAND,

  // Silence (negate effects)
  EffectType.SILENCE,

  // Replacement effects
  EffectType.PREVENT_KO,

  // New complex effects
  EffectType.SWAP_POWER,
  EffectType.REDIRECT_ATTACK,
  EffectType.REST_DON,
  EffectType.REORDER_LIFE,
  EffectType.PREVENT_LIFE_ADD,
  EffectType.IMMUNE_KO_UNTIL,
  EffectType.CANT_BE_RESTED,

  // Formerly stub effects (now implemented)
  EffectType.BUFF_OTHER,
  EffectType.BUFF_FIELD,
  EffectType.DRAW_AND_TRASH,
  EffectType.IMMUNE_COMBAT,
  EffectType.BECOME_BLOCKER,
  EffectType.OPPONENT_TRASH_CARDS,
  EffectType.OPPONENT_TRASH_FROM_HAND,
  EffectType.SEND_TO_DECK_TOP,
  EffectType.RETURN_DON,
  EffectType.UNBLOCKABLE,
  EffectType.GRANT_EFFECT,
  EffectType.TAKE_ANOTHER_TURN,
  EffectType.WIN_GAME,
]);

// ============================================
// IMPLEMENTED TRIGGERS
// These are checked and processed by EffectEngine.checkTriggers()
// ============================================

export const IMPLEMENTED_TRIGGERS: ReadonlySet<EffectTrigger> = new Set([
  // Passive/always active
  EffectTrigger.PASSIVE,

  // Main phase activation
  EffectTrigger.ACTIVATE_MAIN,
  EffectTrigger.MAIN,  // Event [Main] effects
  EffectTrigger.ONCE_PER_TURN,

  // Play triggers
  EffectTrigger.ON_PLAY,
  EffectTrigger.ON_PLAY_FROM_TRIGGER,  // When card played via Trigger ability

  // Combat triggers
  EffectTrigger.ON_ATTACK,
  EffectTrigger.ON_BLOCK,
  EffectTrigger.COUNTER,
  EffectTrigger.AFTER_BATTLE,

  // DON! triggers
  EffectTrigger.DON_X,
  EffectTrigger.DON_TAP,        // When DON is rested to pay cost
  EffectTrigger.ATTACH_DON,     // When DON is attached to a character

  // KO triggers
  EffectTrigger.ON_KO,
  EffectTrigger.PRE_KO,              // Before character would be KO'd (allows prevention)
  EffectTrigger.AFTER_KO_CHARACTER,  // After any character is KO'd
  EffectTrigger.ANY_CHARACTER_KOD,   // When any character (yours or opponent's) is KO'd

  // Life triggers
  EffectTrigger.TRIGGER,
  EffectTrigger.LIFE_ADDED_TO_HAND,  // When life card added to hand
  EffectTrigger.HIT_LEADER,          // When leader takes damage

  // Turn triggers
  EffectTrigger.START_OF_TURN,
  EffectTrigger.END_OF_TURN,
  EffectTrigger.YOUR_TURN,
  EffectTrigger.OPPONENT_TURN,

  // Opponent triggers
  EffectTrigger.OPPONENT_ATTACK,
  EffectTrigger.OPPONENT_PLAYS_EVENT,  // When opponent plays an Event card
  EffectTrigger.OPPONENT_DEPLOYS,      // When opponent deploys a character
  EffectTrigger.OPPONENT_ACTIVATES_BLOCKER, // When opponent activates a Blocker

  // KO triggers (additional)
  EffectTrigger.OPPONENT_CHARACTER_KOD, // When opponent's character is KO'd
  EffectTrigger.KO_ALLY,                // When your own character is KO'd

  // DON triggers (additional)
  EffectTrigger.DON_RETURNED,           // When DON is returned to DON deck

  // Life triggers (additional)
  EffectTrigger.LIFE_REACHES_ZERO,      // When life reaches zero
  EffectTrigger.ANY_HIT_LEADER,         // When any leader takes damage

  // Trash triggers
  EffectTrigger.TRASH_X,                // When trashing cards (as cost or effect)
  EffectTrigger.TRASH_SELF,             // When this card is trashed
  EffectTrigger.TRASH_ALLY,             // When an ally is trashed

  // Card movement triggers
  EffectTrigger.CARD_DRAWN,             // When drawing a card
  EffectTrigger.DEPLOYED_FROM_HAND,     // When card is played from hand

  // Special triggers
  EffectTrigger.WHILE_RESTED,           // Continuous effect while rested
  EffectTrigger.MANDATORY,              // Mandatory effect (must activate)
  EffectTrigger.HAND_EMPTY,             // When hand becomes empty
]);

// ============================================
// STUB EFFECT TYPES
// These are parsed/recognized but have no implementation yet
// All previously stub effects have now been implemented!
// ============================================

export const STUB_EFFECT_TYPES: ReadonlySet<EffectType> = new Set([
  // Empty - all stub effects are now implemented
]);

// ============================================
// VALIDATION FUNCTIONS
// ============================================

export interface ValidationIssue {
  cardId: string;
  effectId?: string;
  type: 'UNIMPLEMENTED_EFFECT' | 'UNIMPLEMENTED_TRIGGER' | 'UNKNOWN_EFFECT' | 'UNKNOWN_TRIGGER';
  detail: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    totalEffects: number;
    implementedEffects: number;
    stubEffects: number;
    unknownEffects: number;
  };
}

/**
 * Validates that all effects in a card's effect definitions are implemented.
 * Use this at server startup to log warnings about cards that won't work correctly.
 */
export function validateCardEffect(
  cardId: string,
  effect: CardEffectDefinition
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check trigger
  if (!IMPLEMENTED_TRIGGERS.has(effect.trigger)) {
    issues.push({
      cardId,
      effectId: effect.id,
      type: 'UNIMPLEMENTED_TRIGGER',
      detail: `Trigger "${effect.trigger}" is not implemented`,
    });
  }

  // Check effect actions
  for (const action of effect.effects) {
    checkAction(cardId, effect.id, action, issues);
  }

  return issues;
}

function checkAction(
  cardId: string,
  effectId: string,
  action: EffectAction,
  issues: ValidationIssue[]
): void {
  if (!IMPLEMENTED_EFFECT_TYPES.has(action.type)) {
    if (STUB_EFFECT_TYPES.has(action.type)) {
      issues.push({
        cardId,
        effectId,
        type: 'UNIMPLEMENTED_EFFECT',
        detail: `Effect type "${action.type}" is recognized but not implemented`,
      });
    } else {
      issues.push({
        cardId,
        effectId,
        type: 'UNKNOWN_EFFECT',
        detail: `Effect type "${action.type}" is unknown`,
      });
    }
  }

  // Check child effects
  if (action.childEffects) {
    for (const child of action.childEffects) {
      checkAction(cardId, effectId, child, issues);
    }
  }
}

/**
 * Validates all cards and returns a comprehensive report.
 * Call this at server startup to identify cards that may not work correctly.
 */
export function validateCardEffects(
  cards: Array<{ id: string; effects: CardEffectDefinition[] }>
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let totalEffects = 0;
  let implementedEffects = 0;
  let stubEffects = 0;
  let unknownEffects = 0;

  for (const card of cards) {
    for (const effect of card.effects) {
      totalEffects++;

      const effectIssues = validateCardEffect(card.id, effect);
      issues.push(...effectIssues);

      if (effectIssues.length === 0) {
        implementedEffects++;
      } else {
        const hasUnknown = effectIssues.some(i => i.type === 'UNKNOWN_EFFECT' || i.type === 'UNKNOWN_TRIGGER');
        if (hasUnknown) {
          unknownEffects++;
        } else {
          stubEffects++;
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      totalEffects,
      implementedEffects,
      stubEffects,
      unknownEffects,
    },
  };
}

/**
 * Checks if a specific effect type is implemented.
 */
export function isEffectImplemented(type: EffectType): boolean {
  return IMPLEMENTED_EFFECT_TYPES.has(type);
}

/**
 * Checks if a specific trigger is implemented.
 */
export function isTriggerImplemented(trigger: EffectTrigger): boolean {
  return IMPLEMENTED_TRIGGERS.has(trigger);
}

/**
 * Returns implementation status for all effect types.
 */
export function getEffectImplementationStatus(): Map<EffectType, 'implemented' | 'stub' | 'unknown'> {
  const status = new Map<EffectType, 'implemented' | 'stub' | 'unknown'>();

  for (const type of Object.values(EffectType)) {
    if (IMPLEMENTED_EFFECT_TYPES.has(type)) {
      status.set(type, 'implemented');
    } else if (STUB_EFFECT_TYPES.has(type)) {
      status.set(type, 'stub');
    } else {
      status.set(type, 'unknown');
    }
  }

  return status;
}
