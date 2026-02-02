/**
 * Trigger Registry
 * Consolidates all trigger definitions in one place:
 * - Pattern matching (for parser)
 * - Value extraction
 * - Trigger matching logic
 * - Documentation
 */

import { EffectTrigger } from '../types';
import type { GameState } from '../../types';

// Context for trigger matching
export interface TriggerContext {
  trigger: string;
  sourceCardId?: string;
  targetCardId?: string;
  sourcePlayerId?: string;
  activePlayerId?: string;
  defenderId?: string;
  attackerId?: string;
  cardKOdId?: string;
  gamePhase?: string;
  turnNumber?: number;
}

// Type for parsed trigger data
export interface ParsedTriggerData {
  type: EffectTrigger;
  value?: number;
}

// The complete definition of a trigger - everything in one place
export interface TriggerDefinition {
  type: EffectTrigger;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray) => Omit<ParsedTriggerData, 'type'>;
  matches: (
    definition: { trigger: EffectTrigger; triggerValue?: number },
    context: TriggerContext,
    sourceCardId: string,
    sourcePlayerId: string,
    state: GameState
  ) => boolean;
  description: string;
}

// Registry of all triggers
export const TRIGGERS: Record<string, TriggerDefinition> = {
  // =====================
  // MAIN PHASE TRIGGERS
  // =====================

  ACTIVATE_MAIN: {
    type: EffectTrigger.ACTIVATE_MAIN,
    patterns: [
      /\[Activate:? Main\]/i,
      /\[Main\]/i,
    ],
    extract: () => ({}),
    matches: (_def, context) =>
      context.trigger === 'ACTIVATE_MAIN' || context.trigger === 'MAIN_PHASE',
    description: 'Activated during main phase (optional)',
  },

  MAIN: {
    type: EffectTrigger.MAIN,
    patterns: [
      /\[Main\]/i,
    ],
    extract: () => ({}),
    matches: (_def, context) =>
      context.trigger === 'MAIN' || context.trigger === 'MAIN_PHASE',
    description: 'Event main effect',
  },

  ONCE_PER_TURN: {
    type: EffectTrigger.ONCE_PER_TURN,
    patterns: [
      /\[Once Per Turn\]/i,
      /once per turn/i,
    ],
    extract: () => ({}),
    matches: (_def, context) =>
      context.trigger === 'ACTIVATE_MAIN' || context.trigger === 'ONCE_PER_TURN',
    description: 'Can only be activated once per turn',
  },

  // =====================
  // PLAY TRIGGERS
  // =====================

  ON_PLAY: {
    type: EffectTrigger.ON_PLAY,
    patterns: [
      /\[On Play\]/i,
      /when (?:this card is )?played/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ON_PLAY' && context.sourceCardId === sourceCardId,
    description: 'Triggers when this card is played',
  },

  ON_PLAY_FROM_TRIGGER: {
    type: EffectTrigger.ON_PLAY_FROM_TRIGGER,
    patterns: [
      /when played (?:from|via) (?:a )?trigger/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ON_PLAY_FROM_TRIGGER' && context.sourceCardId === sourceCardId,
    description: 'Triggers when played from a trigger effect',
  },

  // =====================
  // COMBAT TRIGGERS
  // =====================

  ON_ATTACK: {
    type: EffectTrigger.ON_ATTACK,
    patterns: [
      /\[On Attack\]/i,
      /when this (?:card|character|leader) attacks/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ON_ATTACK' && context.attackerId === sourceCardId,
    description: 'Triggers when this card attacks',
  },

  ON_BLOCK: {
    type: EffectTrigger.ON_BLOCK,
    patterns: [
      /\[Blocker\]/i,
      /when this (?:card|character) blocks/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ON_BLOCK' && context.defenderId === sourceCardId,
    description: 'Triggers when this card blocks',
  },

  COUNTER: {
    type: EffectTrigger.COUNTER,
    patterns: [
      /\[Counter\]/i,
    ],
    extract: () => ({}),
    matches: (_def, context) =>
      context.trigger === 'COUNTER',
    description: 'Can be used during counter step',
  },

  AFTER_BATTLE: {
    type: EffectTrigger.AFTER_BATTLE,
    patterns: [
      /after (?:this )?battle/i,
      /when battle ends/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'AFTER_BATTLE' &&
      (context.attackerId === sourceCardId || context.defenderId === sourceCardId),
    description: 'Triggers after battle resolution',
  },

  // =====================
  // DON TRIGGERS
  // =====================

  DON_X: {
    type: EffectTrigger.DON_X,
    patterns: [
      /\[DON!{0,2}\s*[x×](\d+)\]/i,
      /DON!{0,2}\s*[x×](\d+)/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    matches: (_def, _context, _sourceCardId, _sourcePlayerId, _state) => {
      // This is a condition-based trigger - card must have enough DON attached
      // The actual check is done via DON_ATTACHED_OR_MORE condition
      return true;
    },
    description: 'Requires X DON attached to activate',
  },

  ATTACH_DON: {
    type: EffectTrigger.ATTACH_DON,
    patterns: [
      /when (?:a )?DON!{0,2} (?:is )?attached/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ATTACH_DON' && context.targetCardId === sourceCardId,
    description: 'Triggers when DON is attached to this card',
  },

  DON_RETURNED: {
    type: EffectTrigger.DON_RETURNED,
    patterns: [
      /when (?:a )?DON!{0,2} (?:is )?returned/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'DON_RETURNED' && context.sourcePlayerId === sourcePlayerId,
    description: 'Triggers when DON is returned from this card',
  },

  // =====================
  // KO TRIGGERS
  // =====================

  ON_KO: {
    type: EffectTrigger.ON_KO,
    patterns: [
      /\[On K\.?O\.?\]/i,
      /when this (?:card|character) is K\.?O\.?\'?d/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'ON_KO' && context.cardKOdId === sourceCardId,
    description: 'Triggers when this card is KO\'d',
  },

  AFTER_KO_CHARACTER: {
    type: EffectTrigger.AFTER_KO_CHARACTER,
    patterns: [
      /after (?:you )?K\.?O\.?(?:'?d)? (?:a |an )?(?:opponent's )?character/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'AFTER_KO_CHARACTER' && context.sourcePlayerId === sourcePlayerId,
    description: 'Triggers after you KO a character',
  },

  OPPONENT_CHARACTER_KOD: {
    type: EffectTrigger.OPPONENT_CHARACTER_KOD,
    patterns: [
      /when (?:an )?opponent's character is K\.?O\.?'?d/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'OPPONENT_CHARACTER_KOD' && context.sourcePlayerId === sourcePlayerId,
    description: 'Triggers when opponent\'s character is KO\'d',
  },

  // =====================
  // LIFE TRIGGERS
  // =====================

  TRIGGER: {
    type: EffectTrigger.TRIGGER,
    patterns: [
      /\[Trigger\]/i,
    ],
    extract: () => ({}),
    matches: (_def, context) =>
      context.trigger === 'TRIGGER' || context.trigger === 'LIFE_TRIGGER',
    description: 'Life card trigger effect',
  },

  LIFE_ADDED_TO_HAND: {
    type: EffectTrigger.LIFE_ADDED_TO_HAND,
    patterns: [
      /when (?:a )?life (?:card )?(?:is )?added to (?:your )?hand/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'LIFE_ADDED_TO_HAND' && context.sourcePlayerId === sourcePlayerId,
    description: 'Triggers when life is added to hand',
  },

  HIT_LEADER: {
    type: EffectTrigger.HIT_LEADER,
    patterns: [
      /when (?:this card )?(?:deals damage|hits) (?:the )?(?:opponent's )?leader/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'HIT_LEADER' && context.attackerId === sourceCardId,
    description: 'Triggers when this card deals damage to leader',
  },

  // =====================
  // TURN TRIGGERS
  // =====================

  START_OF_TURN: {
    type: EffectTrigger.START_OF_TURN,
    patterns: [
      /\[Start of (?:Your )?Turn\]/i,
      /at the start of (?:your )?turn/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'START_OF_TURN' && context.activePlayerId === sourcePlayerId,
    description: 'Triggers at the start of your turn',
  },

  END_OF_TURN: {
    type: EffectTrigger.END_OF_TURN,
    patterns: [
      /\[End of (?:Your )?Turn\]/i,
      /at the end of (?:your )?turn/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'END_OF_TURN' && context.activePlayerId === sourcePlayerId,
    description: 'Triggers at the end of your turn',
  },

  YOUR_TURN: {
    type: EffectTrigger.YOUR_TURN,
    patterns: [
      /\[Your Turn\]/i,
      /during your turn/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.activePlayerId === sourcePlayerId,
    description: 'Active during your turn',
  },

  OPPONENT_TURN: {
    type: EffectTrigger.OPPONENT_TURN,
    patterns: [
      /\[Opponent's Turn\]/i,
      /during (?:your )?opponent's turn/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.activePlayerId !== sourcePlayerId,
    description: 'Active during opponent\'s turn',
  },

  // =====================
  // OPPONENT TRIGGERS
  // =====================

  OPPONENT_ATTACK: {
    type: EffectTrigger.OPPONENT_ATTACK,
    patterns: [
      /when (?:your )?opponent attacks/i,
      /when (?:an )?opponent's (?:card|character|leader) attacks/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'ON_ATTACK' && context.sourcePlayerId !== sourcePlayerId,
    description: 'Triggers when opponent attacks',
  },

  OPPONENT_PLAYS_EVENT: {
    type: EffectTrigger.OPPONENT_PLAYS_EVENT,
    patterns: [
      /when (?:your )?opponent plays an event/i,
    ],
    extract: () => ({}),
    matches: (_def, context, _sourceCardId, sourcePlayerId) =>
      context.trigger === 'OPPONENT_PLAYS_EVENT' && context.sourcePlayerId !== sourcePlayerId,
    description: 'Triggers when opponent plays an event',
  },

  // =====================
  // TRASH TRIGGERS
  // =====================

  TRASH_SELF: {
    type: EffectTrigger.TRASH_SELF,
    patterns: [
      /when (?:this card is )?trashed/i,
    ],
    extract: () => ({}),
    matches: (_def, context, sourceCardId) =>
      context.trigger === 'TRASH_SELF' && context.sourceCardId === sourceCardId,
    description: 'Triggers when this card is trashed',
  },

  // =====================
  // SPECIAL TRIGGERS
  // =====================

  PASSIVE: {
    type: EffectTrigger.PASSIVE,
    patterns: [], // No explicit pattern - always active
    extract: () => ({}),
    matches: () => true, // Always matches - it's passive
    description: 'Always active while card is in play',
  },

  IMMEDIATE: {
    type: EffectTrigger.IMMEDIATE,
    patterns: [], // No pattern - used for child effects
    extract: () => ({}),
    matches: () => true, // Child effects execute immediately
    description: 'Executes immediately (for Then clauses)',
  },
};

// Export helper to get trigger by type
export function getTriggerDefinition(type: EffectTrigger): TriggerDefinition | undefined {
  return Object.values(TRIGGERS).find(t => t.type === type);
}

// Export all trigger types from registry for validation
export const REGISTERED_TRIGGER_TYPES = Object.values(TRIGGERS).map(t => t.type);

// Parse trigger from text
export function parseTrigger(text: string): ParsedTriggerData | null {
  for (const def of Object.values(TRIGGERS)) {
    for (const pattern of def.patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          type: def.type,
          ...def.extract(match),
        };
      }
    }
  }
  return null;
}

// Check if a trigger matches using the registry
export function doesTriggerMatch(
  definition: { trigger: EffectTrigger; triggerValue?: number },
  context: TriggerContext,
  sourceCardId: string,
  sourcePlayerId: string,
  state: GameState
): boolean {
  const def = getTriggerDefinition(definition.trigger);
  if (!def) {
    console.warn(`[TriggerRegistry] No handler for trigger type: ${definition.trigger}`);
    return false;
  }

  return def.matches(definition, context, sourceCardId, sourcePlayerId, state);
}
