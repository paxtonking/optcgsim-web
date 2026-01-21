// Game state types for One Piece TCG

export enum GamePhase {
  // Start phases
  START_WAITING = 'START_WAITING',
  START_MULLIGAN = 'START_MULLIGAN',
  START_SETUP = 'START_SETUP',
  
  // Turn phases
  UNTAP_PHASE = 'UNTAP_PHASE',
  DRAW_PHASE = 'DRAW_PHASE',
  DON_PHASE = 'DON_PHASE',
  MAIN_PHASE = 'MAIN_PHASE',
  COMBAT_PHASE = 'COMBAT_PHASE',
  END_PHASE = 'END_PHASE',
  
  // Special phases
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
  TRASH = 'TRASH',
  LIFE = 'LIFE',
  DON_DECK = 'DON_DECK',
  DON_FIELD = 'DON_FIELD',
  LEADER = 'LEADER'
}

export enum CardState {
  ACTIVE = 'ACTIVE',
  RESTED = 'RESTED',
  ATTACHED = 'ATTACHED'
}

export interface GameCard {
  id: string;          // Unique instance ID
  cardId: string;      // Card definition ID (e.g., "OP01-001")
  zone: CardZone;
  state: CardState;
  owner: string;       // Player ID
  attachedTo?: string; // ID of card this is attached to (for DON!)
  power?: number;      // Current power (can be modified by effects)
  cost?: number;       // Current cost (can be modified by effects)
  keywords?: string[]; // Active keywords (Rush, Blocker, etc.)
  turnPlayed?: number; // Turn this was played
  hasAttacked?: boolean;
  position?: number;   // Position in zone (for ordering)
  faceUp?: boolean;    // For life cards
}

export interface PlayerState {
  id: string;
  username: string;
  leaderId: string;
  leaderCard?: GameCard;
  life: number;
  lifeCards: GameCard[];
  hand: GameCard[];
  field: GameCard[];
  trash: GameCard[];
  deck: GameCard[];
  donDeck: number;     // Remaining DON! in deck
  donField: GameCard[]; // DON! on field
  isActive: boolean;   // Is it this player's turn?
}

export interface CombatInfo {
  attackerId: string;
  targetId?: string;
  targetType: 'leader' | 'character';
  attackPower: number;
  counterPower?: number;
  blockers?: string[];
  isBlocked?: boolean;
  damage?: number;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  turn: number;
  activePlayerId: string;
  players: {
    [playerId: string]: PlayerState;
  };
  currentCombat?: CombatInfo;
  stack: GameAction[];  // Action stack for resolving effects
  winner?: string;
  lastAction?: GameAction;
  turnHistory: TurnAction[];
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
  PASS_PRIORITY = 'PASS_PRIORITY'
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