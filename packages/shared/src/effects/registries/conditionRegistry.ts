/**
 * Condition Registry
 * Consolidates all condition definitions in one place:
 * - Pattern matching (for parser)
 * - Value extraction
 * - Condition checking logic
 * - Documentation
 */

import { ConditionType } from '../types';
import type { GameState, PlayerState, GameCard } from '../../types/game';
import type { CardDefinition } from '../EffectEngine';

// Helper to check if card is rested
function isCardRested(card: GameCard): boolean {
  return card.state === 'RESTED';
}

// Helper to get active DON count
function getActiveDonCount(player: PlayerState): number {
  // Active DON = DON on field that is not rested
  return player.donField?.filter((d: GameCard) => d.state !== 'RESTED').length ?? 0;
}

// Helper to get attached DON count for a card
function getAttachedDonCount(card: GameCard, player: PlayerState): number {
  // Count DON cards attached to this card
  return player.donField?.filter((d: GameCard) => d.attachedTo === card.id).length ?? 0;
}

// Type for a parsed condition before full conversion
export interface ParsedConditionData {
  type: ConditionType;
  value?: number;
  traits?: string[];
  names?: string[];
  leaderName?: string;
  colors?: string[];
  negated?: boolean;
}

// The complete definition of a condition - everything in one place
export interface ConditionDefinition {
  type: ConditionType;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray) => Omit<ParsedConditionData, 'type'>;
  check: (
    condition: ParsedConditionData,
    sourcePlayer: PlayerState,
    opponent: PlayerState | null,
    state: GameState,
    sourceCard?: GameCard,
    cardDefinitions?: Map<string, CardDefinition>
  ) => boolean;
  description: string;
}

// Registry of all conditions
export const CONDITIONS: Record<string, ConditionDefinition> = {
  // =====================
  // HAND CONDITIONS (YOUR)
  // =====================

  HAND_COUNT_OR_MORE: {
    type: ConditionType.HAND_COUNT_OR_MORE,
    patterns: [
      /if you have (\d+) or more cards? in (?:your )?hand/i,
      /you have (\d+)\+? cards? in hand/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => player.hand.length >= (condition.value ?? 0),
    description: 'Check if you have X or more cards in hand',
  },

  HAND_COUNT_OR_LESS: {
    type: ConditionType.HAND_COUNT_OR_LESS,
    patterns: [
      /if you have (\d+) or (?:fewer|less) cards? in (?:your )?hand/i,
      /you have (\d+) or less cards? in hand/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => player.hand.length <= (condition.value ?? 0),
    description: 'Check if you have X or fewer cards in hand',
  },

  HAND_EMPTY: {
    type: ConditionType.HAND_EMPTY,
    patterns: [
      /if (?:you have )?no cards? in (?:your )?hand/i,
      /if your hand is empty/i,
    ],
    extract: () => ({}),
    check: (_condition, player) => player.hand.length === 0,
    description: 'Check if your hand is empty',
  },

  // =====================
  // OPPONENT HAND CONDITIONS
  // =====================

  OPPONENT_HAND_COUNT_OR_MORE: {
    type: ConditionType.OPPONENT_HAND_COUNT_OR_MORE,
    patterns: [
      /if (?:your )?opponent has (\d+) or more cards? in (?:their )?hand/i,
      /opponent has (\d+)\+? cards? in hand/i,
      /opponent's hand has (\d+) or more cards?/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, _player, opponent) =>
      (opponent?.hand.length ?? 0) >= (condition.value ?? 0),
    description: 'Check if opponent has X or more cards in hand',
  },

  OPPONENT_HAND_COUNT_OR_LESS: {
    type: ConditionType.OPPONENT_HAND_COUNT_OR_LESS,
    patterns: [
      /if (?:your )?opponent has (\d+) or (?:fewer|less) cards? in (?:their )?hand/i,
      /opponent has (\d+) or less cards? in hand/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, _player, opponent) =>
      (opponent?.hand.length ?? 0) <= (condition.value ?? 0),
    description: 'Check if opponent has X or fewer cards in hand',
  },

  OPPONENT_HAND_EMPTY: {
    type: ConditionType.OPPONENT_HAND_EMPTY,
    patterns: [
      /if (?:your )?opponent has no cards? in (?:their )?hand/i,
      /if (?:your )?opponent's hand is empty/i,
    ],
    extract: () => ({}),
    check: (_condition, _player, opponent) => (opponent?.hand.length ?? 0) === 0,
    description: 'Check if opponent\'s hand is empty',
  },

  // =====================
  // LIFE CONDITIONS
  // =====================

  LIFE_COUNT_OR_MORE: {
    type: ConditionType.LIFE_COUNT_OR_MORE,
    patterns: [
      /if you have (\d+) or more life cards?/i,
      /you have (\d+)\+? life/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => {
      const lifeCount = Array.isArray(player.life) ? player.life.length : (player.life ?? 0);
      return lifeCount >= (condition.value ?? 0);
    },
    description: 'Check if you have X or more life cards',
  },

  LIFE_COUNT_OR_LESS: {
    type: ConditionType.LIFE_COUNT_OR_LESS,
    patterns: [
      /if you have (\d+) or (?:fewer|less) life cards?/i,
      /you have (\d+) or less life/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => {
      const lifeCount = Array.isArray(player.life) ? player.life.length : (player.life ?? 0);
      return lifeCount <= (condition.value ?? 0);
    },
    description: 'Check if you have X or fewer life cards',
  },

  LESS_LIFE_THAN_OPPONENT: {
    type: ConditionType.LESS_LIFE_THAN_OPPONENT,
    patterns: [
      /if you have (?:fewer|less) life (?:cards? )?than (?:your )?opponent/i,
    ],
    extract: () => ({}),
    check: (_condition, player, opponent) => {
      const myLife = Array.isArray(player.life) ? player.life.length : (player.life ?? 0);
      const oppLife = opponent ? (Array.isArray(opponent.life) ? opponent.life.length : (opponent.life ?? 0)) : 0;
      return myLife < oppLife;
    },
    description: 'Check if you have fewer life cards than opponent',
  },

  MORE_LIFE_THAN_OPPONENT: {
    type: ConditionType.MORE_LIFE_THAN_OPPONENT,
    patterns: [
      /if you have more life (?:cards? )?than (?:your )?opponent/i,
    ],
    extract: () => ({}),
    check: (_condition, player, opponent) => {
      const myLife = Array.isArray(player.life) ? player.life.length : (player.life ?? 0);
      const oppLife = opponent ? (Array.isArray(opponent.life) ? opponent.life.length : (opponent.life ?? 0)) : 0;
      return myLife > oppLife;
    },
    description: 'Check if you have more life cards than opponent',
  },

  TOTAL_LIFE_OR_MORE: {
    type: ConditionType.TOTAL_LIFE_OR_MORE,
    patterns: [
      /if you and your opponent have a total of (\d+) or more life cards?/i,
      /total life (?:cards? )?(?:is )?(\d+) or more/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player, opponent) => {
      const myLife = Array.isArray(player.life) ? player.life.length : (player.life ?? 0);
      const oppLife = opponent ? (Array.isArray(opponent.life) ? opponent.life.length : (opponent.life ?? 0)) : 0;
      return (myLife + oppLife) >= (condition.value ?? 0);
    },
    description: 'Check if combined life cards is X or more',
  },

  // =====================
  // DON CONDITIONS
  // =====================

  DON_COUNT_OR_MORE: {
    type: ConditionType.DON_COUNT_OR_MORE,
    patterns: [
      /if you have (\d+) or more (?:active )?DON!{0,2} cards?/i,
      /you have (\d+)\+? DON/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => getActiveDonCount(player) >= (condition.value ?? 0),
    description: 'Check if you have X or more DON cards',
  },

  DON_COUNT_OR_LESS: {
    type: ConditionType.DON_COUNT_OR_LESS,
    patterns: [
      /if you have (\d+) or (?:fewer|less) (?:active )?DON!{0,2} cards?/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => getActiveDonCount(player) <= (condition.value ?? 0),
    description: 'Check if you have X or fewer DON cards',
  },

  DON_ATTACHED_OR_MORE: {
    type: ConditionType.DON_ATTACHED_OR_MORE,
    patterns: [
      /\[DON!{0,2}\s*[x×](\d+)\]/i,
      /DON!{0,2}\s*[x×](\d+)/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player, _opponent, _state, sourceCard) => {
      const attachedDon = sourceCard ? getAttachedDonCount(sourceCard, player) : 0;
      return attachedDon >= (condition.value ?? 0);
    },
    description: 'Check if card has X or more DON attached',
  },

  // =====================
  // TRASH CONDITIONS
  // =====================

  TRASH_COUNT_OR_MORE: {
    type: ConditionType.TRASH_COUNT_OR_MORE,
    patterns: [
      /if you have (\d+) or more cards? in your trash/i,
      /(\d+)\+? cards? in (?:your )?trash/i,
      /if there are (\d+) or more cards? in your trash/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => player.trash.length >= (condition.value ?? 0),
    description: 'Check if you have X or more cards in trash',
  },

  // =====================
  // LEADER CONDITIONS
  // =====================

  LEADER_IS_MULTICOLORED: {
    type: ConditionType.LEADER_IS_MULTICOLORED,
    patterns: [
      /if your leader is multicolou?red/i,
      /if you have a multicolou?red leader/i,
    ],
    extract: () => ({}),
    check: (_condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      const leaderCardId = player.leaderCard?.cardId || '';
      const leaderDef = cardDefinitions?.get(leaderCardId);
      return (leaderDef?.colors?.length ?? 0) > 1;
    },
    description: 'Check if your leader has multiple colors',
  },

  LEADER_IS: {
    type: ConditionType.LEADER_IS,
    patterns: [
      /if your leader is \[([^\]]+)\]/i,
      /if your leader is "([^"]+)"/i,
    ],
    extract: (match) => ({ leaderName: match[1] }),
    check: (condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      const leaderCardId = player.leaderCard?.cardId || '';
      const leaderDef = cardDefinitions?.get(leaderCardId);
      return leaderDef?.name === condition.leaderName;
    },
    description: 'Check if your leader matches a specific name',
  },

  LEADER_HAS_COLOR: {
    type: ConditionType.LEADER_HAS_COLOR,
    patterns: [
      /if your leader (?:has|includes) (red|blue|green|purple|yellow|black)/i,
    ],
    extract: (match) => ({ colors: [match[1].toLowerCase()] }),
    check: (condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      const leaderCardId = player.leaderCard?.cardId || '';
      const leaderDef = cardDefinitions?.get(leaderCardId);
      const leaderColors = leaderDef?.colors?.map((c: string) => c.toLowerCase()) ?? [];
      return condition.colors?.some((c: string) => leaderColors.includes(c)) ?? false;
    },
    description: 'Check if your leader has a specific color',
  },

  LEADER_HAS_TRAIT: {
    type: ConditionType.LEADER_HAS_TRAIT,
    patterns: [
      /if your leader has the \{([^}]+)\} type/i,
      /if your leader has (?:the )?([A-Z][a-z]+(?: [A-Z][a-z]+)*) trait/i,
    ],
    extract: (match) => ({ traits: [match[1]] }),
    check: (condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      const leaderCardId = player.leaderCard?.cardId || '';
      const leaderDef = cardDefinitions?.get(leaderCardId);
      const leaderTraits = leaderDef?.traits ?? [];
      return condition.traits?.some(t => leaderTraits.includes(t)) ?? false;
    },
    description: 'Check if your leader has a specific trait',
  },

  // =====================
  // CHARACTER CONDITIONS
  // =====================

  CHARACTER_COUNT_OR_MORE: {
    type: ConditionType.CHARACTER_COUNT_OR_MORE,
    patterns: [
      /if you (?:control|have) (\d+) or more characters?/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => player.field.length >= (condition.value ?? 0),
    description: 'Check if you control X or more characters',
  },

  CHARACTER_COUNT_OR_LESS: {
    type: ConditionType.CHARACTER_COUNT_OR_LESS,
    patterns: [
      /if you (?:control|have) (\d+) or (?:fewer|less) characters?/i,
    ],
    extract: (match) => ({ value: parseInt(match[1]) }),
    check: (condition, player) => player.field?.length <= (condition.value ?? 0),
    description: 'Check if you control X or fewer characters',
  },

  HAS_CHARACTER_WITH_TRAIT: {
    type: ConditionType.HAS_CHARACTER_WITH_TRAIT,
    patterns: [
      /if you (?:control|have) a \{([^}]+)\} character/i,
      /if you have a character with the ([A-Z][a-z]+(?: [A-Z][a-z]+)*) trait/i,
    ],
    extract: (match) => ({ traits: [match[1]] }),
    check: (condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      return player.field.some((char: GameCard) => {
        const def = cardDefinitions?.get(char.cardId);
        return condition.traits?.some((t: string) => def?.traits?.includes(t)) ?? false;
      });
    },
    description: 'Check if you control a character with specific trait',
  },

  HAS_CHARACTER_WITH_NAME: {
    type: ConditionType.HAS_CHARACTER_WITH_NAME,
    patterns: [
      /if you (?:control|have) (?:a )?\[([^\]]+)\]/i,
      /if you (?:control|have) (?:a )?"([^"]+)"/i,
    ],
    extract: (match) => ({ names: [match[1]] }),
    check: (condition, player, _opponent, _state, _sourceCard, cardDefinitions) => {
      return player.field.some((char: GameCard) => {
        const def = cardDefinitions?.get(char.cardId);
        return condition.names?.includes(def?.name ?? '') ?? false;
      });
    },
    description: 'Check if you control a character with specific name',
  },

  // =====================
  // TURN CONDITIONS
  // =====================

  YOUR_TURN: {
    type: ConditionType.YOUR_TURN,
    patterns: [
      /during your turn/i,
      /on your turn/i,
    ],
    extract: () => ({}),
    check: (_condition, player, _opponent, state) =>
      state.activePlayerId === player.id,
    description: 'Check if it is your turn',
  },

  OPPONENT_TURN: {
    type: ConditionType.OPPONENT_TURN,
    patterns: [
      /during (?:your )?opponent's turn/i,
      /on (?:your )?opponent's turn/i,
    ],
    extract: () => ({}),
    check: (_condition, _player, opponent, state) =>
      opponent ? state.activePlayerId === opponent.id : false,
    description: 'Check if it is opponent\'s turn',
  },

  FIRST_TURN: {
    type: ConditionType.FIRST_TURN,
    patterns: [
      /if (?:this is|it's) (?:your )?first turn/i,
      /on (?:your )?first turn/i,
    ],
    extract: () => ({}),
    check: (_condition, _player, _opponent, state) => state.turn === 1,
    description: 'Check if it is the first turn',
  },

  // =====================
  // STATE CONDITIONS
  // =====================

  IS_RESTED: {
    type: ConditionType.IS_RESTED,
    patterns: [
      /if this card is rested/i,
      /while (?:this card is )?rested/i,
    ],
    extract: () => ({}),
    check: (_condition, _player, _opponent, _state, sourceCard) =>
      sourceCard ? isCardRested(sourceCard) : false,
    description: 'Check if this card is rested',
  },

  IS_ACTIVE: {
    type: ConditionType.IS_ACTIVE,
    patterns: [
      /if this card is active/i,
      /while (?:this card is )?active/i,
    ],
    extract: () => ({}),
    check: (_condition, _player, _opponent, _state, sourceCard) =>
      sourceCard ? !isCardRested(sourceCard) : false,
    description: 'Check if this card is active',
  },
};

// Export helper to get condition by type
export function getConditionDefinition(type: ConditionType): ConditionDefinition | undefined {
  return Object.values(CONDITIONS).find(c => c.type === type);
}

// Export all condition types from registry for validation
export const REGISTERED_CONDITION_TYPES = Object.values(CONDITIONS).map(c => c.type);

// Parse condition from text
export function parseCondition(text: string): ParsedConditionData | null {
  for (const def of Object.values(CONDITIONS)) {
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

// Check a condition using the registry
export function checkCondition(
  condition: ParsedConditionData,
  sourcePlayer: PlayerState,
  opponent: PlayerState | null,
  state: GameState,
  sourceCard?: GameCard,
  cardDefinitions?: Map<string, CardDefinition>
): boolean {
  const def = getConditionDefinition(condition.type);
  if (!def) {
    console.warn(`[ConditionRegistry] No handler for condition type: ${condition.type}`);
    return true; // Default to allowing unknown conditions
  }

  const result = def.check(condition, sourcePlayer, opponent, state, sourceCard, cardDefinitions);
  return condition.negated ? !result : result;
}
