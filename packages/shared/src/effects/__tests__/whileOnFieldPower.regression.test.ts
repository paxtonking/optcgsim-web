import { beforeEach, describe, expect, it } from 'vitest';
import { GameStateManager } from '../../game/GameStateManager';
import { CardZone } from '../../types/game';
import { createMockCard, resetCardIdCounter } from '../../test-utils';

describe('WHILE_ON_FIELD power regression', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('counts active WHILE_ON_FIELD buffs in gameplay and display power totals', () => {
    const manager = new GameStateManager('game-while-on-field-power', 'player1', 'player2');
    const state = manager.getState();

    const source = createMockCard({
      id: 'p1-source',
      owner: 'player1',
      zone: CardZone.FIELD,
      basePower: 4000,
      power: 4000,
    });
    const target = createMockCard({
      id: 'p1-target',
      owner: 'player1',
      zone: CardZone.FIELD,
      basePower: 5000,
      power: 5000,
      powerBuffs: [{
        id: 'buff-while-on-field',
        sourceCardId: source.id,
        value: 2000,
        duration: 'WHILE_ON_FIELD',
      }],
    });

    state.players.player1.field.push(source, target);

    expect(manager.getEffectivePower(target)).toBe(7000);
    expect(manager.getBuffTotal(target)).toBe(2000);

    state.players.player1.field = state.players.player1.field.filter(card => card.id !== source.id);
    source.zone = CardZone.TRASH;
    state.players.player1.trash.push(source);

    expect(manager.getEffectivePower(target)).toBe(5000);
    expect(manager.getBuffTotal(target)).toBe(0);
  });
});
