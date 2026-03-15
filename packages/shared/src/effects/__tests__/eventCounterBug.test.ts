import { describe, expect, it } from 'vitest';
import { EffectTrigger, EffectType, TargetType, EffectDuration } from '../types';
import { CardState, CardZone, GamePhase } from '../../types/game';
import { GameStateManager } from '../../game/GameStateManager';
import { createMockCard, createMockCardDefinition } from '../../test-utils';

describe('Event counter bug reproduction', () => {
  it('resolves event counter with BUFF_ANY target + DRAW_CARDS in flat effects array', () => {
    const manager = new GameStateManager('game-event-counter-buff-draw', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
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
      createMockCardDefinition({ id: 'DRAWN', effects: [] }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.COUNTER_STEP;
    state.turn = 2;
    state.activePlayerId = 'player1';

    const attacker = createMockCard({ id: 'attacker', cardId: 'ATTACKER', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE, power: 5000 });
    const p1Leader = createMockCard({ id: 'p1-leader', cardId: 'L1', owner: 'player1', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const p2Leader = createMockCard({ id: 'p2-leader', cardId: 'L2', owner: 'player2', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const counterEvent = createMockCard({ id: 'counter-event', cardId: 'BUFF-DRAW-EVENT', owner: 'player2', zone: CardZone.HAND, state: CardState.ACTIVE });
    const drawCard = createMockCard({ id: 'drawn-card', cardId: 'DRAWN', owner: 'player2', zone: CardZone.DECK, state: CardState.ACTIVE });

    // Give player2 some DON for payment
    const don1 = createMockCard({ id: 'don-1', cardId: 'DON', owner: 'player2', zone: CardZone.DON_FIELD, state: CardState.ACTIVE });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.hand = [counterEvent];
    state.players.player2.deck = [drawCard];
    state.players.player2.donField = [don1];
    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 5000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };

    // Use the counter
    const result = manager.useCounter('player2', [counterEvent.id]);
    expect(result).toBe(true);

    // Event card should be in trash
    expect(state.players.player2.trash.some(c => c.id === counterEvent.id)).toBe(true);

    // Since BUFF_ANY has a target, it should go to COUNTER_EFFECT_STEP for target selection
    expect(state.phase).toBe(GamePhase.COUNTER_EFFECT_STEP);
    expect(state.pendingCounterEffects).toBeDefined();
    expect(state.pendingCounterEffects!.length).toBe(1);

    // Resolve the counter effect with target selection (target the leader for the buff)
    const pendingEffect = state.pendingCounterEffects![0];
    const resolveResult = manager.resolveCounterEffect('player2', pendingEffect.id, [p2Leader.id]);
    expect(resolveResult).toBe(true);

    // After resolving, the draw should have happened
    // The drawn card should be in player2's hand
    expect(state.players.player2.hand.some(c => c.id === drawCard.id)).toBe(true);
  });

  it('resolves event counter with only DRAW_CARDS (no target needed)', () => {
    const manager = new GameStateManager('game-event-counter-draw-only', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
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
      createMockCardDefinition({ id: 'DRAWN', effects: [] }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.COUNTER_STEP;
    state.turn = 2;
    state.activePlayerId = 'player1';

    const attacker = createMockCard({ id: 'attacker', cardId: 'ATTACKER', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE, power: 5000 });
    const p1Leader = createMockCard({ id: 'p1-leader', cardId: 'L1', owner: 'player1', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const p2Leader = createMockCard({ id: 'p2-leader', cardId: 'L2', owner: 'player2', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const counterEvent = createMockCard({ id: 'counter-event', cardId: 'DRAW-ONLY-EVENT', owner: 'player2', zone: CardZone.HAND, state: CardState.ACTIVE });
    const drawCard = createMockCard({ id: 'drawn-card', cardId: 'DRAWN', owner: 'player2', zone: CardZone.DECK, state: CardState.ACTIVE });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.hand = [counterEvent];
    state.players.player2.deck = [drawCard];
    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 5000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };

    const result = manager.useCounter('player2', [counterEvent.id]);
    expect(result).toBe(true);
    // Should resolve immediately (no target selection needed)
    expect(state.players.player2.hand.some(c => c.id === drawCard.id)).toBe(true);
    expect(state.players.player2.trash.some(c => c.id === counterEvent.id)).toBe(true);
  });

  it('resolves event counter with BUFF_POWER and childEffects (parser pattern)', () => {
    const manager = new GameStateManager('game-event-counter-parser-pattern', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
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
      createMockCardDefinition({ id: 'DRAWN', effects: [] }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.COUNTER_STEP;
    state.turn = 2;
    state.activePlayerId = 'player1';

    const attacker = createMockCard({ id: 'attacker', cardId: 'ATTACKER', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE, power: 5000 });
    const p1Leader = createMockCard({ id: 'p1-leader', cardId: 'L1', owner: 'player1', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const p2Leader = createMockCard({ id: 'p2-leader', cardId: 'L2', owner: 'player2', zone: CardZone.LEADER, state: CardState.ACTIVE, power: 5000 });
    const counterEvent = createMockCard({ id: 'counter-event', cardId: 'BUFF-CHILD-DRAW-EVENT', owner: 'player2', zone: CardZone.HAND, state: CardState.ACTIVE });
    const drawCard = createMockCard({ id: 'drawn-card', cardId: 'DRAWN', owner: 'player2', zone: CardZone.DECK, state: CardState.ACTIVE });

    const don1 = createMockCard({ id: 'don-1', cardId: 'DON', owner: 'player2', zone: CardZone.DON_FIELD, state: CardState.ACTIVE });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.hand = [counterEvent];
    state.players.player2.deck = [drawCard];
    state.players.player2.donField = [don1];
    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 5000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };

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
