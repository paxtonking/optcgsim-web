import { describe, expect, it } from 'vitest';
import { EffectTrigger, EffectType, TargetType, EffectDuration } from '../types';
import { CardState, CardZone, GamePhase } from '../../types/game';
import { GameStateManager } from '../../game/GameStateManager';
import { CardDefinition } from '../EffectEngine';
import { createMockCard, createMockCardDefinition } from '../../test-utils';
import { GameCard } from '../../types/game';

describe('Event counter bug reproduction', () => {
  let manager: GameStateManager;
  let attacker: GameCard;
  let p1Leader: GameCard;
  let p2Leader: GameCard;
  let counterEvent: GameCard;
  let drawCard: GameCard;

  /**
   * Build the shared game scaffold: manager, leaders, attacker,
   * a drawable card, and combat state.
   *
   * `eventDefinition` is the only thing that varies between tests.
   * If the event card costs DON, pass `needsDon: true`.
   */
  function setup(eventDefinition: CardDefinition, opts?: { needsDon?: boolean }) {
    manager = new GameStateManager('game-event-counter', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
      createMockCardDefinition({ id: 'L1', type: 'LEADER', effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', effects: [] }),
      createMockCardDefinition({ id: 'DRAWN', effects: [] }),
      eventDefinition,
    ]);

    const state = manager.getState();
    state.phase = GamePhase.COUNTER_STEP;
    state.turn = 2;
    state.activePlayerId = 'player1';

    attacker = createMockCard({ id: 'attacker', cardId: 'ATTACKER', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE, power: 5000 });
    p1Leader = createMockCard({ id: 'p1-leader', cardId: 'L1', owner: 'player1', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    p2Leader = createMockCard({ id: 'p2-leader', cardId: 'L2', owner: 'player2', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    counterEvent = createMockCard({ id: 'counter-event', cardId: eventDefinition.id, owner: 'player2', zone: CardZone.HAND, state: CardState.ACTIVE });
    drawCard = createMockCard({ id: 'drawn-card', cardId: 'DRAWN', owner: 'player2', zone: CardZone.DECK, state: CardState.ACTIVE });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.hand = [counterEvent];
    state.players.player2.deck = [drawCard];

    if (opts?.needsDon) {
      const don1 = createMockCard({ id: 'don-1', cardId: 'DON', owner: 'player2', zone: CardZone.DON_FIELD, state: CardState.ACTIVE });
      state.players.player2.donField = [don1];
    }

    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 5000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };
  }

  it('resolves event counter with BUFF_ANY target + DRAW_CARDS in flat effects array', () => {
    setup(
      createMockCardDefinition({
        id: 'BUFF-DRAW-EVENT',
        type: 'EVENT',
        cost: 1,
        counter: null,
        effects: [{
          id: 'counter-buff-draw',
          trigger: EffectTrigger.COUNTER,
          description: '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card.',
          effects: [
            {
              type: EffectType.BUFF_ANY,
              target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1, optional: true },
              value: 4000,
              duration: EffectDuration.UNTIL_END_OF_BATTLE,
            },
            {
              type: EffectType.DRAW_CARDS,
              value: 1,
            },
          ],
        }],
      }),
      { needsDon: true },
    );

    const state = manager.getState();

    const result = manager.useCounter('player2', [counterEvent.id]);
    expect(result).toBe(true);

    // Event card should be in trash
    expect(state.players.player2.trash.some(c => c.id === counterEvent.id)).toBe(true);

    // Since BUFF_ANY has a target, it should go to COUNTER_EFFECT_STEP for target selection
    expect(state.phase).toBe(GamePhase.COUNTER_EFFECT_STEP);
    expect(state.pendingCounterEffects).toBeDefined();
    expect(state.pendingCounterEffects!.length).toBe(1);

    // Resolve the counter effect with target selection (target the leader for the buff).
    // Keep a reference to the combat object because resolveCombat() clears state.currentCombat.
    const combat = state.currentCombat!;
    const pendingEffect = state.pendingCounterEffects![0];
    const resolveResult = manager.resolveCounterEffect('player2', pendingEffect.id, [p2Leader.id]);
    expect(resolveResult).toBe(true);

    // After resolving, the draw should have happened
    expect(state.players.player2.hand.some(c => c.id === drawCard.id)).toBe(true);

    // The +4000 power buff should have been applied to combat
    expect(combat.effectBuffPower).toBe(4000);
  });

  it('resolves event counter with only DRAW_CARDS (no target needed)', () => {
    setup(
      createMockCardDefinition({
        id: 'DRAW-ONLY-EVENT',
        type: 'EVENT',
        cost: 0,
        counter: null,
        effects: [{
          id: 'counter-draw',
          trigger: EffectTrigger.COUNTER,
          description: '[Counter] Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    );

    const state = manager.getState();

    const result = manager.useCounter('player2', [counterEvent.id]);
    expect(result).toBe(true);

    // Should resolve immediately (no target selection needed)
    expect(state.players.player2.hand.some(c => c.id === drawCard.id)).toBe(true);
    expect(state.players.player2.trash.some(c => c.id === counterEvent.id)).toBe(true);
  });

  it('resolves event counter with BUFF_POWER and childEffects (parser pattern)', () => {
    setup(
      createMockCardDefinition({
        id: 'BUFF-CHILD-DRAW-EVENT',
        type: 'EVENT',
        cost: 1,
        counter: null,
        effects: [{
          id: 'counter-buff-child-draw',
          trigger: EffectTrigger.COUNTER,
          description: '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card.',
          effects: [
            {
              type: EffectType.BUFF_POWER,
              target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1, optional: true },
              value: 4000,
              duration: EffectDuration.UNTIL_END_OF_BATTLE,
              childEffects: [{
                type: EffectType.DRAW_CARDS,
                value: 1,
              }],
            },
          ],
        }],
      }),
      { needsDon: true },
    );

    const state = manager.getState();

    const result = manager.useCounter('player2', [counterEvent.id]);
    expect(result).toBe(true);

    // Should go to COUNTER_EFFECT_STEP for target selection
    expect(state.phase).toBe(GamePhase.COUNTER_EFFECT_STEP);

    // Resolve with target
    const pendingEffect = state.pendingCounterEffects![0];
    const resolveResult = manager.resolveCounterEffect('player2', pendingEffect.id, [p2Leader.id]);
    expect(resolveResult).toBe(true);

    // Draw (childEffect) should have been resolved
    expect(state.players.player2.hand.some(c => c.id === drawCard.id)).toBe(true);
  });
});
