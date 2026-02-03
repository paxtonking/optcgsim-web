// Game state types for One Piece TCG

export enum GamePhase {
  // Start phases
  START_WAITING = 'START_WAITING',
  RPS_PHASE = 'RPS_PHASE',           // Rock-Paper-Scissors to determine who chooses first
  FIRST_CHOICE = 'FIRST_CHOICE',     // Winner chooses to go first or second
  PRE_GAME_SETUP = 'PRE_GAME_SETUP', // Pre-game abilities (e.g., Imu's start-of-game stage play)
  START_MULLIGAN = 'START_MULLIGAN',
  START_SETUP = 'START_SETUP',
  
  // Turn phases
  REFRESH_PHASE = 'REFRESH_PHASE',  // Return attached DON to cost area, then untap all cards
  DRAW_PHASE = 'DRAW_PHASE',
  DON_PHASE = 'DON_PHASE',
  MAIN_PHASE = 'MAIN_PHASE',
  COMBAT_PHASE = 'COMBAT_PHASE',
  END_PHASE = 'END_PHASE',
  
  // Special phases
  ATTACK_EFFECT_STEP = 'ATTACK_EFFECT_STEP',  // Player selects targets for ON_ATTACK abilities
  PLAY_EFFECT_STEP = 'PLAY_EFFECT_STEP',      // Player selects targets for ON_PLAY abilities
  EVENT_EFFECT_STEP = 'EVENT_EFFECT_STEP',    // Player resolves event [Main] effects with target selection
  COUNTER_EFFECT_STEP = 'COUNTER_EFFECT_STEP', // Player selects targets for event counter effects
  ADDITIONAL_COST_STEP = 'ADDITIONAL_COST_STEP', // Player chooses whether to pay optional costs
  DECK_REVEAL_STEP = 'DECK_REVEAL_STEP',      // Player selects from revealed deck cards
  HAND_SELECT_STEP = 'HAND_SELECT_STEP',      // Player selects cards from hand (discard, return, etc.)
  CHOICE_STEP = 'CHOICE_STEP',                // Player chooses between effect/cost alternatives
  FIELD_SELECT_STEP = 'FIELD_SELECT_STEP',    // Player selects characters from field (trash, rest, etc.)
  COUNTER_STEP = 'COUNTER_STEP',
  BLOCKER_STEP = 'BLOCKER_STEP',
  TRIGGER_STEP = 'TRIGGER_STEP',

  // Game end
  GAME_OVER = 'GAME_OVER'
}

export enum CardZone {
  DECK = 'DECK',
  HAND = 'HAND',
  FIELD = 'FIELD',
  STAGE = 'STAGE',
  TRASH = 'TRASH',
  LIFE = 'LIFE',
  DON_DECK = 'DON_DECK',
  DON_FIELD = 'DON_FIELD',
  LEADER = 'LEADER',
  EVENT = 'EVENT'  // Temporary zone for event cards being resolved
}

export enum CardState {
  ACTIVE = 'ACTIVE',
  RESTED = 'RESTED',
  ATTACHED = 'ATTACHED'
}

// Power buff tracking for temporary effects
export type BuffDuration = 'PERMANENT' | 'THIS_TURN' | 'THIS_BATTLE' | 'STAGE_CONTINUOUS';

export interface PowerBuff {
  id: string;              // Unique buff ID
  sourceCardId: string;    // Card that applied the buff
  value: number;           // +/- power amount
  duration: BuffDuration;
  appliedTurn?: number;    // Turn when applied (for THIS_TURN)
  appliedCombatId?: string; // Combat ID (for THIS_BATTLE)
}

export interface GameCard {
  id: string;          // Unique instance ID
  cardId: string;      // Card definition ID (e.g., "OP01-001")
  zone: CardZone;
  state: CardState;
  owner: string;       // Player ID
  attachedTo?: string; // ID of card this is attached to (for DON!)
  basePower?: number;  // Current base power (can be modified by [Your Turn] effects like SET_BASE_POWER)
  originalBasePower?: number; // Original power from card definition (for restoring after turn ends)
  power?: number;      // Current display power (for backwards compatibility)
  powerBuffs?: PowerBuff[]; // Active power modifications with duration tracking
  cost?: number;       // Current cost (can be modified by effects)
  modifiedCost?: number; // Cost after stage/continuous effects (undefined = no modification)
  keywords?: string[]; // Active keywords (Rush, Blocker, etc.)
  temporaryKeywords?: string[]; // Keywords granted by effects (cleared after battle)
  continuousKeywords?: string[]; // Keywords granted by continuous effects (recalculated)
  turnPlayed?: number; // Turn this was played
  hasAttacked?: boolean;
  position?: number;   // Position in zone (for ordering)
  faceUp?: boolean;    // For life cards
  activatedThisTurn?: boolean; // Track once-per-turn ability usage
  hasActiveEffect?: boolean; // For stages: true if providing continuous effects
  hasRushVsCharacters?: boolean; // Can attack characters on the turn played (Corrida Coliseum)
  restrictions?: CardRestriction[]; // Attack/ability restrictions
  immunities?: CardImmunity[]; // Protection from effects
  grantedEffects?: GrantedEffect[]; // Effects granted by other cards
}

// Effect granted to a card by another card's ability
export interface GrantedEffect {
  id: string;              // Unique ID for this granted effect
  sourceCardId: string;    // Card that granted this effect
  trigger: string;         // When the effect triggers (ON_ATTACK, ON_PLAY, etc.)
  effectType: string;      // What the effect does
  value?: number;          // Value for the effect (e.g., +2000 power)
  keyword?: string;        // For GRANT_KEYWORD effects: the keyword granted
  duration: 'THIS_TURN' | 'THIS_BATTLE' | 'WHILE_ON_FIELD' | 'PERMANENT' | 'UNTIL_END_OF_OPPONENT_TURN' | 'UNTIL_START_OF_YOUR_TURN';
  turnGranted: number;     // Turn when granted (for cleanup)
}

// Card restriction (e.g., CANT_ATTACK)
export interface CardRestriction {
  type: 'CANT_ATTACK' | 'CANT_BLOCK' | 'CANT_BE_TARGETED';
  until: 'END_OF_TURN' | 'END_OF_OPPONENT_TURN' | 'PERMANENT';
  turnApplied: number;
  source?: 'STAGE_CONTINUOUS' | 'EFFECT';
  sourceCardId?: string;
}

// Card immunity (e.g., IMMUNE_KO)
export interface CardImmunity {
  type: 'KO' | 'EFFECTS' | 'COMBAT';
  source?: string; // e.g., 'OPPONENT_CHARACTERS', 'ALL'
  sourceCardId?: string;
  duration?: 'PERMANENT' | 'STAGE_CONTINUOUS';
  condition?: any; // Additional condition for immunity
}

export interface PlayerState {
  id: string;
  username: string;
  leaderId: string;
  leaderCard?: GameCard;
  life: number;
  maxLife: number;  // Initial/maximum life count from leader
  lifeCards: GameCard[];
  hand: GameCard[];
  field: GameCard[];
  trash: GameCard[];
  deck: GameCard[];
  donDeck: number;     // Remaining DON! in deck
  donField: GameCard[]; // DON! on field
  stage: GameCard | null; // Stage card on field (only 1 per player)
  isActive: boolean;   // Is it this player's turn?
  turnCount: number;   // Number of turns this player has taken
  extraTurns?: number; // Queued extra turns from TAKE_ANOTHER_TURN effects
}

export interface CombatInfo {
  attackerId: string;
  targetId?: string;
  targetType: 'leader' | 'character';
  attackPower: number;
  counterPower?: number;
  effectBuffPower?: number;  // Power from BUFF_COMBAT effects (e.g., Guard Point +3000)
  blockers?: string[];
  isBlocked?: boolean;
  damage?: number;
}

// Rock-Paper-Scissors types
export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface RPSState {
  player1Choice?: RPSChoice;
  player2Choice?: RPSChoice;
  player1Id: string;
  player2Id: string;
  winnerId?: string;        // null if tie
  isTie?: boolean;
  roundNumber: number;      // Track number of rounds (for ties)
}

// Simplified pending effect for client display (without full CardEffectDefinition)
export interface PendingAttackEffect {
  id: string;
  sourceCardId: string;
  playerId: string;
  description: string;         // Human-readable effect description
  validTargets?: string[];     // IDs of cards that can be selected as targets
  requiresChoice: boolean;
}

// Pending effect for ON_PLAY abilities that require target selection
export interface PendingPlayEffect {
  id: string;
  sourceCardId: string;
  playerId: string;
  description: string;         // Human-readable effect description
  validTargets?: string[];     // IDs of cards that can be selected as targets
  requiresChoice: boolean;
  effectType: string;          // e.g., 'ATTACH_DON', 'BUFF_POWER'
  maxTargets?: number;         // Maximum number of targets to select
  minTargets?: number;         // Minimum number of targets (0 = optional)
}

// Pending effect for start-of-game abilities (e.g., Imu's stage play)
export interface PendingPreGameEffect {
  playerId: string;
  trait: string;              // Required trait (e.g., "Mary Geoise")
  cardType: 'STAGE' | 'CHARACTER' | 'EVENT';
  count: number;              // Number of cards to select (e.g., "up to 1")
  optional: boolean;          // Whether the effect can be skipped
  description: string;        // Human-readable description
  validCardIds: string[];     // IDs of valid cards in deck to select
}

// Pending effect for ACTIVATE_MAIN abilities that require hand selection (e.g., Empty Throne)
export interface PendingActivateEffect {
  id: string;
  sourceCardId: string;
  playerId: string;
  description: string;         // Human-readable effect description
  validHandCardIds: string[];  // IDs of valid cards in hand to select
  optional: boolean;           // Whether selection can be skipped ("up to X")
  maxTargets: number;          // Maximum number of targets to select
}

// Pending effect for event card [Main] effects requiring target selection
export interface PendingEventEffect {
  id: string;
  sourceCardId: string;        // The event card being resolved
  playerId: string;
  description: string;         // Human-readable effect description
  validTargets: string[];      // IDs of valid targets to select
  effectType: string;          // e.g., 'KO', 'BUFF_POWER'
  maxTargets: number;
  minTargets: number;          // 0 = optional ("up to X")
  conditionsMet: boolean;      // Whether leader/other conditions are satisfied
  additionalCost?: PendingAdditionalCost; // Optional additional cost to prompt
}

// Pending additional cost (e.g., "You may rest 1 DON")
export interface PendingAdditionalCost {
  id: string;
  sourceCardId: string;
  playerId: string;
  costType: 'REST_DON' | 'TRASH_CARD' | 'LIFE';
  amount: number;
  optional: boolean;           // "You may" = optional
  description: string;         // Human-readable cost description
}

// Pending effect for event counter effects requiring target selection
export interface PendingCounterEffect {
  id: string;
  sourceCardId: string;        // The event counter card
  playerId: string;
  description: string;         // Human-readable effect description
  validTargets: string[];      // IDs of valid targets (your Leader/Characters)
  effectType: string;          // e.g., 'BUFF_POWER'
  powerBoost: number;          // Amount of power to add
  maxTargets: number;
  conditionsMet: boolean;      // Whether leader/other conditions are satisfied
}

// Pending effect for deck reveal effects ("Look at X cards from deck")
export interface PendingDeckRevealEffect {
  id: string;
  sourceCardId: string;        // The card that triggered this effect
  playerId: string;
  description: string;         // Human-readable description
  revealedCardIds: string[];   // All cards revealed from deck (instance IDs)
  selectableCardIds: string[]; // Cards matching the filter (can be selected)
  maxSelections: number;       // e.g., 1 for "up to 1"
  minSelections: number;       // 0 for "up to", >0 for required
  traitFilter?: string;        // e.g., "Celestial Dragons"
  excludeNames?: string[];     // e.g., ["The Five Elders Are at Your Service!!!"]
  selectAction: 'ADD_TO_HAND' | 'PLAY_TO_FIELD' | 'ADD_TO_LIFE';
  remainderAction: 'TRASH' | 'DECK_BOTTOM' | 'SHUFFLE_INTO_DECK';
  childEffects?: any[];        // Follow-up effects to execute after deck reveal (e.g., discard from hand)
}

// Pending effect for hand selection effects ("Discard X cards", "Return X cards to deck")
export interface PendingHandSelectEffect {
  id: string;
  sourceCardId: string;        // The card that triggered this effect
  playerId: string;
  description: string;         // Human-readable description (e.g., "Trash 1 card from your hand")
  selectAction: 'TRASH' | 'RETURN_TO_DECK' | 'RETURN_TO_DECK_TOP' | 'RETURN_TO_DECK_BOTTOM';
  minSelections: number;       // Required number of selections
  maxSelections: number;       // Maximum selections allowed
  canSkip: boolean;            // Whether player can skip (for optional effects)
  // For cost payment - effect to execute after cost is paid
  isCostPayment?: boolean;     // True if this is paying a cost for an ability
  pendingEffectId?: string;    // ID of the effect to execute after cost paid
  sourceCardInstanceId?: string; // Instance ID of the card with the ability
}

// Pending effect for field character selection (trash/rest your characters as cost)
export interface PendingFieldSelectEffect {
  id: string;
  sourceCardId: string;        // The card that triggered this effect
  playerId: string;
  description: string;         // Human-readable description
  selectAction: 'TRASH' | 'REST' | 'RETURN_TO_HAND' | 'RETURN_TO_DECK';
  validTargetIds: string[];    // IDs of valid characters on field
  minSelections: number;       // Required number of selections
  maxSelections: number;       // Maximum selections allowed
  traitFilter?: string;        // Filter by trait (e.g., "Celestial Dragons")
  canSkip: boolean;            // Whether player can skip (for optional effects)
  // For cost payment - effect to execute after cost is paid
  isCostPayment?: boolean;     // True if this is paying a cost for an ability
  pendingEffectId?: string;    // ID of the effect to execute after cost paid
}

// Choice option for multi-option effects
export interface ChoiceOption {
  id: string;
  label: string;               // Display text for the option
  description?: string;        // Optional longer description
  enabled: boolean;            // Whether this option can be selected
  disabledReason?: string;     // Why the option is disabled (if applicable)
}

// Pending effect for "Choose one" and cost alternatives
export interface PendingChoiceEffect {
  id: string;
  sourceCardId: string;        // The card that triggered this effect
  playerId: string;
  description: string;         // Human-readable description
  choiceType: 'EFFECT_OPTION' | 'COST_ALTERNATIVE' | 'ZONE_SELECTION';
  options: ChoiceOption[];     // Available choices
  minSelections: number;       // Usually 1
  maxSelections: number;       // Usually 1 (for "Choose one")
  // For cost alternatives - track which cost was chosen
  selectedCostIndex?: number;
  pendingEffectId?: string;    // ID of the effect to execute after choice
}

export interface GameState {
  id: string;
  phase: GamePhase;
  turn: number;
  activePlayerId: string;
  firstPlayerId?: string;        // Player who goes first (cannot attack on turn 1)
  players: {
    [playerId: string]: PlayerState;
  };
  currentCombat?: CombatInfo;
  rpsState?: RPSState;           // Rock-Paper-Scissors state for first player determination
  firstChoiceWinner?: string;    // Player who won RPS and gets to choose first/second
  stack: GameAction[];  // Action stack for resolving effects
  winner?: string;
  lastAction?: GameAction;
  turnHistory: TurnAction[];
  pendingAttackEffects?: PendingAttackEffect[];  // Attack effects requiring target selection
  pendingPlayEffects?: PendingPlayEffect[];      // ON_PLAY effects requiring target selection
  pendingPreGameEffects?: PendingPreGameEffect[]; // Pre-game abilities requiring card selection
  pendingActivateEffects?: PendingActivateEffect[]; // ACTIVATE_MAIN effects requiring hand selection
  pendingEventEffects?: PendingEventEffect[];    // Event [Main] effects requiring target selection
  pendingCounterEffects?: PendingCounterEffect[]; // Event counter effects requiring target selection
  pendingAdditionalCost?: PendingAdditionalCost; // Optional additional cost waiting for player decision
  pendingDeckRevealEffect?: PendingDeckRevealEffect; // Deck reveal effect waiting for card selection
  pendingHandSelectEffect?: PendingHandSelectEffect; // Hand selection effect waiting for card selection (discard, etc.)
  pendingFieldSelectEffect?: PendingFieldSelectEffect; // Field selection effect waiting for character selection
  pendingChoiceEffect?: PendingChoiceEffect; // Choice effect waiting for option selection
}

export interface GameAction {
  id: string;
  type: ActionType;
  playerId: string;
  timestamp: number;
  data: any;
}

export enum ActionType {
  // Game setup
  GAME_START = 'GAME_START',
  RPS_CHOICE = 'RPS_CHOICE',         // Player's rock/paper/scissors choice
  FIRST_CHOICE = 'FIRST_CHOICE',     // Winner's choice to go first or second
  PRE_GAME_SELECT = 'PRE_GAME_SELECT', // Select a card for pre-game effect (e.g., Imu's stage play)
  SKIP_PRE_GAME = 'SKIP_PRE_GAME',     // Skip pre-game effect (optional ability)
  MULLIGAN = 'MULLIGAN',
  KEEP_HAND = 'KEEP_HAND',
  
  // Turn actions
  START_TURN = 'START_TURN',
  DRAW_CARD = 'DRAW_CARD',
  DRAW_DON = 'DRAW_DON',
  END_TURN = 'END_TURN',
  
  // Main phase actions
  PLAY_CARD = 'PLAY_CARD',
  ATTACH_DON = 'ATTACH_DON',
  DETACH_DON = 'DETACH_DON',
  ACTIVATE_ABILITY = 'ACTIVATE_ABILITY',
  
  // Combat actions
  DECLARE_ATTACK = 'DECLARE_ATTACK',
  RESOLVE_ATTACK_EFFECT = 'RESOLVE_ATTACK_EFFECT',  // Resolve ON_ATTACK effect with targets
  SKIP_ATTACK_EFFECT = 'SKIP_ATTACK_EFFECT',        // Skip ON_ATTACK effect
  RESOLVE_PLAY_EFFECT = 'RESOLVE_PLAY_EFFECT',      // Resolve ON_PLAY effect with targets
  SKIP_PLAY_EFFECT = 'SKIP_PLAY_EFFECT',            // Skip ON_PLAY effect
  RESOLVE_ACTIVATE_EFFECT = 'RESOLVE_ACTIVATE_EFFECT', // Resolve ACTIVATE_MAIN effect with hand selection
  SKIP_ACTIVATE_EFFECT = 'SKIP_ACTIVATE_EFFECT',       // Skip ACTIVATE_MAIN effect (optional)
  SELECT_BLOCKER = 'SELECT_BLOCKER',
  USE_COUNTER = 'USE_COUNTER',
  PASS_COUNTER = 'PASS_COUNTER',
  RESOLVE_COMBAT = 'RESOLVE_COMBAT',
  
  // Life actions
  TAKE_LIFE = 'TAKE_LIFE',
  ADD_LIFE = 'ADD_LIFE',
  TRIGGER_LIFE = 'TRIGGER_LIFE',
  
  // Other
  REST_CARD = 'REST_CARD',
  ACTIVATE_CARD = 'ACTIVATE_CARD',
  TRASH_CARD = 'TRASH_CARD',
  RETURN_CARD = 'RETURN_CARD',
  KO_CHARACTER = 'KO_CHARACTER',
  
  // Effect actions
  SELECT_TARGET = 'SELECT_TARGET',
  RESOLVE_EFFECT = 'RESOLVE_EFFECT',
  PASS_PRIORITY = 'PASS_PRIORITY',

  // Event card actions
  RESOLVE_EVENT_EFFECT = 'RESOLVE_EVENT_EFFECT',   // Resolve event [Main] effect with targets
  SKIP_EVENT_EFFECT = 'SKIP_EVENT_EFFECT',         // Skip event effect (if optional)
  PAY_ADDITIONAL_COST = 'PAY_ADDITIONAL_COST',     // Pay optional additional cost
  SKIP_ADDITIONAL_COST = 'SKIP_ADDITIONAL_COST',   // Skip optional additional cost
  RESOLVE_COUNTER_EFFECT = 'RESOLVE_COUNTER_EFFECT', // Resolve counter effect with targets
  SKIP_COUNTER_EFFECT = 'SKIP_COUNTER_EFFECT',       // Skip counter effect (optional)

  // Deck reveal actions (Look at X cards effects)
  RESOLVE_DECK_REVEAL = 'RESOLVE_DECK_REVEAL',     // Player confirms card selection from revealed cards
  SKIP_DECK_REVEAL = 'SKIP_DECK_REVEAL',           // Player skips selection (for "up to" effects)

  // Hand select actions (discard, return to deck, etc.)
  RESOLVE_HAND_SELECT = 'RESOLVE_HAND_SELECT',     // Player confirms card selection from hand
  SKIP_HAND_SELECT = 'SKIP_HAND_SELECT',           // Player skips selection (if allowed)

  // Field select actions (trash/rest characters from field)
  RESOLVE_FIELD_SELECT = 'RESOLVE_FIELD_SELECT',   // Player confirms character selection from field
  SKIP_FIELD_SELECT = 'SKIP_FIELD_SELECT',         // Player skips field selection (if allowed)

  // Choice actions (cost alternatives, effect options)
  RESOLVE_CHOICE = 'RESOLVE_CHOICE'                // Player selects an option from choices
}

export interface TurnAction {
  turn: number;
  playerId: string;
  actions: GameAction[];
}

export interface GameConfig {
  maxLife: number;
  startingHand: number;
  maxDon: number;
  donPerTurn: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxLife: 5,
  startingHand: 5,
  maxDon: 10,
  donPerTurn: 2
};

// Socket event types for multiplayer
export interface GameSocketEvents {
  // Client -> Server
  'game:create': (data: { deckId: string }) => void;
  'game:join': (data: { gameId: string; deckId: string }) => void;
  'game:action': (data: { gameId: string; action: GameAction }) => void;
  'game:leave': (data: { gameId: string }) => void;
  
  // Server -> Client
  'game:created': (data: { gameId: string }) => void;
  'game:joined': (data: { gameId: string; gameState: GameState }) => void;
  'game:state': (data: { gameState: GameState }) => void;
  'game:action:result': (data: { success: boolean; error?: string }) => void;
  'game:ended': (data: { winner: string; reason: string }) => void;
  'game:error': (data: { error: string }) => void;
}
