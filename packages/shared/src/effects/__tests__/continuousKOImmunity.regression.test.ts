import { beforeEach, describe, expect, it } from 'vitest';
import { EffectContext, EffectEngine } from '../EffectEngine';
import { EffectTrigger, EffectType, TargetType } from '../types';
import { CardZone } from '../../types/game';
import { addToField, createMockCard, createMockGameState, resetCardIdCounter } from '../../test-utils';

describe('Continuous KO immunity regression', () => {
  let engine: EffectEngine;

  const koEffect = {
    id: 'ko-test',
    trigger: EffectTrigger.ON_PLAY,
    effects: [{
      type: EffectType.KO_CHARACTER,
      target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
    }],
    description: 'KO 1 opponent character.',
  };

  beforeEach(() => {
    resetCardIdCounter();
    engine = new EffectEngine();
  });

  it('blocks KO when STAGE_CONTINUOUS immunity comes from a character on the field', () => {
    const gameState = createMockGameState();
    const player = gameState.players.player1;
    const opponent = gameState.players.player2;
    const sourceCard = createMockCard({ id: 'p1-source', owner: player.id });
    const protectedCard = createMockCard({
      id: 'p2-protected',
      owner: opponent.id,
      immunities: [{
        type: 'KO',
        source: 'EFFECTS',
        duration: 'STAGE_CONTINUOUS',
        sourceCardId: 'p2-protected',
      }],
    });

    addToField(player, [sourceCard]);
    addToField(opponent, [protectedCard]);

    const context: EffectContext = {
      gameState,
      sourceCard,
      sourcePlayer: player,
      selectedTargets: [protectedCard.id],
    };

    const result = engine.resolveEffect(koEffect, context);

    expect(result.changes).toHaveLength(0);
    expect(opponent.field.map(card => card.id)).toContain(protectedCard.id);
    expect(opponent.trash).toHaveLength(0);
  });

  it('blocks KO when STAGE_CONTINUOUS immunity comes from a leader', () => {
    const gameState = createMockGameState();
    const player = gameState.players.player1;
    const opponent = gameState.players.player2;
    const sourceCard = createMockCard({ id: 'p1-source', owner: player.id });
    const protectedCard = createMockCard({
      id: 'p2-protected',
      owner: opponent.id,
      immunities: [{
        type: 'KO',
        source: 'EFFECTS',
        duration: 'STAGE_CONTINUOUS',
        sourceCardId: opponent.leaderCard!.id,
      }],
    });

    addToField(player, [sourceCard]);
    addToField(opponent, [protectedCard]);

    const context: EffectContext = {
      gameState,
      sourceCard,
      sourcePlayer: player,
      selectedTargets: [protectedCard.id],
    };

    const result = engine.resolveEffect(koEffect, context);

    expect(result.changes).toHaveLength(0);
    expect(opponent.field.map(card => card.id)).toContain(protectedCard.id);
    expect(opponent.trash).toHaveLength(0);
  });

  it('still blocks KO when STAGE_CONTINUOUS immunity comes from a stage', () => {
    const gameState = createMockGameState();
    const player = gameState.players.player1;
    const opponent = gameState.players.player2;
    const sourceCard = createMockCard({ id: 'p1-source', owner: player.id });
    opponent.stage = createMockCard({
      id: 'p2-stage',
      owner: opponent.id,
      zone: CardZone.STAGE,
    });
    const protectedCard = createMockCard({
      id: 'p2-protected',
      owner: opponent.id,
      immunities: [{
        type: 'KO',
        source: 'EFFECTS',
        duration: 'STAGE_CONTINUOUS',
        sourceCardId: opponent.stage.id,
      }],
    });

    addToField(player, [sourceCard]);
    addToField(opponent, [protectedCard]);

    const context: EffectContext = {
      gameState,
      sourceCard,
      sourcePlayer: player,
      selectedTargets: [protectedCard.id],
    };

    const result = engine.resolveEffect(koEffect, context);

    expect(result.changes).toHaveLength(0);
    expect(opponent.field.map(card => card.id)).toContain(protectedCard.id);
    expect(opponent.trash).toHaveLength(0);
  });
});
