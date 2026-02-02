/**
 * Mock Player Utilities
 */

import { PlayerState, GameCard, CardZone, CardState } from '../types/game';
import { createMockCard, createMockLeader, createMockDon } from './mockCards';

/**
 * Creates a mock PlayerState with sensible defaults
 */
export function createMockPlayer(
  id: string = 'player1',
  overrides: Partial<PlayerState> = {}
): PlayerState {
  const leaderId = overrides.leaderId || 'ST01-001';
  const leaderCard = overrides.leaderCard || createMockLeader(id, {
    id: `${id}-leader`,
    cardId: leaderId,
  });

  return {
    id,
    username: `Player ${id}`,
    leaderId,
    leaderCard,
    life: 5,
    maxLife: 5,
    lifeCards: overrides.lifeCards ?? createDefaultLifeCards(id, 5),
    hand: overrides.hand ?? [],
    field: overrides.field ?? [],
    trash: overrides.trash ?? [],
    deck: overrides.deck ?? createDefaultDeck(id, 40),
    donDeck: overrides.donDeck ?? 10,
    donField: overrides.donField ?? [],
    stage: null,
    isActive: overrides.isActive ?? (id === 'player1'),
    turnCount: overrides.turnCount ?? 0,
    extraTurns: overrides.extraTurns ?? 0,
  };
}

/**
 * Creates a mock opponent player
 */
export function createMockOpponent(
  id: string = 'player2',
  overrides: Partial<PlayerState> = {}
): PlayerState {
  return createMockPlayer(id, {
    isActive: false,
    ...overrides,
  });
}

/**
 * Creates default life cards for a player
 */
function createDefaultLifeCards(playerId: string, count: number): GameCard[] {
  const cards: GameCard[] = [];
  for (let i = 0; i < count; i++) {
    cards.push(createMockCard({
      id: `${playerId}-life-${i}`,
      cardId: `LIFE-${i}`,
      zone: CardZone.LIFE,
      owner: playerId,
      faceUp: false,
    }));
  }
  return cards;
}

/**
 * Creates a default deck for a player
 */
function createDefaultDeck(playerId: string, count: number): GameCard[] {
  const cards: GameCard[] = [];
  for (let i = 0; i < count; i++) {
    cards.push(createMockCard({
      id: `${playerId}-deck-${i}`,
      cardId: `DECK-${i}`,
      zone: CardZone.DECK,
      owner: playerId,
    }));
  }
  return cards;
}

/**
 * Adds cards to a player's hand
 */
export function addToHand(player: PlayerState, cards: GameCard[]): void {
  cards.forEach(card => {
    card.zone = CardZone.HAND;
    card.owner = player.id;
    player.hand.push(card);
  });
}

/**
 * Adds cards to a player's field
 */
export function addToField(player: PlayerState, cards: GameCard[]): void {
  cards.forEach(card => {
    card.zone = CardZone.FIELD;
    card.owner = player.id;
    player.field.push(card);
  });
}

/**
 * Adds DON cards to a player's field
 */
export function addDonToField(
  player: PlayerState,
  count: number,
  state: CardState = CardState.ACTIVE
): void {
  for (let i = 0; i < count; i++) {
    const don = createMockDon(player.id, state, {
      id: `${player.id}-don-${player.donField.length + i}`,
    });
    player.donField.push(don);
    if (player.donDeck > 0) {
      player.donDeck--;
    }
  }
}

/**
 * Rests a specified number of DON
 */
export function restDon(player: PlayerState, count: number): void {
  let rested = 0;
  for (const don of player.donField) {
    if (rested >= count) break;
    if (don.state === CardState.ACTIVE) {
      don.state = CardState.RESTED;
      rested++;
    }
  }
}

/**
 * Attaches a DON to a card
 */
export function attachDon(player: PlayerState, donCard: GameCard, targetCard: GameCard): void {
  donCard.attachedTo = targetCard.id;
  donCard.state = CardState.ATTACHED;
}

/**
 * Gets all active (non-rested, non-attached) DON
 */
export function getActiveDon(player: PlayerState): GameCard[] {
  return player.donField.filter(d => d.state === CardState.ACTIVE);
}

/**
 * Gets all DON attached to a specific card
 */
export function getAttachedDon(player: PlayerState, cardId: string): GameCard[] {
  return player.donField.filter(d => d.attachedTo === cardId);
}
