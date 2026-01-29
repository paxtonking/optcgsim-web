// Effect System Types - Based on Unity's ActionV3 system
// Comprehensive types for card effects in One Piece TCG

// ============================================
// TRIGGER TYPES - When an effect can activate
// ============================================

export enum EffectTrigger {
  // Passive/Always active
  PASSIVE = 'PASSIVE',

  // Main phase activation
  ACTIVATE_MAIN = 'ACTIVATE_MAIN',
  MAIN = 'MAIN',  // Event main effect
  ONCE_PER_TURN = 'ONCE_PER_TURN',

  // Play triggers
  ON_PLAY = 'ON_PLAY',
  ON_PLAY_FROM_TRIGGER = 'ON_PLAY_FROM_TRIGGER',

  // Combat triggers
  ON_ATTACK = 'ON_ATTACK',
  ON_BLOCK = 'ON_BLOCK',
  COUNTER = 'COUNTER',
  AFTER_BATTLE = 'AFTER_BATTLE',

  // DON! triggers
  DON_X = 'DON_X',
  DON_TAP = 'DON_TAP',
  ATTACH_DON = 'ATTACH_DON',
  DON_RETURNED = 'DON_RETURNED',

  // KO triggers
  ON_KO = 'ON_KO',
  PRE_KO = 'PRE_KO',
  AFTER_KO_CHARACTER = 'AFTER_KO_CHARACTER',
  ANY_CHARACTER_KOD = 'ANY_CHARACTER_KOD',
  OPPONENT_CHARACTER_KOD = 'OPPONENT_CHARACTER_KOD',
  KO_ALLY = 'KO_ALLY',

  // Life triggers
  TRIGGER = 'TRIGGER', // Life card trigger
  LIFE_ADDED_TO_HAND = 'LIFE_ADDED_TO_HAND',
  LIFE_REACHES_ZERO = 'LIFE_REACHES_ZERO',
  HIT_LEADER = 'HIT_LEADER',
  ANY_HIT_LEADER = 'ANY_HIT_LEADER',

  // Turn triggers
  END_OF_TURN = 'END_OF_TURN',
  START_OF_TURN = 'START_OF_TURN',
  YOUR_TURN = 'YOUR_TURN',
  OPPONENT_TURN = 'OPPONENT_TURN',

  // Opponent triggers
  OPPONENT_ATTACK = 'OPPONENT_ATTACK',
  OPPONENT_PLAYS_EVENT = 'OPPONENT_PLAYS_EVENT',
  OPPONENT_DEPLOYS = 'OPPONENT_DEPLOYS',
  OPPONENT_ACTIVATES_BLOCKER = 'OPPONENT_ACTIVATES_BLOCKER',

  // Trash triggers
  TRASH_X = 'TRASH_X',
  TRASH_SELF = 'TRASH_SELF',
  TRASH_ALLY = 'TRASH_ALLY',

  // Card movement triggers
  CARD_DRAWN = 'CARD_DRAWN',
  DEPLOYED_FROM_HAND = 'DEPLOYED_FROM_HAND',

  // Special triggers
  WHILE_RESTED = 'WHILE_RESTED',
  MANDATORY = 'MANDATORY',
  HAND_EMPTY = 'HAND_EMPTY',

  // For childEffects (Then clauses) that execute immediately
  IMMEDIATE = 'IMMEDIATE',
}

// ============================================
// EFFECT TYPES - What effects can do
// ============================================

export enum EffectType {
  // Keywords (static abilities)
  RUSH = 'RUSH',
  BLOCKER = 'BLOCKER',
  BANISH = 'BANISH',
  DOUBLE_ATTACK = 'DOUBLE_ATTACK',
  UNBLOCKABLE = 'UNBLOCKABLE',
  CAN_ATTACK_ACTIVE = 'CAN_ATTACK_ACTIVE',

  // Power modifications
  BUFF_POWER = 'BUFF_POWER',
  BUFF_SELF = 'BUFF_SELF',
  BUFF_OTHER = 'BUFF_OTHER',
  BUFF_ANY = 'BUFF_ANY',
  BUFF_FIELD = 'BUFF_FIELD',
  BUFF_COMBAT = 'BUFF_COMBAT',
  DEBUFF_POWER = 'DEBUFF_POWER',
  SET_POWER_ZERO = 'SET_POWER_ZERO',
  SET_BASE_POWER = 'SET_BASE_POWER',  // Set base power to specific value

  // Cost modifications
  REDUCE_COST = 'REDUCE_COST',
  INCREASE_COST = 'INCREASE_COST',
  DEBUFF_COST = 'DEBUFF_COST',  // Reduce opponent's character cost (for KO effects)

  // Draw effects
  DRAW_CARDS = 'DRAW_CARDS',
  DRAW_FROM_TRASH = 'DRAW_FROM_TRASH',
  DRAW_AND_TRASH = 'DRAW_AND_TRASH',
  MILL_DECK = 'MILL_DECK',
  DISCARD_FROM_HAND = 'DISCARD_FROM_HAND',
  LOOK_AT_TOP_DECK = 'LOOK_AT_TOP_DECK',
  SEARCH_AND_SELECT = 'SEARCH_AND_SELECT',  // Look at X cards, select matching ones, trash rest

  // Card movement
  RETURN_TO_HAND = 'RETURN_TO_HAND',
  SEND_TO_DECK_BOTTOM = 'SEND_TO_DECK_BOTTOM',
  SEND_TO_DECK_TOP = 'SEND_TO_DECK_TOP',
  SEND_TO_TRASH = 'SEND_TO_TRASH',
  PLAY_FROM_HAND = 'PLAY_FROM_HAND',
  PLAY_FROM_TRASH = 'PLAY_FROM_TRASH',
  PLAY_FROM_DECK = 'PLAY_FROM_DECK',

  // DON! effects
  GAIN_ACTIVE_DON = 'GAIN_ACTIVE_DON',
  GAIN_RESTED_DON = 'GAIN_RESTED_DON',
  RETURN_DON = 'RETURN_DON',
  ATTACH_DON = 'ATTACH_DON',
  ADD_DON = 'ADD_DON',      // Add DON from DON deck
  ACTIVE_DON = 'ACTIVE_DON', // Set rested DON as active

  // Combat effects
  KO_CHARACTER = 'KO_CHARACTER',
  KO_COST_OR_LESS = 'KO_COST_OR_LESS',
  KO_POWER_OR_LESS = 'KO_POWER_OR_LESS',
  PREVENT_KO = 'PREVENT_KO',
  FREEZE = 'FREEZE',
  REST_CHARACTER = 'REST_CHARACTER',
  ACTIVATE_CHARACTER = 'ACTIVATE_CHARACTER',
  REST_DON = 'REST_DON',             // Rest opponent's DON cards
  SWAP_POWER = 'SWAP_POWER',         // Swap base power between characters
  REDIRECT_ATTACK = 'REDIRECT_ATTACK', // Change attack target

  // Life effects
  ADD_TO_LIFE = 'ADD_TO_LIFE',
  TAKE_LIFE = 'TAKE_LIFE',
  TRASH_LIFE = 'TRASH_LIFE',
  LOOK_AT_LIFE = 'LOOK_AT_LIFE',
  REORDER_LIFE = 'REORDER_LIFE',       // Look at all Life and reorder
  PREVENT_LIFE_ADD = 'PREVENT_LIFE_ADD', // Cannot add Life to hand

  // Protection effects
  IMMUNE_EFFECTS = 'IMMUNE_EFFECTS',
  IMMUNE_COMBAT = 'IMMUNE_COMBAT',
  IMMUNE_KO = 'IMMUNE_KO',
  IMMUNE_KO_UNTIL = 'IMMUNE_KO_UNTIL', // Cannot be K.O.'d until end of turn
  CANT_BE_BLOCKED = 'CANT_BE_BLOCKED',
  CANT_ATTACK = 'CANT_ATTACK',
  CANT_BE_RESTED = 'CANT_BE_RESTED',   // Cannot be rested

  // Target manipulation
  BECOME_BLOCKER = 'BECOME_BLOCKER',
  SILENCE = 'SILENCE', // Remove all abilities

  // Opponent effects
  OPPONENT_DISCARD = 'OPPONENT_DISCARD',
  OPPONENT_TRASH_CARDS = 'OPPONENT_TRASH_CARDS',
  OPPONENT_RETURN_DON = 'OPPONENT_RETURN_DON',
  OPPONENT_TRASH_FROM_HAND = 'OPPONENT_TRASH_FROM_HAND',

  // Special effects
  SEARCH_DECK = 'SEARCH_DECK',
  REVEAL_HAND = 'REVEAL_HAND',
  TAKE_ANOTHER_TURN = 'TAKE_ANOTHER_TURN',
  WIN_GAME = 'WIN_GAME',

  // Grant effects to other cards
  GRANT_KEYWORD = 'GRANT_KEYWORD',
  GRANT_EFFECT = 'GRANT_EFFECT',
  GRANT_RUSH_VS_CHARACTERS = 'GRANT_RUSH_VS_CHARACTERS',
}

// ============================================
// TARGET TYPES - What can be targeted
// ============================================

export enum TargetType {
  // Self targeting
  SELF = 'SELF',

  // Player targeting
  YOUR_LEADER = 'YOUR_LEADER',
  OPPONENT_LEADER = 'OPPONENT_LEADER',
  ANY_LEADER = 'ANY_LEADER',

  // Character targeting
  YOUR_CHARACTER = 'YOUR_CHARACTER',
  OPPONENT_CHARACTER = 'OPPONENT_CHARACTER',
  ANY_CHARACTER = 'ANY_CHARACTER',

  // Combined targeting
  YOUR_LEADER_OR_CHARACTER = 'YOUR_LEADER_OR_CHARACTER',
  OPPONENT_LEADER_OR_CHARACTER = 'OPPONENT_LEADER_OR_CHARACTER',

  // Field targeting
  YOUR_FIELD = 'YOUR_FIELD',
  OPPONENT_FIELD = 'OPPONENT_FIELD',
  ALL_CHARACTERS = 'ALL_CHARACTERS',

  // Zone targeting
  YOUR_HAND = 'YOUR_HAND',
  OPPONENT_HAND = 'OPPONENT_HAND',
  YOUR_TRASH = 'YOUR_TRASH',
  OPPONENT_TRASH = 'OPPONENT_TRASH',
  YOUR_DECK = 'YOUR_DECK',
  YOUR_LIFE = 'YOUR_LIFE',
  OPPONENT_LIFE = 'OPPONENT_LIFE',

  // Combat targeting
  ATTACKER = 'ATTACKER',
  DEFENDER = 'DEFENDER',
  BATTLING_CHARACTER = 'BATTLING_CHARACTER',

  // DON! targeting
  YOUR_DON = 'YOUR_DON',
  OPPONENT_DON = 'OPPONENT_DON',

  // Stage targeting
  YOUR_STAGE = 'YOUR_STAGE',
  OPPONENT_STAGE = 'OPPONENT_STAGE',
}

// ============================================
// CONDITION TYPES - When effects can be used
// ============================================

export enum ConditionType {
  // DON! conditions
  DON_COUNT_OR_MORE = 'DON_COUNT_OR_MORE',
  DON_COUNT_OR_LESS = 'DON_COUNT_OR_LESS',
  DON_ATTACHED_COUNT = 'DON_ATTACHED_COUNT',
  DON_ATTACHED_OR_MORE = 'DON_ATTACHED_OR_MORE',  // Card has X+ DON attached (for [DON!! x1] etc.)

  // Life conditions
  LIFE_COUNT_OR_MORE = 'LIFE_COUNT_OR_MORE',
  LIFE_COUNT_OR_LESS = 'LIFE_COUNT_OR_LESS',
  LESS_LIFE_THAN_OPPONENT = 'LESS_LIFE_THAN_OPPONENT',
  MORE_LIFE_THAN_OPPONENT = 'MORE_LIFE_THAN_OPPONENT',

  // Hand conditions
  HAND_COUNT_OR_MORE = 'HAND_COUNT_OR_MORE',
  HAND_COUNT_OR_LESS = 'HAND_COUNT_OR_LESS',
  HAND_EMPTY = 'HAND_EMPTY',

  // Field conditions
  CHARACTER_COUNT_OR_MORE = 'CHARACTER_COUNT_OR_MORE',
  CHARACTER_COUNT_OR_LESS = 'CHARACTER_COUNT_OR_LESS',
  HAS_CHARACTER_WITH_TRAIT = 'HAS_CHARACTER_WITH_TRAIT',
  HAS_CHARACTER_WITH_NAME = 'HAS_CHARACTER_WITH_NAME',

  // Card property conditions
  TARGET_COST_OR_LESS = 'TARGET_COST_OR_LESS',
  TARGET_COST_OR_MORE = 'TARGET_COST_OR_MORE',
  TARGET_POWER_OR_LESS = 'TARGET_POWER_OR_LESS',
  TARGET_POWER_OR_MORE = 'TARGET_POWER_OR_MORE',
  TARGET_HAS_COLOR = 'TARGET_HAS_COLOR',
  TARGET_HAS_TRAIT = 'TARGET_HAS_TRAIT',
  TARGET_HAS_TYPE = 'TARGET_HAS_TYPE',

  // Trash conditions
  TRASH_COUNT_OR_MORE = 'TRASH_COUNT_OR_MORE',
  TRASH_HAS_CARD_TYPE = 'TRASH_HAS_CARD_TYPE',

  // Turn conditions
  YOUR_TURN = 'YOUR_TURN',
  OPPONENT_TURN = 'OPPONENT_TURN',
  FIRST_TURN = 'FIRST_TURN',

  // Leader conditions
  LEADER_IS = 'LEADER_IS',               // "If your Leader is [Name]"
  LEADER_HAS_COLOR = 'LEADER_HAS_COLOR',
  LEADER_HAS_TRAIT = 'LEADER_HAS_TRAIT',

  // State conditions
  IS_RESTED = 'IS_RESTED',
  IS_ACTIVE = 'IS_ACTIVE',
  HAS_ATTACKED = 'HAS_ATTACKED',

  // Deck conditions
  DECK_HAS_CARDS = 'DECK_HAS_CARDS',
  TOP_DECK_HAS_TRAIT = 'TOP_DECK_HAS_TRAIT',
}

// ============================================
// DURATION TYPES - How long effects last
// ============================================

export enum EffectDuration {
  INSTANT = 'INSTANT',           // Resolve immediately
  UNTIL_END_OF_TURN = 'UNTIL_END_OF_TURN',
  UNTIL_END_OF_OPPONENT_TURN = 'UNTIL_END_OF_OPPONENT_TURN',
  UNTIL_START_OF_YOUR_TURN = 'UNTIL_START_OF_YOUR_TURN',
  UNTIL_END_OF_BATTLE = 'UNTIL_END_OF_BATTLE',
  WHILE_ON_FIELD = 'WHILE_ON_FIELD',
  PERMANENT = 'PERMANENT',
}

// ============================================
// ADDITIONAL COST TYPES - Optional costs for effects
// ============================================

export enum AdditionalCostType {
  REST_DON = 'REST_DON',         // "rest X of your DON!! cards"
  TRASH_CARD = 'TRASH_CARD',     // "trash X cards from your hand"
  RETURN_DON = 'RETURN_DON',     // "return X DON!! to your DON!! deck"
  TRASH_FROM_HAND = 'TRASH_FROM_HAND', // Specifically from hand
  LIFE = 'LIFE',                 // "place X cards from your Life face up at the top of your deck"
}

export interface AdditionalCost {
  type: AdditionalCostType;
  amount: number;
  optional: boolean;  // "You may" makes it optional
}

// ============================================
// CARD CATEGORIES (Traits/Affiliations)
// ============================================

export const CardCategory = {
  // Major crews
  STRAW_HAT_CREW: 'Straw Hat Crew',
  ANIMAL_KINGDOM_PIRATES: 'Animal Kingdom Pirates',
  BIG_MOM_PIRATES: 'Big Mom Pirates',
  WHITEBEARD_PIRATES: 'Whitebeard Pirates',
  RED_HAIRED_PIRATES: 'Red Haired Pirates',
  BLACKBEARD_PIRATES: 'Blackbeard Pirates',
  HEART_PIRATES: 'Heart Pirates',
  KID_PIRATES: 'Kid Pirates',

  // Organizations
  NAVY: 'Navy',
  REVOLUTIONARY_ARMY: 'Revolutionary Army',
  WORLD_GOVERNMENT: 'World Government',
  SEVEN_WARLORDS: 'Seven Warlords of the Sea',
  CP9: 'CP9',
  CP0: 'CP0',
  IMPEL_DOWN: 'Impel Down',
  BAROQUE_WORKS: 'Baroque Works',

  // Locations
  WANO_COUNTRY: 'Wano Country',
  DRESSROSA: 'Dressrosa',
  FISH_MAN_ISLAND: 'Fish-Man Island',
  ALABASTA: 'Alabasta Kingdom',
  SKY_ISLAND: 'Sky Island',

  // Character types
  SUPERNOVAS: 'Supernovas',
  FOUR_EMPERORS: 'Four Emperors',
  MINK_TRIBE: 'Mink Tribe',
  FISH_MAN: 'Fish-Man',
  GIANTS: 'Giants',

  // Special
  FILM: 'FILM',
  NONE: 'NONE',
} as const;

export type CardCategoryType = typeof CardCategory[keyof typeof CardCategory];

// ============================================
// EFFECT DEFINITION INTERFACES
// ============================================

export interface EffectCondition {
  type: ConditionType;
  value?: number;
  colors?: string[];
  traits?: string[];
  cardTypes?: string[];
  names?: string[];             // For matching card names
  leaderName?: string;          // For LEADER_IS condition: "If your Leader is [Name]"
  compare?: 'EQUAL' | 'OR_MORE' | 'OR_LESS' | 'EXACTLY';
}

export interface EffectTarget {
  type: TargetType;
  count?: number;
  maxCount?: number;
  optional?: boolean;
  filters?: TargetFilter[];
}

export interface TargetFilter {
  property: 'COST' | 'POWER' | 'COLOR' | 'TRAIT' | 'TYPE' | 'NAME' | 'STATE';
  operator: 'EQUALS' | 'OR_MORE' | 'OR_LESS' | 'LESS_THAN_OR_EQUAL' | 'CONTAINS' | 'NOT_CONTAINS';
  value: string | number | string[];  // Can be 'DON_COUNT' for dynamic value resolution
}

export interface EffectCost {
  type: 'DON' | 'TRASH_CARD' | 'REST_DON' | 'RETURN_DON' | 'LIFE' | 'TRASH_FROM_HAND' | 'REST_SELF';
  count?: number;
  filters?: TargetFilter[];
  optional?: boolean;  // "You may" makes this cost optional
}

export interface CardEffectDefinition {
  id: string;
  trigger: EffectTrigger;
  triggerValue?: number;  // For DON_X triggers, etc.
  conditions?: EffectCondition[];
  costs?: EffectCost[];
  effects: EffectAction[];
  isOptional?: boolean;
  oncePerTurn?: boolean;
  description: string;
}

export interface EffectAction {
  type: EffectType;
  target?: EffectTarget;
  value?: number;
  duration?: EffectDuration;
  keyword?: string;
  conditions?: EffectCondition[];
  childEffects?: EffectAction[];  // For "then" effects
  donCountByTarget?: {  // For ATTACH_DON effects: how many DON to attach per target type
    leader: number;
    character: number;
  };
  // For SEARCH_AND_SELECT effects
  traitFilter?: string;           // Filter by trait (e.g., "Celestial Dragons")
  excludeNames?: string[];        // Exclude cards with these names
  maxCount?: number;              // Max cards to select (e.g., 1 for "up to 1")
  selectAction?: 'ADD_TO_HAND' | 'PLAY_TO_FIELD' | 'ADD_TO_LIFE';
  remainderAction?: 'TRASH' | 'DECK_BOTTOM' | 'SHUFFLE_INTO_DECK';
  // For PLAY_FROM_TRASH / PLAY_FROM_DECK effects
  playRested?: boolean;           // Play the card in rested state
  // For IMMUNE_KO effects
  immuneFrom?: string;            // Source of immunity (e.g., 'OPPONENT_CHARACTERS', 'ALL')
  condition?: any;                // Additional condition for the effect
}

// ============================================
// RUNTIME EFFECT TRACKING
// ============================================

export interface ActiveEffect {
  id: string;
  sourceCardId: string;
  sourcePlayerId: string;
  effectDefinition: CardEffectDefinition;
  appliedAt: number;  // Turn number
  expiresAt?: EffectDuration;
  targetIds?: string[];
  modifiers?: EffectModifier[];
}

export interface EffectModifier {
  type: 'POWER' | 'COST' | 'KEYWORD';
  value: number | string;
  operation: 'ADD' | 'SET' | 'SUBTRACT';
}

export interface PendingEffect {
  id: string;
  sourceCardId: string;
  playerId: string;
  effect: CardEffectDefinition;
  trigger: EffectTrigger;
  validTargets?: string[];
  requiresChoice: boolean;
  priority: number;
}

export interface EffectResolutionResult {
  success: boolean;
  effectId: string;
  changes: StateChange[];
  childEffects?: PendingEffect[];
  error?: string;
}

export interface StateChange {
  type: 'CARD_MOVED' | 'POWER_CHANGED' | 'COST_CHANGED' | 'KEYWORD_ADDED' |
        'KEYWORD_REMOVED' | 'DON_CHANGED' | 'LIFE_CHANGED' | 'CARD_CREATED' |
        'CARD_DESTROYED' | 'PLAYER_DREW' | 'EFFECT_APPLIED' | 'EFFECT_REMOVED';
  cardId?: string;
  playerId?: string;
  from?: string;
  to?: string;
  value?: number | string;
}

// ============================================
// KEYWORD DEFINITIONS
// ============================================

export const KeywordDefinitions: Record<string, { description: string; trigger: EffectTrigger }> = {
  'Rush': {
    description: 'This card can attack on the turn it is played.',
    trigger: EffectTrigger.PASSIVE,
  },
  'Blocker': {
    description: 'When your opponent attacks, you may rest this card to change the target of the attack to this card.',
    trigger: EffectTrigger.ON_BLOCK,
  },
  'Banish': {
    description: 'When this card deals damage in battle, the opponent\'s cards are trashed instead of going to hand.',
    trigger: EffectTrigger.PASSIVE,
  },
  'Double Attack': {
    description: 'This card deals 2 damage instead of 1 when attacking the Leader.',
    trigger: EffectTrigger.PASSIVE,
  },
};
