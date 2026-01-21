import type { CardColor, GamePhase } from '../types';

// Game Constants
export const DECK_SIZE = 50;
export const MAX_CARD_COPIES = 4;
export const STARTING_HAND_SIZE = 5;
export const STARTING_LIFE = 5;
export const DON_DECK_SIZE = 10;
export const MAX_CHARACTERS = 5;
export const MAX_DON_PER_TURN = 2;

// Turn Time Limits (in seconds)
export const TURN_TIME_LIMIT = 180;  // 3 minutes
export const COUNTER_TIME_LIMIT = 30;
export const EFFECT_RESOLUTION_LIMIT = 30;

// ELO Constants
export const DEFAULT_ELO = 1000;
export const K_FACTOR_NEW = 40;      // First 10 games
export const K_FACTOR_NORMAL = 20;   // After 10 games
export const K_FACTOR_HIGH = 10;     // Above 2000 ELO

// Rank Tiers
export const RANK_TIERS = {
  BRONZE: { min: 0, max: 999, name: 'Bronze' },
  SILVER: { min: 1000, max: 1199, name: 'Silver' },
  GOLD: { min: 1200, max: 1399, name: 'Gold' },
  PLATINUM: { min: 1400, max: 1599, name: 'Platinum' },
  DIAMOND: { min: 1600, max: 1799, name: 'Diamond' },
  MASTER: { min: 1800, max: Infinity, name: 'Master' },
} as const;

// Color Information
export const COLORS: Record<CardColor, { name: string; hex: string }> = {
  RED: { name: 'Red', hex: '#DC2626' },
  GREEN: { name: 'Green', hex: '#16A34A' },
  BLUE: { name: 'Blue', hex: '#2563EB' },
  PURPLE: { name: 'Purple', hex: '#9333EA' },
  BLACK: { name: 'Black', hex: '#1F2937' },
  YELLOW: { name: 'Yellow', hex: '#EAB308' },
};

// Phase Order
export const PHASE_ORDER: GamePhase[] = [
  'REFRESH',
  'DRAW',
  'DON',
  'MAIN',
  'END',
];

// Card Set Information
export const CARD_SETS = [
  { code: 'ST01', name: 'Straw Hat Crew', releaseDate: '2022-07-08' },
  { code: 'ST02', name: 'Worst Generation', releaseDate: '2022-07-08' },
  { code: 'ST03', name: 'The Seven Warlords', releaseDate: '2022-07-08' },
  { code: 'ST04', name: 'Animal Kingdom Pirates', releaseDate: '2022-07-08' },
  { code: 'OP01', name: 'Romance Dawn', releaseDate: '2022-07-22' },
  { code: 'OP02', name: 'Paramount War', releaseDate: '2022-11-04' },
  { code: 'OP03', name: 'Pillars of Strength', releaseDate: '2023-02-11' },
  { code: 'OP04', name: 'Kingdoms of Intrigue', releaseDate: '2023-05-27' },
  { code: 'OP05', name: 'Awakening of the New Era', releaseDate: '2023-08-25' },
  { code: 'OP06', name: 'Wings of the Captain', releaseDate: '2023-11-25' },
  { code: 'OP07', name: '500 Years in the Future', releaseDate: '2024-02-24' },
  { code: 'OP08', name: 'Two Legends', releaseDate: '2024-05-25' },
  { code: 'OP09', name: 'The Four Emperors', releaseDate: '2024-08-31' },
  // Add more sets as needed
] as const;

// API Endpoints
export const API_ROUTES = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    OAUTH: (provider: string) => `/auth/oauth/${provider}`,
  },
  USERS: {
    ME: '/users/me',
    BY_ID: (id: string) => `/users/${id}`,
    STATS: (id: string) => `/users/${id}/stats`,
  },
  DECKS: {
    LIST: '/decks',
    CREATE: '/decks',
    BY_ID: (id: string) => `/decks/${id}`,
    PUBLIC: '/decks/public',
  },
  CARDS: {
    SEARCH: '/cards',
    BY_ID: (id: string) => `/cards/${id}`,
    SETS: '/cards/sets',
  },
  MATCHES: {
    LIST: '/matches',
    BY_ID: (id: string) => `/matches/${id}`,
  },
  LEADERBOARD: '/leaderboard',
} as const;

// WebSocket Events
export const WS_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Lobby
  LOBBY_CREATE: 'lobby:create',
  LOBBY_JOIN: 'lobby:join',
  LOBBY_LEAVE: 'lobby:leave',
  LOBBY_READY: 'lobby:ready',
  LOBBY_UPDATE: 'lobby:update',
  LOBBY_START: 'lobby:start',

  // Queue
  QUEUE_JOIN: 'queue:join',
  QUEUE_LEAVE: 'queue:leave',
  QUEUE_MATCHED: 'queue:matched',
  QUEUE_STATUS: 'queue:status',

  // Game
  GAME_STATE: 'game:state',
  GAME_ACTION: 'game:action',
  GAME_CHAT: 'game:chat',
  GAME_SURRENDER: 'game:surrender',
  GAME_RECONNECT: 'game:reconnect',
  GAME_END: 'game:end',

  // Spectator
  SPECTATE_JOIN: 'spectate:join',
  SPECTATE_LEAVE: 'spectate:leave',
} as const;

// Validation
export const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  USERNAME_PATTERN: /^[a-zA-Z0-9_-]+$/,
  PASSWORD_MIN_LENGTH: 8,
  DECK_NAME_MAX_LENGTH: 50,
} as const;
