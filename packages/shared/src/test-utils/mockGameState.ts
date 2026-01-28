/**
 * Mock GameState Utilities
 */

import { GameState, GamePhase, PlayerState, CombatInfo, GameCard } from '../types/game';
import { createMockPlayer, createMockOpponent } from './mockPlayers';

let gameIdCounter = 0;

/**
 * Creates a mock GameState with sensible defaults
 */
export function createMockGameState(
  overrides: Partial<GameState> = {}
): GameState {
  const player1 = overrides.players?.['player1'] || createMockPlayer('player1');
  const player2 = overrides.players?.['player2'] || createMockOpponent('player2');

  return {
    id: `game-${++gameIdCounter}`,
    phase: GamePhase.MAIN_PHASE,
    turn: 1,
    activePlayerId: 'player1',
    players: {
      player1,
      player2,
    },
    stack: [],
    turnHistory: [],
    ...overrides,
  };
}

/**
 * Creates a game state in the middle of combat
 */
export function createCombatGameState(
  attackerId: string,
  targetId: string,
  targetType: 'leader' | 'character' = 'leader',
  overrides: Partial<GameState> = {}
): GameState {
  const combat: CombatInfo = {
    attackerId,
    targetId,
    targetType,
    attackPower: 5000,
    counterPower: 0,
    effectBuffPower: 0,
    isBlocked: false,
  };

  return createMockGameState({
    phase: GamePhase.BLOCKER_STEP,
    currentCombat: combat,
    ...overrides,
  });
}

/**
 * Creates a game state with players set up for testing
 */
export function createSetupGameState(
  player1Setup: Partial<PlayerState> = {},
  player2Setup: Partial<PlayerState> = {},
  gameOverrides: Partial<GameState> = {}
): GameState {
  return createMockGameState({
    players: {
      player1: createMockPlayer('player1', player1Setup),
      player2: createMockOpponent('player2', player2Setup),
    },
    ...gameOverrides,
  });
}

/**
 * Gets the active player from a game state
 */
export function getActivePlayer(gameState: GameState): PlayerState {
  return gameState.players[gameState.activePlayerId];
}

/**
 * Gets the inactive (opponent) player from a game state
 */
export function getInactivePlayer(gameState: GameState): PlayerState {
  const inactiveId = Object.keys(gameState.players).find(
    id => id !== gameState.activePlayerId
  );
  return gameState.players[inactiveId!];
}

/**
 * Finds a card anywhere in the game state
 */
export function findCard(gameState: GameState, cardId: string): GameCard | undefined {
  for (const player of Object.values(gameState.players)) {
    // Check leader
    if (player.leaderCard?.id === cardId) {
      return player.leaderCard;
    }

    // Check all zones
    const allCards = [
      ...player.hand,
      ...player.field,
      ...player.trash,
      ...player.deck,
      ...player.lifeCards,
      ...player.donField,
    ];

    const found = allCards.find(c => c.id === cardId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Advances the game state to a specific phase
 */
export function setPhase(gameState: GameState, phase: GamePhase): void {
  gameState.phase = phase;
}

/**
 * Sets up combat state
 */
export function setupCombat(
  gameState: GameState,
  attackerId: string,
  targetId: string,
  targetType: 'leader' | 'character' = 'leader'
): void {
  gameState.currentCombat = {
    attackerId,
    targetId,
    targetType,
    attackPower: 5000,
    counterPower: 0,
    effectBuffPower: 0,
    isBlocked: false,
  };
  gameState.phase = GamePhase.BLOCKER_STEP;
}

/**
 * Clears combat state
 */
export function clearCombat(gameState: GameState): void {
  gameState.currentCombat = undefined;
  gameState.phase = GamePhase.MAIN_PHASE;
}

/**
 * Reset the game ID counter (useful between tests)
 */
export function resetGameIdCounter(): void {
  gameIdCounter = 0;
}
