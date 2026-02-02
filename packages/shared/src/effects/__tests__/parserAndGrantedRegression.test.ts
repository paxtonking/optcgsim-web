import { beforeEach, describe, expect, it } from 'vitest';
import { EffectEngine, TriggerEvent } from '../EffectEngine';
import { effectTextParser } from '../parser/EffectTextParser';
import { EffectTrigger } from '../types';
import { CardZone, GamePhase } from '../../types/game';
import { GameStateManager } from '../../game/GameStateManager';
import {
  createMockCard,
  createMockCardDefinition,
  createMockGameState,
  resetCardIdCounter,
} from '../../test-utils';

describe('Effect parser regressions', () => {
  const getFirstEffectFilters = (text: string) => {
    const definitions = effectTextParser.parse(text, 'TEST-CARD');
    return definitions[0]?.effects[0]?.target?.filters ?? [];
  };

  it('keeps "other than [Name]" as a NAME NOT_EQUALS filter', () => {
    const filters = getFirstEffectFilters(
      '[On Play] Play up to 1 {Dressrosa} type Character card with a cost of 3 or less other than [Scarlet] from your hand rested.'
    );

    expect(filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'NAME',
          operator: 'NOT_EQUALS',
          value: 'Scarlet',
        }),
      ])
    );
  });

  it('uses BASE_COST (and avoids duplicate COST) for base-cost text', () => {
    const filters = getFirstEffectFilters(
      "[Main] Place up to 1 of your opponent's Characters with a base cost of 4 or less at the bottom of the owner's deck."
    );

    const baseCostFilters = filters.filter(f => f.property === 'BASE_COST');
    const costFilters = filters.filter(f => f.property === 'COST');

    expect(baseCostFilters).toHaveLength(1);
    expect(baseCostFilters[0]).toEqual(
      expect.objectContaining({
        operator: 'OR_LESS',
        value: 4,
      })
    );
    expect(costFilters).toHaveLength(0);
  });

  it('uses BASE_POWER (and avoids POWER) for base-power text', () => {
    const filters = getFirstEffectFilters(
      "[On K.O.] K.O. up to 1 of your opponent's Characters with a base power of 6000 or less."
    );

    const basePowerFilters = filters.filter(f => f.property === 'BASE_POWER');
    const powerFilters = filters.filter(f => f.property === 'POWER');

    expect(basePowerFilters).toHaveLength(1);
    expect(basePowerFilters[0]).toEqual(
      expect.objectContaining({
        operator: 'OR_LESS',
        value: 6000,
      })
    );
    expect(powerFilters).toHaveLength(0);
  });
});

describe('Granted effect regressions', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  it('only fires granted ON_ATTACK effects for the attacking card', () => {
    const gameState = createMockGameState();
    const player = gameState.players.player1;

    const grantedCard = createMockCard({
      cardId: 'GRANTED-CARD',
      owner: 'player1',
      zone: CardZone.FIELD,
      grantedEffects: [{
        id: 'granted-on-attack',
        sourceCardId: 'GRANTER',
        trigger: EffectTrigger.ON_ATTACK,
        effectType: 'BUFF_POWER',
        value: 1000,
        duration: 'THIS_TURN',
        turnGranted: gameState.turn,
      }],
    });

    const otherAttacker = createMockCard({
      cardId: 'OTHER-CARD',
      owner: 'player1',
      zone: CardZone.FIELD,
    });

    player.field.push(grantedCard, otherAttacker);

    engine.loadCardDefinitions([
      createMockCardDefinition({ id: 'GRANTED-CARD', effects: [] }),
      createMockCardDefinition({ id: 'OTHER-CARD', effects: [] }),
    ]);

    const wrongAttackEvent: TriggerEvent = {
      type: EffectTrigger.ON_ATTACK,
      cardId: otherAttacker.id,
      playerId: 'player1',
    };

    expect(engine.checkTriggers(gameState, wrongAttackEvent)).toHaveLength(0);

    const correctAttackEvent: TriggerEvent = {
      type: EffectTrigger.ON_ATTACK,
      cardId: grantedCard.id,
      playerId: 'player1',
    };

    const triggered = engine.checkTriggers(gameState, correctAttackEvent);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].sourceCardId).toBe(grantedCard.id);
  });

  it('does not fire WHILE_ON_FIELD granted effects after source leaves play', () => {
    const gameState = createMockGameState();
    const player = gameState.players.player1;

    const targetCard = createMockCard({
      cardId: 'TARGET-CARD',
      owner: 'player1',
      zone: CardZone.FIELD,
      grantedEffects: [{
        id: 'granted-while-on-field',
        sourceCardId: 'missing-source-card',
        trigger: EffectTrigger.ON_ATTACK,
        effectType: 'BUFF_POWER',
        value: 1000,
        duration: 'WHILE_ON_FIELD',
        turnGranted: gameState.turn,
      }],
    });

    player.field.push(targetCard);

    engine.loadCardDefinitions([
      createMockCardDefinition({ id: 'TARGET-CARD', effects: [] }),
    ]);

    const attackEvent: TriggerEvent = {
      type: EffectTrigger.ON_ATTACK,
      cardId: targetCard.id,
      playerId: 'player1',
    };

    expect(engine.checkTriggers(gameState, attackEvent)).toHaveLength(0);
  });
});

describe('Extra turn regressions', () => {
  it('consumes queued extra turns without relying on temporary keywords', () => {
    const manager = new GameStateManager('game-1', 'player1', 'player2');
    const gameState = createMockGameState({
      turn: 3,
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    gameState.players.player1.isActive = true;
    gameState.players.player1.extraTurns = 1;

    manager.setState(gameState);
    manager.endTurn('player1');

    const updatedState = manager.getState();
    expect(updatedState.activePlayerId).toBe('player1');
    expect(updatedState.players.player1.extraTurns).toBe(0);
  });
});
