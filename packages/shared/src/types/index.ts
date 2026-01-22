// Card Types
export type CardType = 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE';
export type CardColor = 'RED' | 'GREEN' | 'BLUE' | 'PURPLE' | 'BLACK' | 'YELLOW';
export type CardAttribute = 'SLASH' | 'STRIKE' | 'RANGED' | 'WISDOM' | 'SPECIAL';

export interface Card {
  id: string;           // e.g., "OP01-001"
  setCode: string;      // e.g., "OP01"
  cardNumber: string;   // e.g., "001"
  name: string;
  type: CardType;
  colors: CardColor[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: CardAttribute | null;
  traits: string[];     // e.g., ["Straw Hat Crew", "Supernovas"]
  effects: CardEffect[];
  imageUrl: string;
}

export interface CardEffect {
  id: string;
  trigger: EffectTrigger;
  condition?: EffectCondition;
  action: EffectAction;
  description: string;
}

export type EffectTrigger =
  | 'ON_PLAY'
  | 'ON_ATTACK'
  | 'ON_BLOCK'
  | 'ON_KO'
  | 'END_OF_TURN'
  | 'START_OF_TURN'
  | 'ACTIVATE'
  | 'MAIN'
  | 'COUNTER'
  | 'TRIGGER'
  | 'BLOCKER'
  | 'RUSH'
  | 'BANISH'
  | 'DOUBLE_ATTACK';

export interface EffectCondition {
  type: string;
  params: Record<string, unknown>;
}

export interface EffectAction {
  type: string;
  params: Record<string, unknown>;
}

// Game State Types
export type GamePhase =
  | 'REFRESH'
  | 'DRAW'
  | 'DON'
  | 'MAIN'
  | 'BATTLE'
  | 'END';

export type Zone =
  | 'DECK'
  | 'HAND'
  | 'LEADER'
  | 'CHARACTER'
  | 'STAGE'
  | 'DON_DECK'
  | 'ACTIVE_DON'
  | 'RESTED_DON'
  | 'TRASH'
  | 'LIFE';

export interface GameCard {
  instanceId: string;
  cardId: string;
  zone: Zone;
  ownerId: string;
  isRested: boolean;
  attachedDon: number;
  powerModifier: number;
  turnPlayed: number;
  counters: Record<string, number>;
}

export interface Player {
  id: string;
  username: string;
  leader: GameCard | null;
  deck: GameCard[];
  hand: GameCard[];
  characters: GameCard[];
  stage: GameCard | null;
  donDeck: number;
  activeDon: GameCard[];
  restedDon: GameCard[];
  trash: GameCard[];
  life: GameCard[];
}

export interface GameState {
  id: string;
  players: [Player, Player];
  currentPlayerId: string;
  phase: GamePhase;
  turnNumber: number;
  activeEffects: ActiveEffect[];
  pendingActions: PendingAction[];
  attackState: AttackState | null;
  isGameOver: boolean;
  winnerId: string | null;
  lastAction: GameAction | null;
}

export interface ActiveEffect {
  id: string;
  sourceCardId: string;
  effect: CardEffect;
  expiresAt: 'END_OF_TURN' | 'END_OF_BATTLE' | 'PERMANENT' | number;
}

export interface PendingAction {
  type: string;
  playerId: string;
  options: unknown[];
  timeoutAt: number;
}

export interface AttackState {
  attackerId: string;
  attackerCardId: string;
  targetCardId: string;
  declaredPower: number;
  counterPower: number;
  blockerCardId: string | null;
}

// Game Actions
export type GameActionType =
  | 'PLAY_CARD'
  | 'ATTACK'
  | 'BLOCK'
  | 'USE_COUNTER'
  | 'ACTIVATE_EFFECT'
  | 'ATTACH_DON'
  | 'REST_DON'
  | 'END_PHASE'
  | 'MULLIGAN'
  | 'PASS';

export interface GameAction {
  type: GameActionType;
  playerId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// Deck Types
export interface Deck {
  id: string;
  userId: string;
  name: string;
  leaderId: string;
  cards: DeckCard[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeckCard {
  cardId: string;
  count: number;
}

// User Types
export interface User {
  id: string;
  email?: string;
  username: string;
  eloRating?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  createdAt?: Date;
  isGuest?: boolean;
}

export interface UserProfile extends User {
  decks: Deck[];
  matchHistory: MatchSummary[];
  stats: PlayerStats;
}

export interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  favoriteLeaders: { cardId: string; games: number }[];
  currentStreak: number;
  bestStreak: number;
}

// Match Types
export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  gameLog: GameAction[];
  ranked: boolean;
  createdAt: Date;
}

export interface MatchSummary {
  id: string;
  opponentId: string;
  opponentUsername: string;
  myLeaderId: string;
  opponentLeaderId: string;
  won: boolean;
  ranked: boolean;
  eloChange: number;
  createdAt: Date;
}

// Lobby Types
export interface Lobby {
  id: string;
  code: string;
  hostId: string;
  guestId: string | null;
  settings: LobbySettings;
  status: 'WAITING' | 'READY' | 'IN_GAME';
  createdAt: Date;
}

export interface LobbySettings {
  isRanked: boolean;
  timeLimit: number;  // seconds per turn
  isPrivate: boolean;
}

// WebSocket Event Types
export interface WSMessage<T = unknown> {
  event: string;
  data: T;
  timestamp: number;
}

export interface LobbyJoinedEvent {
  lobby: Lobby;
  players: { id: string; username: string; ready: boolean }[];
}

export interface GameStateUpdateEvent {
  state: GameState;
  lastAction: GameAction | null;
}

export interface ChatMessageEvent {
  senderId: string;
  senderUsername: string;
  message: string;
  timestamp: number;
}
