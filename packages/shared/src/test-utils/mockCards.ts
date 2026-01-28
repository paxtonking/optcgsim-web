/**
 * Mock Card Utilities
 */

import { GameCard, CardZone, CardState } from '../types/game';
import { CardDefinition } from '../effects/EffectEngine';
import { CardEffectDefinition, EffectTrigger, EffectType, TargetType, EffectDuration } from '../effects/types';

let cardIdCounter = 0;

/**
 * Creates a mock GameCard with sensible defaults
 */
export function createMockCard(
  overrides: Partial<GameCard> & { cardId?: string } = {}
): GameCard {
  const id = `card-${++cardIdCounter}`;
  return {
    id,
    cardId: overrides.cardId || 'TEST-001',
    zone: CardZone.FIELD,
    state: CardState.ACTIVE,
    owner: 'player1',
    power: 5000,
    ...overrides,
  };
}

/**
 * Creates a mock leader card
 */
export function createMockLeader(
  playerId: string,
  overrides: Partial<GameCard> = {}
): GameCard {
  return createMockCard({
    cardId: 'ST01-001',
    zone: CardZone.LEADER,
    state: CardState.ACTIVE,
    owner: playerId,
    power: 5000,
    ...overrides,
  });
}

/**
 * Creates a mock DON card
 */
export function createMockDon(
  playerId: string,
  state: CardState = CardState.ACTIVE,
  overrides: Partial<GameCard> = {}
): GameCard {
  return createMockCard({
    cardId: 'DON',
    zone: CardZone.DON_FIELD,
    state,
    owner: playerId,
    ...overrides,
  });
}

/**
 * Creates a mock CardDefinition for testing
 */
export function createMockCardDefinition(
  overrides: Partial<CardDefinition> = {}
): CardDefinition {
  return {
    id: overrides.id || 'TEST-001',
    name: overrides.name || 'Test Card',
    type: overrides.type || 'CHARACTER',
    colors: overrides.colors || ['Red'],
    cost: overrides.cost ?? 3,
    power: overrides.power ?? 5000,
    counter: overrides.counter ?? null,
    traits: overrides.traits || [],
    effects: overrides.effects || [],
    keywords: overrides.keywords || [],
  };
}

/**
 * Creates a mock effect definition
 */
export function createMockEffect(
  trigger: EffectTrigger = EffectTrigger.ON_PLAY,
  effectType: EffectType = EffectType.DRAW_CARDS,
  overrides: Partial<CardEffectDefinition> = {}
): CardEffectDefinition {
  return {
    id: `effect-${++cardIdCounter}`,
    trigger,
    effects: [{
      type: effectType,
      value: 1,
      duration: EffectDuration.INSTANT,
    }],
    description: 'Test effect',
    ...overrides,
  };
}

// Pre-made test cards for common scenarios

/**
 * Creates a card with Rush keyword
 */
export function createRushCard(playerId: string = 'player1'): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({
    owner: playerId,
    keywords: ['Rush'],
  });

  const definition = createMockCardDefinition({
    id: card.cardId,
    keywords: ['Rush'],
    effects: [{
      id: 'rush-effect',
      trigger: EffectTrigger.PASSIVE,
      effects: [{ type: EffectType.RUSH }],
      description: 'Rush',
    }],
  });

  return { card, definition };
}

/**
 * Creates a card with Blocker keyword
 */
export function createBlockerCard(playerId: string = 'player1'): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({
    owner: playerId,
    keywords: ['Blocker'],
    state: CardState.ACTIVE,
  });

  const definition = createMockCardDefinition({
    id: card.cardId,
    keywords: ['Blocker'],
    effects: [{
      id: 'blocker-effect',
      trigger: EffectTrigger.PASSIVE,
      effects: [{ type: EffectType.BLOCKER }],
      description: 'Blocker',
    }],
  });

  return { card, definition };
}

/**
 * Creates a card with ON_PLAY draw effect
 */
export function createOnPlayDrawCard(playerId: string = 'player1', drawCount: number = 1): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({ owner: playerId });

  const definition = createMockCardDefinition({
    id: card.cardId,
    effects: [{
      id: 'on-play-draw',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: drawCount,
        duration: EffectDuration.INSTANT,
      }],
      description: `On Play: Draw ${drawCount} card(s).`,
    }],
  });

  return { card, definition };
}

/**
 * Creates a card with ON_ATTACK can't be blocked effect
 */
export function createUnblockableOnAttackCard(playerId: string = 'player1'): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({ owner: playerId });

  const definition = createMockCardDefinition({
    id: card.cardId,
    effects: [{
      id: 'on-attack-unblockable',
      trigger: EffectTrigger.ON_ATTACK,
      effects: [{
        type: EffectType.CANT_BE_BLOCKED,
        target: { type: TargetType.SELF },
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'When Attacking: This character cannot be blocked during this battle.',
    }],
  });

  return { card, definition };
}

/**
 * Creates a counter card with BUFF_COMBAT
 */
export function createCounterCard(playerId: string = 'player1', buffValue: number = 2000): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({
    owner: playerId,
    zone: CardZone.HAND,
  });

  const definition = createMockCardDefinition({
    id: card.cardId,
    counter: buffValue,
    effects: [{
      id: 'counter-buff',
      trigger: EffectTrigger.COUNTER,
      effects: [{
        type: EffectType.BUFF_COMBAT,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: buffValue,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: `Counter: +${buffValue} power`,
    }],
  });

  return { card, definition };
}

/**
 * Creates a trigger card for life pile
 */
export function createTriggerCard(playerId: string = 'player1'): {
  card: GameCard;
  definition: CardDefinition;
} {
  const card = createMockCard({
    owner: playerId,
    zone: CardZone.LIFE,
    faceUp: false,
  });

  const definition = createMockCardDefinition({
    id: card.cardId,
    effects: [{
      id: 'life-trigger',
      trigger: EffectTrigger.TRIGGER,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'Trigger: Draw 1 card.',
    }],
  });

  return { card, definition };
}

/**
 * Reset the card ID counter (useful between tests)
 */
export function resetCardIdCounter(): void {
  cardIdCounter = 0;
}
