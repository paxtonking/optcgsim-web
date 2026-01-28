/**
 * Custom Test Assertions
 */

import { GameState, PlayerState, GameCard, CardZone, CardState } from '../types/game';
import { expect } from 'vitest';

/**
 * Asserts that a card is in a specific zone
 */
export function expectCardInZone(
  gameState: GameState,
  cardId: string,
  zone: CardZone,
  playerId?: string
): void {
  const player = playerId
    ? gameState.players[playerId]
    : Object.values(gameState.players).find(p => {
        return findCardInPlayer(p, cardId) !== undefined;
      });

  expect(player).toBeDefined();

  const card = findCardInPlayer(player!, cardId);
  expect(card).toBeDefined();
  expect(card!.zone).toBe(zone);
}

/**
 * Asserts that a card has a specific power
 */
export function expectCardPower(
  gameState: GameState,
  cardId: string,
  expectedPower: number
): void {
  const card = findCardInGameState(gameState, cardId);
  expect(card).toBeDefined();
  expect(card!.power).toBe(expectedPower);
}

/**
 * Asserts that a card has a specific keyword
 */
export function expectCardHasKeyword(
  gameState: GameState,
  cardId: string,
  keyword: string
): void {
  const card = findCardInGameState(gameState, cardId);
  expect(card).toBeDefined();
  expect(card!.keywords).toContain(keyword);
}

/**
 * Asserts that a card has a specific temporary keyword
 */
export function expectCardHasTemporaryKeyword(
  gameState: GameState,
  cardId: string,
  keyword: string
): void {
  const card = findCardInGameState(gameState, cardId);
  expect(card).toBeDefined();
  expect(card!.temporaryKeywords).toContain(keyword);
}

/**
 * Asserts that a card does not have a keyword
 */
export function expectCardNotHasKeyword(
  gameState: GameState,
  cardId: string,
  keyword: string
): void {
  const card = findCardInGameState(gameState, cardId);
  expect(card).toBeDefined();
  expect(card!.keywords || []).not.toContain(keyword);
}

/**
 * Asserts that a card is in a specific state
 */
export function expectCardState(
  gameState: GameState,
  cardId: string,
  expectedState: CardState
): void {
  const card = findCardInGameState(gameState, cardId);
  expect(card).toBeDefined();
  expect(card!.state).toBe(expectedState);
}

/**
 * Asserts player's hand size
 */
export function expectHandSize(
  gameState: GameState,
  playerId: string,
  expectedSize: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  expect(player.hand.length).toBe(expectedSize);
}

/**
 * Asserts player's field size
 */
export function expectFieldSize(
  gameState: GameState,
  playerId: string,
  expectedSize: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  expect(player.field.length).toBe(expectedSize);
}

/**
 * Asserts player's life count
 */
export function expectLife(
  gameState: GameState,
  playerId: string,
  expectedLife: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  expect(player.life).toBe(expectedLife);
}

/**
 * Asserts player's deck size
 */
export function expectDeckSize(
  gameState: GameState,
  playerId: string,
  expectedSize: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  expect(player.deck.length).toBe(expectedSize);
}

/**
 * Asserts player's trash size
 */
export function expectTrashSize(
  gameState: GameState,
  playerId: string,
  expectedSize: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  expect(player.trash.length).toBe(expectedSize);
}

/**
 * Asserts active DON count
 */
export function expectActiveDonCount(
  gameState: GameState,
  playerId: string,
  expectedCount: number
): void {
  const player = gameState.players[playerId];
  expect(player).toBeDefined();
  const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE);
  expect(activeDon.length).toBe(expectedCount);
}

/**
 * Asserts that combat buff power is a specific value
 */
export function expectCombatBuffPower(
  gameState: GameState,
  expectedValue: number
): void {
  expect(gameState.currentCombat).toBeDefined();
  expect(gameState.currentCombat!.effectBuffPower).toBe(expectedValue);
}

// Helper functions

function findCardInPlayer(player: PlayerState, cardId: string): GameCard | undefined {
  if (player.leaderCard?.id === cardId) {
    return player.leaderCard;
  }

  const allCards = [
    ...player.hand,
    ...player.field,
    ...player.trash,
    ...player.deck,
    ...player.lifeCards,
    ...player.donField,
  ];

  return allCards.find(c => c.id === cardId);
}

function findCardInGameState(gameState: GameState, cardId: string): GameCard | undefined {
  for (const player of Object.values(gameState.players)) {
    const card = findCardInPlayer(player, cardId);
    if (card) return card;
  }
  return undefined;
}
