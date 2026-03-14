import { beforeEach, describe, expect, it } from 'vitest';
import { GameStateManager } from '../../game/GameStateManager';
import { EffectDuration, EffectTrigger, EffectType, TargetType } from '../types';
import { CardState, CardZone, GamePhase } from '../../types/game';
import {
  createMockCard,
  createMockCardDefinition,
  resetCardIdCounter,
} from '../../test-utils';

describe('GameStateManager review regressions', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('keeps character battle KOs in trash even when the attacker has Banish', () => {
    const manager = new GameStateManager('game-banish-character-ko', 'player1', 'player2');
    const state = manager.getState();

    const attacker = createMockCard({
      id: 'banish-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 7000,
      basePower: 7000,
      keywords: ['Banish'],
    });
    const defender = createMockCard({
      id: 'battle-defender',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 5000,
      basePower: 5000,
    });

    state.players.player1.field = [attacker];
    state.players.player2.field = [defender];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, defender.id, 'character')).toBe(true);

    manager.resolveCombat();

    expect(state.players.player2.field).toHaveLength(0);
    expect(state.players.player2.trash.map(card => card.id)).toContain(defender.id);
    expect(state.players.player2.deck.map(card => card.id)).not.toContain(defender.id);
  });

  it('surfaces and resolves defender-side OPPONENT_ATTACK effects that require choices', () => {
    const manager = new GameStateManager('game-defender-opponent-attack', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
      createMockCardDefinition({ id: 'ATTACK-TARGET', effects: [] }),
      createMockCardDefinition({
        id: 'REACTIVE-DEFENDER',
        effects: [{
          id: 'opp-attack-debuff',
          trigger: EffectTrigger.OPPONENT_ATTACK,
          description: 'When your opponent attacks, give the attacker -1000 power.',
          effects: [{
            type: EffectType.DEBUFF_POWER,
            target: { type: TargetType.ATTACKER, count: 1 },
            value: 1000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          }],
        }],
      }),
    ]);

    const state = manager.getState();
    const attacker = createMockCard({
      id: 'attacker',
      cardId: 'ATTACKER',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const reactiveDefender = createMockCard({
      id: 'reactive-defender',
      cardId: 'REACTIVE-DEFENDER',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 2000,
      basePower: 2000,
    });
    const attackTarget = createMockCard({
      id: 'attack-target',
      cardId: 'ATTACK-TARGET',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 3000,
      basePower: 3000,
    });

    state.players.player1.field = [attacker];
    state.players.player2.field = [reactiveDefender, attackTarget];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, attackTarget.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.ATTACK_EFFECT_STEP);

    const pendingEffect = state.pendingAttackEffects?.find(
      effect => effect.sourceCardId === reactiveDefender.id
    );

    expect(pendingEffect).toEqual(expect.objectContaining({
      playerId: 'player2',
      validTargets: [attacker.id],
    }));

    expect(manager.resolveAttackEffect(pendingEffect!.id, [attacker.id])).toBe(true);
    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(attacker.powerBuffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: -1000,
          duration: 'THIS_TURN',
        }),
      ])
    );
  });

  it('counts next-turn buff durations in power math while they are active', () => {
    const manager = new GameStateManager('game-next-turn-buffs', 'player1', 'player2');
    const state = manager.getState();

    const source = createMockCard({
      id: 'buff-source',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const target = createMockCard({
      id: 'buff-target',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 5000,
      basePower: 5000,
      powerBuffs: [
        {
          id: 'until-end-of-opponent-turn',
          sourceCardId: source.id,
          value: 1000,
          duration: 'UNTIL_END_OF_OPPONENT_TURN',
          appliedTurn: 1,
        },
        {
          id: 'until-start-of-your-turn',
          sourceCardId: source.id,
          value: 2000,
          duration: 'UNTIL_START_OF_YOUR_TURN',
          appliedTurn: 1,
        },
      ],
    });

    state.players.player1.field = [source, target];
    state.turn = 1;

    expect(manager.getEffectivePower(target)).toBe(8000);
    expect(manager.getBuffTotal(target)).toBe(3000);

    state.turn = 2;
    expect(manager.getEffectivePower(target)).toBe(8000);
    expect(manager.getBuffTotal(target)).toBe(3000);

    state.turn = 3;
    expect(manager.getEffectivePower(target)).toBe(5000);
    expect(manager.getBuffTotal(target)).toBe(0);
  });

  it('preserves real own-deck card ids during deck reveal sanitization', () => {
    const manager = new GameStateManager('game-deck-reveal-sanitize', 'player1', 'player2');
    const state = manager.getState();

    const revealedA = createMockCard({
      id: 'reveal-a',
      cardId: 'REVEAL-A',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const revealedB = createMockCard({
      id: 'reveal-b',
      cardId: 'REVEAL-B',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const hiddenTail = createMockCard({
      id: 'reveal-tail',
      cardId: 'REVEAL-TAIL',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

    state.players.player1.deck = [revealedA, revealedB, hiddenTail];
    state.phase = GamePhase.DECK_REVEAL_STEP;
    state.pendingDeckRevealEffect = {
      id: 'pending-deck-reveal',
      sourceCardId: 'source-card',
      playerId: 'player1',
      description: 'Look at the top 2 cards of your deck.',
      revealedCardIds: [revealedA.id, revealedB.id],
      selectableCardIds: [revealedA.id],
      maxSelections: 1,
      minSelections: 0,
      selectAction: 'ADD_TO_HAND',
      remainderAction: 'DECK_BOTTOM',
    };

    const sanitized = manager.sanitizeStateForPlayer('player1');
    const reconstructedRevealedCards = sanitized.pendingDeckRevealEffect!.revealedCardIds
      .map(revealedId => sanitized.players.player1.deck.find(card => card.id === revealedId))
      .filter((card): card is NonNullable<typeof card> => card !== undefined);

    expect(reconstructedRevealedCards.map(card => card.id)).toEqual([revealedA.id, revealedB.id]);
  });
});
