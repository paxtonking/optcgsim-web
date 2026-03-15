import { beforeEach, describe, expect, it } from 'vitest';
import { EffectContext, EffectEngine } from '../EffectEngine';
import { EffectTrigger, EffectType, TargetType } from '../types';
import { GameStateManager } from '../../game/GameStateManager';
import { ActionType, CardState, CardZone, GamePhase } from '../../types/game';
import {
  addToField,
  createBlockerCard,
  createCounterCard,
  createMockCard,
  createMockCardDefinition,
  createMockGameState,
  createUnblockableOnAttackCard,
  resetCardIdCounter,
} from '../../test-utils';

describe('combat and effect resolution regressions', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('uses modified cost for KO_COST_OR_LESS effects', () => {
    const engine = new EffectEngine();
    const gameState = createMockGameState();
    const player = gameState.players.player1;
    const opponent = gameState.players.player2;
    const sourceCard = createMockCard({ id: 'ko-source', owner: player.id });
    const target = createMockCard({
      id: 'reduced-target',
      owner: opponent.id,
      cost: 5,
      modifiedCost: 3,
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    addToField(player, [sourceCard]);
    addToField(opponent, [target]);

    const effect = {
      id: 'ko-reduced-cost',
      trigger: EffectTrigger.ON_PLAY,
      description: 'K.O. up to 1 cost 3 or less character.',
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        value: 3,
      }],
    };

    const context: EffectContext = {
      gameState,
      sourceCard,
      sourcePlayer: player,
      selectedTargets: [target.id],
    };

    engine.resolveEffect(effect, context);

    expect(opponent.field.map(card => card.id)).not.toContain(target.id);
    expect(opponent.trash.map(card => card.id)).toContain(target.id);
  });

  it('auto-resolves mandatory non-choice ON_PLAY effects', () => {
    const manager = new GameStateManager('game-on-play-auto-resolve', 'player1', 'player2');
    const state = manager.getState();

    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'ON_PLAY_DRAW',
        cost: 0,
        effects: [{
          id: 'draw-on-play',
          trigger: EffectTrigger.ON_PLAY,
          description: 'On Play: Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const playedCard = createMockCard({
      id: 'on-play-draw-card',
      cardId: 'ON_PLAY_DRAW',
      owner: 'player1',
      zone: CardZone.HAND,
    });
    const drawnCard = createMockCard({
      id: 'drawn-card',
      owner: 'player1',
      zone: CardZone.DECK,
    });

    state.players.player1.hand = [playedCard];
    state.players.player1.deck = [drawnCard];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.playCard('player1', playedCard.id)).toBe(true);

    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.pendingPlayEffects).toBeUndefined();
    expect(state.players.player1.field.map(card => card.id)).toContain(playedCard.id);
    expect(state.players.player1.hand.map(card => card.id)).toContain(drawnCard.id);
  });

  it('does not allow skipping mandatory choice ON_PLAY effects', () => {
    const manager = new GameStateManager('game-on-play-mandatory-choice', 'player1', 'player2');
    const state = manager.getState();

    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'ON_PLAY_REST',
        cost: 0,
        effects: [{
          id: 'rest-on-play',
          trigger: EffectTrigger.ON_PLAY,
          description: 'On Play: Rest up to 1 opponent character.',
          effects: [{
            type: EffectType.REST_CHARACTER,
            target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
          }],
        }],
      }),
    ]);

    const playedCard = createMockCard({
      id: 'on-play-rest-card',
      cardId: 'ON_PLAY_REST',
      owner: 'player1',
      zone: CardZone.HAND,
    });
    const target = createMockCard({
      id: 'rest-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.hand = [playedCard];
    state.players.player2.field = [target];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.playCard('player1', playedCard.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.PLAY_EFFECT_STEP);

    const pendingEffect = state.pendingPlayEffects?.[0];
    expect(pendingEffect).toBeDefined();
    expect(pendingEffect?.isOptional).toBe(false);
    expect(manager.skipPlayEffect(pendingEffect!.id)).toBe(false);
    expect(manager.resolvePlayEffect(pendingEffect!.id, [target.id])).toBe(true);
    expect(target.state).toBe(CardState.RESTED);
  });

  it('auto-resolves mandatory non-choice ON_ATTACK effects before blocker step', () => {
    const manager = new GameStateManager('game-on-attack-auto-resolve', 'player1', 'player2');
    const state = manager.getState();

    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'ATTACK_DRAW',
        effects: [{
          id: 'draw-on-attack',
          trigger: EffectTrigger.ON_ATTACK,
          description: 'When Attacking: Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const attacker = createMockCard({
      id: 'attack-draw-attacker',
      cardId: 'ATTACK_DRAW',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const defender = createMockCard({
      id: 'attack-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 4000,
      basePower: 4000,
    });
    const drawnCard = createMockCard({
      id: 'attack-drawn-card',
      owner: 'player1',
      zone: CardZone.DECK,
    });

    state.players.player1.field = [attacker];
    state.players.player1.deck = [drawnCard];
    state.players.player2.field = [defender];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, defender.id, 'character')).toBe(true);

    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(state.pendingAttackEffects).toBeUndefined();
    expect(state.players.player1.hand.map(card => card.id)).toContain(drawnCard.id);
  });

  it('lets the defending player resolve the current OPPONENT_ATTACK effect', () => {
    const manager = new GameStateManager('game-defender-opponent-attack-priority', 'player1', 'player2');
    const state = manager.getState();

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
          }],
        }],
      }),
    ]);

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

    const pendingEffect = state.pendingAttackEffects?.[0];
    expect(pendingEffect).toMatchObject({
      sourceCardId: reactiveDefender.id,
      playerId: 'player2',
      validTargets: [attacker.id],
    });

    expect(manager.processAction({
      id: 'attack-effect-wrong-player',
      type: ActionType.RESOLVE_ATTACK_EFFECT,
      playerId: 'player1',
      timestamp: Date.now(),
      data: { effectId: pendingEffect!.id, selectedTargets: [attacker.id] },
    })).toBe(false);

    expect(manager.processAction({
      id: 'attack-effect-defender',
      type: ActionType.RESOLVE_ATTACK_EFFECT,
      playerId: 'player2',
      timestamp: Date.now(),
      data: { effectId: pendingEffect!.id, selectedTargets: [attacker.id] },
    })).toBe(true);

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

  it('allows blockers to retarget attacks against rested characters', () => {
    const manager = new GameStateManager('game-character-blocker', 'player1', 'player2');
    const state = manager.getState();
    const { card: blocker, definition: blockerDefinition } = createBlockerCard('player2');

    manager.loadCardDefinitions([blockerDefinition]);

    const attacker = createMockCard({
      id: 'character-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 7000,
      basePower: 7000,
    });
    const originalTarget = createMockCard({
      id: 'original-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 3000,
      basePower: 3000,
    });

    state.players.player1.field = [attacker];
    state.players.player2.field = [blocker, originalTarget];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, originalTarget.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(manager.declareBlocker('player2', blocker.id)).toBe(true);

    expect(state.currentCombat?.targetId).toBe(blocker.id);
    expect(state.currentCombat?.targetType).toBe('character');
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);
  });

  it('keeps a counter window for normal character attacks after blocker priority passes', () => {
    const manager = new GameStateManager('game-character-counter-window', 'player1', 'player2');
    const state = manager.getState();
    const { card: counterCard, definition: counterDefinition } = createCounterCard('player2', 2000);

    manager.loadCardDefinitions([counterDefinition]);

    const attacker = createMockCard({
      id: 'counter-window-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const target = createMockCard({
      id: 'counter-window-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 5000,
      basePower: 5000,
    });

    counterCard.id = 'normal-character-counter';
    counterCard.owner = 'player2';
    counterCard.zone = CardZone.HAND;

    state.players.player1.field = [attacker];
    state.players.player2.field = [target];
    state.players.player2.hand = [counterCard];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, target.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);

    expect(manager.passBlocker('player2')).toBe(true);
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);

    expect(manager.useCounter('player2', [counterCard.id])).toBe(true);

    expect(state.currentCombat).toBeUndefined();
    expect(state.players.player2.field.map(card => card.id)).toContain(target.id);
    expect(state.players.player2.trash.map(card => card.id)).toContain(counterCard.id);
    expect(state.players.player2.trash.map(card => card.id)).not.toContain(target.id);
  });

  it('keeps a counter window for unblockable character attacks and applies counter power', () => {
    const manager = new GameStateManager('game-unblockable-character-counter', 'player1', 'player2');
    const state = manager.getState();
    const { card: attacker, definition: attackerDefinition } = createUnblockableOnAttackCard('player1');
    const { card: counterCard, definition: counterDefinition } = createCounterCard('player2', 2000);
    attacker.cardId = 'UNBLOCKABLE-ATTACKER';
    attackerDefinition.id = 'UNBLOCKABLE-ATTACKER';
    counterCard.cardId = 'COUNTER-2000';
    counterDefinition.id = 'COUNTER-2000';
    manager.loadCardDefinitions([attackerDefinition, counterDefinition]);

    attacker.id = 'unblockable-attacker';
    attacker.power = 6000;
    attacker.basePower = 6000;

    const target = createMockCard({
      id: 'counter-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 5000,
      basePower: 5000,
    });

    counterCard.id = 'character-counter';
    counterCard.owner = 'player2';
    counterCard.zone = CardZone.HAND;

    state.players.player1.field = [attacker];
    state.players.player2.field = [target];
    state.players.player2.hand = [counterCard];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, target.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);
    expect(manager.useCounter('player2', [counterCard.id])).toBe(true);

    expect(state.currentCombat).toBeUndefined();
    expect(state.players.player2.field.map(card => card.id)).toContain(target.id);
    expect(state.players.player2.trash.map(card => card.id)).toContain(counterCard.id);
    expect(state.players.player2.trash.map(card => card.id)).not.toContain(target.id);
  });
});
