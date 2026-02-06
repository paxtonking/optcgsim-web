import { beforeEach, describe, expect, it } from 'vitest';
import { EffectEngine, TriggerEvent } from '../EffectEngine';
import { effectTextParser } from '../parser/EffectTextParser';
import { EffectTrigger, EffectType, TargetType } from '../types';
import { ActionType, CardState, CardZone, GamePhase } from '../../types/game';
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

describe('Gameplay guard regressions', () => {
  it('does not lose when drawing the last card at start of turn', () => {
    const manager = new GameStateManager('game-1', 'player1', 'player2');
    const gameState = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player2',
    });

    gameState.players.player1.deck = [
      createMockCard({
        id: 'last-deck-card',
        owner: 'player1',
        zone: CardZone.DECK,
      }),
    ];

    manager.setState(gameState);
    manager.startTurn('player1');

    const updatedState = manager.getState();
    expect(updatedState.phase).toBe(GamePhase.MAIN_PHASE);
    expect(updatedState.winner).toBeUndefined();
  });

  it('loses when start-of-turn draw cannot be performed', () => {
    const manager = new GameStateManager('game-1', 'player1', 'player2');
    const gameState = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player2',
    });

    gameState.players.player1.deck = [];

    manager.setState(gameState);
    manager.startTurn('player1');

    const updatedState = manager.getState();
    expect(updatedState.phase).toBe(GamePhase.GAME_OVER);
    expect(updatedState.winner).toBe('player2');
  });

  it('rejects resolve-combat actions outside combat phases', () => {
    const manager = new GameStateManager('game-1', 'player1', 'player2');
    const gameState = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
      currentCombat: undefined,
    });
    manager.setState(gameState);

    const success = manager.processAction({
      id: 'action-1',
      type: ActionType.RESOLVE_COMBAT,
      playerId: 'player1',
      timestamp: Date.now(),
      data: {},
    });

    expect(success).toBe(false);
  });

  it('rejects end-turn actions outside main phase', () => {
    const manager = new GameStateManager('game-1', 'player1', 'player2');
    const gameState = createMockGameState({
      phase: GamePhase.BLOCKER_STEP,
      activePlayerId: 'player1',
    });
    manager.setState(gameState);

    const success = manager.processAction({
      id: 'action-2',
      type: ActionType.END_TURN,
      playerId: 'player1',
      timestamp: Date.now(),
      data: {},
    });

    expect(success).toBe(false);
  });
});

describe('Continuous and gameplay regression fixes', () => {
  const buildLeader = (id: string, cardId: string, owner: string) =>
    createMockCard({
      id,
      cardId,
      owner,
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
    });

  const buildDeckCard = (id: string, owner: string) =>
    createMockCard({
      id,
      cardId: 'FILL',
      owner,
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

  it('removes OPPONENT_TURN continuous keywords when turn passes back', () => {
    const manager = new GameStateManager('game-cont-keyword', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'L1', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({
        id: 'OPP-KEYWORD',
        effects: [{
          id: 'opp-keyword',
          trigger: EffectTrigger.OPPONENT_TURN,
          description: 'During opponent turn gain Blocker.',
          effects: [{
            type: EffectType.GRANT_KEYWORD,
            target: { type: TargetType.SELF },
            keyword: 'Blocker',
          }],
        }],
      }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');
    state.players.player1.field = [
      createMockCard({
        id: 'p1-source',
        cardId: 'OPP-KEYWORD',
        owner: 'player1',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      }),
    ];
    state.players.player1.deck = [buildDeckCard('p1-d1', 'player1'), buildDeckCard('p1-d2', 'player1')];
    state.players.player2.deck = [buildDeckCard('p2-d1', 'player2'), buildDeckCard('p2-d2', 'player2')];

    manager.startTurn('player1');
    manager.endTurn('player1'); // Auto-starts player2
    expect(state.players.player1.field[0].continuousKeywords ?? []).toContain('Blocker');

    manager.endTurn('player2'); // Auto-starts player1
    expect(state.players.player1.field[0].continuousKeywords ?? []).not.toContain('Blocker');
  });

  it('removes OPPONENT_TURN continuous immunities when turn passes back', () => {
    const manager = new GameStateManager('game-cont-immunity', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'L1', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({
        id: 'OPP-IMMUNE',
        effects: [{
          id: 'opp-immune',
          trigger: EffectTrigger.OPPONENT_TURN,
          description: 'During opponent turn cannot be KOed by effects.',
          effects: [{
            type: EffectType.IMMUNE_KO,
            target: { type: TargetType.SELF },
            immuneFrom: 'EFFECTS',
          }],
        }],
      }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');
    state.players.player1.field = [
      createMockCard({
        id: 'p1-source',
        cardId: 'OPP-IMMUNE',
        owner: 'player1',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      }),
    ];
    state.players.player1.deck = [buildDeckCard('p1-d1', 'player1'), buildDeckCard('p1-d2', 'player1')];
    state.players.player2.deck = [buildDeckCard('p2-d1', 'player2'), buildDeckCard('p2-d2', 'player2')];

    manager.startTurn('player1');
    manager.endTurn('player1'); // Auto-starts player2
    expect(state.players.player1.field[0].immunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'KO',
          duration: 'STAGE_CONTINUOUS',
        }),
      ])
    );

    manager.endTurn('player2'); // Auto-starts player1
    expect(state.players.player1.field[0].immunities ?? []).toHaveLength(0);
  });

  it('stacks multiple continuous DEBUFF_COST sources', () => {
    const manager = new GameStateManager('game-cost-stack', 'player1', 'player2');
    const debuffEffect = {
      id: 'debuff',
      trigger: EffectTrigger.YOUR_TURN,
      description: 'Give opponent character -1 cost.',
      effects: [{
        type: EffectType.DEBUFF_COST,
        value: 1,
        target: {
          type: TargetType.OPPONENT_CHARACTER,
          filters: [{ property: 'TYPE', value: ['CHARACTER'] }],
        },
      }],
    };

    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'L1', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'SRC-1', effects: [{ ...debuffEffect, id: 'debuff-1' }] }),
      createMockCardDefinition({ id: 'SRC-2', effects: [{ ...debuffEffect, id: 'debuff-2' }] }),
      createMockCardDefinition({ id: 'TARGET', cost: 5, effects: [] }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');
    state.players.player1.field = [
      createMockCard({ id: 'source-1', cardId: 'SRC-1', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE }),
      createMockCard({ id: 'source-2', cardId: 'SRC-2', owner: 'player1', zone: CardZone.FIELD, state: CardState.ACTIVE }),
    ];
    state.players.player2.field = [
      createMockCard({ id: 'target', cardId: 'TARGET', owner: 'player2', zone: CardZone.FIELD, state: CardState.ACTIVE }),
    ];
    state.players.player1.deck = [buildDeckCard('p1-d1', 'player1')];
    state.players.player2.deck = [buildDeckCard('p2-d1', 'player2')];

    manager.startTurn('player1');
    expect(state.players.player2.field[0].modifiedCost).toBe(3);
  });

  it('keeps YOUR_TURN continuous effects when the non-active player draws', () => {
    const manager = new GameStateManager('game-draw-reapply-turn-owner', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'L1', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({
        id: 'SRC-DEBUFF',
        effects: [{
          id: 'debuff-while-your-turn',
          trigger: EffectTrigger.YOUR_TURN,
          description: "During your turn, give up to 1 of your opponent's Characters -1 cost.",
          effects: [{
            type: EffectType.DEBUFF_COST,
            value: 1,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              filters: [{ property: 'TYPE', value: ['CHARACTER'] }],
            },
          }],
        }],
      }),
      createMockCardDefinition({ id: 'TARGET', cost: 5, effects: [] }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');
    state.players.player1.field = [
      createMockCard({
        id: 'source',
        cardId: 'SRC-DEBUFF',
        owner: 'player1',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      }),
    ];
    state.players.player2.field = [
      createMockCard({
        id: 'target',
        cardId: 'TARGET',
        owner: 'player2',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      }),
    ];
    state.players.player1.deck = [buildDeckCard('p1-d1', 'player1')];
    state.players.player2.deck = [buildDeckCard('p2-d1', 'player2')];

    manager.startTurn('player1');
    expect(state.players.player2.field[0].modifiedCost).toBe(4);

    manager.drawCards('player2', 1);

    expect(state.activePlayerId).toBe('player1');
    expect(state.players.player2.field[0].modifiedCost).toBe(4);
  });

  it('applies continuous GRANT_KEYWORD to leader targets', () => {
    const manager = new GameStateManager('game-leader-keyword', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'L1', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({ id: 'L2', type: 'LEADER', cost: 0, power: 5000, counter: null, effects: [] }),
      createMockCardDefinition({
        id: 'LEADER-GRANTER',
        effects: [{
          id: 'grant-da',
          trigger: EffectTrigger.YOUR_TURN,
          description: 'Your leader gains Double Attack.',
          effects: [{
            type: EffectType.GRANT_KEYWORD,
            keyword: 'Double Attack',
            target: { type: TargetType.YOUR_LEADER },
          }],
        }],
      }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');
    state.players.player1.field = [
      createMockCard({
        id: 'granter',
        cardId: 'LEADER-GRANTER',
        owner: 'player1',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      }),
    ];
    state.players.player1.deck = [buildDeckCard('p1-d1', 'player1')];
    state.players.player2.deck = [buildDeckCard('p2-d1', 'player2')];

    manager.startTurn('player1');
    const leader = state.players.player1.leaderCard!;
    expect(leader.continuousKeywords ?? []).toContain('Double Attack');
    expect(manager.getEffectEngine().hasDoubleAttack(leader)).toBe(true);
  });

  it.each([EffectType.RETURN_TO_HAND, EffectType.SEND_TO_DECK_BOTTOM])(
    'detaches attached DON when applying %s',
    effectType => {
      const manager = new GameStateManager(`game-${effectType}`, 'player1', 'player2');
      const state = manager.getState();
      const target = createMockCard({
        id: 'target',
        cardId: 'TARGET',
        owner: 'player2',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
      });
      const attachedDon = createMockCard({
        id: 'don-1',
        cardId: 'DON',
        owner: 'player2',
        zone: CardZone.DON_FIELD,
        state: CardState.ATTACHED,
        attachedTo: target.id,
      });

      state.players.player2.field = [target];
      state.players.player2.hand = [];
      state.players.player2.deck = [];
      state.players.player2.donField = [attachedDon];

      (manager as any).executeEffectAction(
        { type: effectType },
        { gameState: state, sourceCard: createMockCard({ id: 'source' }), sourcePlayer: state.players.player1 },
        [target.id]
      );

      expect(state.players.player2.donField[0].attachedTo).toBeUndefined();
      expect(state.players.player2.donField[0].state).toBe(CardState.ACTIVE);
      if (effectType === EffectType.RETURN_TO_HAND) {
        expect(state.players.player2.hand.some(card => card.id === target.id)).toBe(true);
      } else {
        expect(state.players.player2.deck.some(card => card.id === target.id)).toBe(true);
      }
    }
  );

  it('rejects declareAttack when CANT_ATTACK restriction is active', () => {
    const manager = new GameStateManager('game-cant-attack', 'player1', 'player2');
    const state = manager.getState();

    state.turn = 4;
    state.phase = GamePhase.MAIN_PHASE;
    state.activePlayerId = 'player1';
    state.players.player1.turnCount = 2;
    state.players.player2.turnCount = 2;

    state.players.player1.leaderCard = buildLeader('p1-leader', 'L1', 'player1');
    state.players.player2.leaderCard = buildLeader('p2-leader', 'L2', 'player2');

    state.players.player1.field = [
      createMockCard({
        id: 'attacker',
        cardId: 'ATTACKER',
        owner: 'player1',
        zone: CardZone.FIELD,
        state: CardState.ACTIVE,
        restrictions: [{
          type: 'CANT_ATTACK',
          until: 'END_OF_TURN',
          turnApplied: state.turn,
        }],
      }),
    ];
    state.players.player2.field = [
      createMockCard({
        id: 'defender',
        cardId: 'DEFENDER',
        owner: 'player2',
        zone: CardZone.FIELD,
        state: CardState.RESTED,
      }),
    ];

    expect(manager.declareAttack('attacker', 'defender', 'character')).toBe(false);
  });

  it('accepts legacy selectedIds payload for RESOLVE_FIELD_SELECT', () => {
    const manager = new GameStateManager('game-field-payload', 'player1', 'player2');
    const state = manager.getState();

    state.phase = GamePhase.FIELD_SELECT_STEP;
    state.pendingFieldSelectEffect = {
      id: 'field-select-1',
      sourceCardId: 'source',
      playerId: 'player1',
      description: 'Select up to 1 card',
      selectAction: 'TRASH',
      validTargetIds: [],
      minSelections: 0,
      maxSelections: 1,
      canSkip: true,
    };

    const success = manager.processAction({
      id: 'a-field-1',
      type: ActionType.RESOLVE_FIELD_SELECT,
      playerId: 'player1',
      timestamp: Date.now(),
      data: { selectedIds: [] },
    } as any);

    expect(success).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
  });

  it('continues pending effect after hand cost even without sourceCardInstanceId', () => {
    const manager = new GameStateManager('game-hand-cost-continue', 'player1', 'player2');
    const state = manager.getState();

    const source = createMockCard({
      id: 'source',
      cardId: 'SOURCE-CARD',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const handCard = createMockCard({
      id: 'discard-me',
      cardId: 'HAND-CARD',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });

    state.phase = GamePhase.HAND_SELECT_STEP;
    state.players.player1.field = [source];
    state.players.player1.hand = [handCard];
    state.pendingHandSelectEffect = {
      id: 'pending-hand-select',
      sourceCardId: source.id,
      playerId: 'player1',
      description: 'Trash 1 card',
      selectAction: 'TRASH',
      minSelections: 1,
      maxSelections: 1,
      canSkip: false,
      isCostPayment: true,
      pendingEffectId: 'pending-effect-1',
      // Intentionally omitted to validate fallback logic:
      // sourceCardInstanceId
    };

    (manager.getEffectEngine() as any).addPendingEffect({
      id: 'pending-effect-1',
      sourceCardId: source.id,
      playerId: 'player1',
      trigger: EffectTrigger.ON_PLAY,
      requiresChoice: true,
      priority: 0,
      effect: {
        id: 'effect-1',
        trigger: EffectTrigger.ON_PLAY,
        description: 'Choose a target',
        effects: [{
          type: EffectType.KO_CHARACTER,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        }],
      },
    });

    const success = manager.resolveHandSelect('player1', [handCard.id]);

    expect(success).toBe(true);
    expect(state.phase).toBe(GamePhase.PLAY_EFFECT_STEP);
    expect(state.pendingPlayEffects?.length).toBe(1);
  });

  it('detaches DON when TRASH is selected in FIELD_SELECT_STEP', () => {
    const manager = new GameStateManager('game-field-detach', 'player1', 'player2');
    const state = manager.getState();

    const target = createMockCard({
      id: 'field-target',
      cardId: 'FIELD-TARGET',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const don = createMockCard({
      id: 'attached-don',
      cardId: 'DON',
      owner: 'player1',
      zone: CardZone.DON_FIELD,
      state: CardState.ATTACHED,
      attachedTo: target.id,
    });

    state.phase = GamePhase.FIELD_SELECT_STEP;
    state.players.player1.field = [target];
    state.players.player1.donField = [don];
    state.pendingFieldSelectEffect = {
      id: 'pending-field-select',
      sourceCardId: 'source',
      playerId: 'player1',
      description: 'Trash 1 character',
      selectAction: 'TRASH',
      validTargetIds: [target.id],
      minSelections: 1,
      maxSelections: 1,
      canSkip: false,
    };

    const success = manager.resolveFieldSelect('player1', [target.id]);

    expect(success).toBe(true);
    expect(state.players.player1.donField[0].attachedTo).toBeUndefined();
    expect(state.players.player1.donField[0].state).toBe(CardState.ACTIVE);
  });

  it('allows skipping optional cost alternatives from CHOICE_STEP', () => {
    const manager = new GameStateManager('game-choice-skip', 'player1', 'player2');
    const state = manager.getState();

    state.phase = GamePhase.CHOICE_STEP;
    state.pendingChoiceEffect = {
      id: 'choice-1',
      sourceCardId: 'source',
      playerId: 'player1',
      description: 'Choose a cost',
      choiceType: 'COST_ALTERNATIVE',
      options: [
        { id: 'cost-0', label: 'Trash 1 character', enabled: true },
        { id: 'cost-skip', label: 'Do not pay this cost (skip effect)', enabled: true },
      ],
      minSelections: 1,
      maxSelections: 1,
      pendingEffectId: 'pending-effect-to-remove',
    };

    (manager.getEffectEngine() as any).addPendingEffect({
      id: 'pending-effect-to-remove',
      sourceCardId: 'source',
      playerId: 'player1',
      trigger: EffectTrigger.ON_PLAY,
      requiresChoice: true,
      priority: 0,
      effect: {
        id: 'effect-to-remove',
        trigger: EffectTrigger.ON_PLAY,
        description: 'Optional effect',
        effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
      },
    });

    const success = manager.resolveChoice('player1', 'cost-skip');

    expect(success).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.pendingChoiceEffect).toBeUndefined();
    expect(manager.getEffectEngine().getPendingEffects()).toHaveLength(0);
  });
});

describe('Activate-main cost flow regressions', () => {
  it('keeps alternative-cost pending IDs aligned and continues after RETURN_DON payment', () => {
    const manager = new GameStateManager('game-alt-return-don', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'ALT-ACTIVATE',
        effects: [{
          id: 'alt-activate',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Choose one cost and draw 1.',
          costs: [{
            type: 'TRASH_FROM_HAND',
            alternatives: [
              { type: 'RETURN_DON', count: 1 },
              { type: 'TRASH_FROM_HAND', count: 1 },
            ],
          }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'alt-source',
      cardId: 'ALT-ACTIVATE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const handCard = createMockCard({
      id: 'hand-card',
      owner: 'player1',
      zone: CardZone.HAND,
    });
    const don = createMockCard({
      id: 'don-1',
      cardId: 'DON',
      owner: 'player1',
      zone: CardZone.DON_FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source];
    state.players.player1.hand = [handCard];
    state.players.player1.donField = [don];

    manager.setState(state);

    expect(manager.activateAbility('player1', source.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.CHOICE_STEP);
    expect(state.pendingChoiceEffect?.pendingEffectId).toBeDefined();

    const pendingId = state.pendingChoiceEffect!.pendingEffectId!;
    expect(manager.getEffectEngine().getPendingEffects().some(effect => effect.id === pendingId)).toBe(true);

    expect(manager.resolveChoice('player1', 'cost-0')).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.pendingChoiceEffect).toBeUndefined();
    expect(state.players.player1.donField).toHaveLength(0);
    expect(state.players.player1.donDeck).toBe(11);
    expect(state.players.player1.hand).toHaveLength(2);
    expect(manager.getEffectEngine().getPendingEffects()).toHaveLength(0);
  });

  it('continues activate-main effects after paying TRASH_CHARACTER costs', () => {
    const manager = new GameStateManager('game-trash-character-cost', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'TRASH-COST-ACTIVATE',
        effects: [{
          id: 'trash-activate',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Trash 1 of your characters: Draw 1.',
          costs: [{ type: 'TRASH_CHARACTER', count: 1 }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'trash-source',
      cardId: 'TRASH-COST-ACTIVATE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const fodder = createMockCard({
      id: 'trash-fodder',
      cardId: 'FODDER',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source, fodder];
    state.players.player1.hand = [];
    manager.setState(state);

    expect(manager.activateAbility('player1', source.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.FIELD_SELECT_STEP);
    expect(state.pendingFieldSelectEffect?.pendingEffectId).toBeDefined();

    const pendingId = state.pendingFieldSelectEffect!.pendingEffectId!;
    expect(manager.getEffectEngine().getPendingEffects().some(effect => effect.id === pendingId)).toBe(true);

    expect(manager.resolveFieldSelect('player1', [fodder.id])).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.players.player1.trash.some(card => card.id === fodder.id)).toBe(true);
    expect(state.players.player1.hand).toHaveLength(1);
    expect(manager.getEffectEngine().getPendingEffects()).toHaveLength(0);
  });

  it('requires REST_CHARACTER cost payment before resolving activate-main effect', () => {
    const manager = new GameStateManager('game-rest-character-cost', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'REST-COST-ACTIVATE',
        effects: [{
          id: 'rest-activate',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Rest 1 of your characters: Draw 1.',
          costs: [{ type: 'REST_CHARACTER', count: 1 }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'rest-source',
      cardId: 'REST-COST-ACTIVATE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const target = createMockCard({
      id: 'rest-target',
      cardId: 'REST-TARGET',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source, target];
    state.players.player1.hand = [];
    manager.setState(state);

    expect(manager.activateAbility('player1', source.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.FIELD_SELECT_STEP);
    expect(target.state).toBe(CardState.ACTIVE);
    expect(state.players.player1.hand).toHaveLength(0);

    expect(manager.resolveFieldSelect('player1', [target.id])).toBe(true);
    expect(target.state).toBe(CardState.RESTED);
    expect(state.players.player1.hand).toHaveLength(1);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
  });

  it('blocks activate-main when RETURN_DON costs cannot be paid', () => {
    const manager = new GameStateManager('game-cannot-return-don', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'RETURN-DON-ACTIVATE',
        effects: [{
          id: 'return-don-activate',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Return 1 DON!!: Draw 1.',
          costs: [{ type: 'RETURN_DON', count: 1 }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'return-don-source',
      cardId: 'RETURN-DON-ACTIVATE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source];
    state.players.player1.donField = [];
    manager.setState(state);

    expect(manager.canActivateAbility('player1', source.id)).toEqual({
      canActivate: false,
      reason: 'Cannot pay Return 1 DON!!',
    });
    expect(manager.activateAbility('player1', source.id)).toBe(false);
  });

  it('does not treat attached DON as payable for RETURN_DON costs', () => {
    const manager = new GameStateManager('game-return-don-attached-only', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'RETURN-DON-ACTIVATE-ATTACHED',
        effects: [{
          id: 'return-don-activate-attached',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Return 1 DON!!: Draw 1.',
          costs: [{ type: 'RETURN_DON', count: 1 }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'return-don-source-attached',
      cardId: 'RETURN-DON-ACTIVATE-ATTACHED',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const host = createMockCard({
      id: 'host-char',
      cardId: 'HOST',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const attachedDon = createMockCard({
      id: 'attached-don-1',
      cardId: 'DON',
      owner: 'player1',
      zone: CardZone.DON_FIELD,
      state: CardState.ATTACHED,
      attachedTo: host.id,
    });

    state.players.player1.field = [source, host];
    state.players.player1.donField = [attachedDon];
    manager.setState(state);

    expect(manager.canActivateAbility('player1', source.id)).toEqual({
      canActivate: false,
      reason: 'Cannot pay Return 1 DON!!',
    });
    expect(manager.activateAbility('player1', source.id)).toBe(false);
  });

  it('pays REST_SELF costs before resolving activate-main effects', () => {
    const manager = new GameStateManager('game-rest-self-cost', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'REST-SELF-ACTIVATE',
        effects: [{
          id: 'rest-self-activate',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          description: 'Rest this Character: Draw 1.',
          costs: [{ type: 'REST_SELF' }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
      createMockCardDefinition({ id: 'FILL', effects: [] }),
    ]);

    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const source = createMockCard({
      id: 'rest-self-source',
      cardId: 'REST-SELF-ACTIVATE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source];
    state.players.player1.deck = [createMockCard({
      id: 'draw-1',
      cardId: 'FILL',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    })];
    state.players.player1.hand = [];
    manager.setState(state);

    expect(manager.activateAbility('player1', source.id)).toBe(true);
    expect(source.state).toBe(CardState.RESTED);
    expect(state.players.player1.hand).toHaveLength(1);
  });
});

describe('Gameplay flow audit fixes', () => {
  it('keeps TRIGGER_STEP after combat when life trigger is revealed', () => {
    const manager = new GameStateManager('game-trigger-phase', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
      createMockCardDefinition({
        id: 'LIFE-TRIGGER',
        type: 'EVENT',
        effects: [{
          id: 'life-trigger-effect',
          trigger: EffectTrigger.TRIGGER,
          description: 'Trigger: Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.COUNTER_STEP;
    state.turn = 2;
    state.activePlayerId = 'player1';

    const attacker = createMockCard({
      id: 'attacker',
      cardId: 'ATTACKER',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 7000,
    });
    const p1Leader = createMockCard({
      id: 'p1-leader',
      cardId: 'L1',
      owner: 'player1',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    const p2Leader = createMockCard({
      id: 'p2-leader',
      cardId: 'L2',
      owner: 'player2',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    const lifeTrigger = createMockCard({
      id: 'life-trigger-card',
      cardId: 'LIFE-TRIGGER',
      owner: 'player2',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.lifeCards = [lifeTrigger];
    state.players.player2.life = 1;
    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 7000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };

    manager.resolveCombat();

    expect(state.currentCombat).toBeUndefined();
    expect(state.phase).toBe(GamePhase.TRIGGER_STEP);
  });

  it('resolves non-power event counter effects immediately after use', () => {
    const manager = new GameStateManager('game-counter-immediate', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'ATTACKER', effects: [] }),
      createMockCardDefinition({
        id: 'COUNTER-DRAW-EVENT',
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

    const attacker = createMockCard({
      id: 'attacker',
      cardId: 'ATTACKER',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 5000,
    });
    const p1Leader = createMockCard({
      id: 'p1-leader',
      cardId: 'L1',
      owner: 'player1',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    const p2Leader = createMockCard({
      id: 'p2-leader',
      cardId: 'L2',
      owner: 'player2',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    const counterEvent = createMockCard({
      id: 'counter-event',
      cardId: 'COUNTER-DRAW-EVENT',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const drawCard = createMockCard({
      id: 'drawn-card',
      cardId: 'DRAWN',
      owner: 'player2',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

    state.players.player1.leaderCard = p1Leader;
    state.players.player2.leaderCard = p2Leader;
    state.players.player1.field = [attacker];
    state.players.player2.hand = [counterEvent];
    state.players.player2.deck = [drawCard];
    state.currentCombat = {
      attackerId: attacker.id,
      targetId: p2Leader.id,
      targetType: 'leader',
      attackPower: 1000,
      counterPower: 0,
      effectBuffPower: 0,
      isBlocked: false,
    };

    expect(manager.useCounter('player2', [counterEvent.id])).toBe(true);
    expect(state.players.player2.trash.some(card => card.id === counterEvent.id)).toBe(true);
    expect(state.players.player2.hand.some(card => card.id === drawCard.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.currentCombat).toBeUndefined();
  });

  it('resolves event [Main] effects through EffectEngine for KO_POWER_OR_LESS', () => {
    const manager = new GameStateManager('game-event-main-engine', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'KO-EVENT',
        type: 'EVENT',
        cost: 0,
        counter: null,
        effects: [{
          id: 'ko-main',
          trigger: EffectTrigger.MAIN,
          description: 'K.O. up to 1 of your opponent\'s Characters with 4000 power or less.',
          effects: [{
            type: EffectType.KO_POWER_OR_LESS,
            value: 4000,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [{
                property: 'POWER',
                operator: 'OR_LESS',
                value: 4000,
              }],
            },
          }],
        }],
      }),
      createMockCardDefinition({
        id: 'TARGET-CHAR',
        power: 3000,
        cost: 2,
        effects: [],
      }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.MAIN_PHASE;
    state.turn = 2;
    state.activePlayerId = 'player1';
    state.players.player1.leaderCard = createMockCard({
      id: 'p1-leader',
      cardId: 'L1',
      owner: 'player1',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    state.players.player2.leaderCard = createMockCard({
      id: 'p2-leader',
      cardId: 'L2',
      owner: 'player2',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });

    const eventCard = createMockCard({
      id: 'ko-event-card',
      cardId: 'KO-EVENT',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const target = createMockCard({
      id: 'ko-target',
      cardId: 'TARGET-CHAR',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 3000,
    });

    state.players.player1.hand = [eventCard];
    state.players.player2.field = [target];

    expect(manager.playCard('player1', eventCard.id, CardZone.EVENT)).toBe(true);
    expect(state.phase).toBe(GamePhase.EVENT_EFFECT_STEP);
    expect(state.pendingEventEffects?.[0].validTargets).toContain(target.id);

    const pendingEffectId = state.pendingEventEffects?.[0]?.id || '';
    expect(manager.resolveEventEffect('player1', pendingEffectId, [target.id])).toBe(true);
    expect(state.players.player2.field.some(card => card.id === target.id)).toBe(false);
    expect(state.players.player2.trash.some(card => card.id === target.id)).toBe(true);
  });

  it('supports TRASH_CARD additional costs and continues event resolution flow', () => {
    const manager = new GameStateManager('game-event-trash-cost', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'COST-EVENT',
        type: 'EVENT',
        cost: 0,
        counter: null,
        effects: [{
          id: 'cost-main',
          trigger: EffectTrigger.MAIN,
          description: 'You may trash 1 card from your hand: Draw 1 card.',
          costs: [{
            type: 'TRASH_FROM_HAND',
            count: 1,
            optional: true,
          }],
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
      createMockCardDefinition({ id: 'FODDER', effects: [] }),
      createMockCardDefinition({ id: 'DRAWN', effects: [] }),
    ]);

    const state = manager.getState();
    state.phase = GamePhase.MAIN_PHASE;
    state.turn = 2;
    state.activePlayerId = 'player1';
    state.players.player1.leaderCard = createMockCard({
      id: 'p1-leader',
      cardId: 'L1',
      owner: 'player1',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });
    state.players.player2.leaderCard = createMockCard({
      id: 'p2-leader',
      cardId: 'L2',
      owner: 'player2',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      power: 5000,
    });

    const eventCard = createMockCard({
      id: 'cost-event-card',
      cardId: 'COST-EVENT',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const fodder = createMockCard({
      id: 'fodder-card',
      cardId: 'FODDER',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const drawCard = createMockCard({
      id: 'draw-after-cost',
      cardId: 'DRAWN',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

    state.players.player1.hand = [eventCard, fodder];
    state.players.player1.deck = [drawCard];

    expect(manager.playCard('player1', eventCard.id, CardZone.EVENT)).toBe(true);
    expect(state.phase).toBe(GamePhase.ADDITIONAL_COST_STEP);
    expect(state.pendingAdditionalCost?.costType).toBe('TRASH_CARD');

    const costId = state.pendingAdditionalCost?.id || '';
    expect(manager.payAdditionalCost('player1', costId)).toBe(true);
    expect(state.phase).toBe(GamePhase.HAND_SELECT_STEP);

    expect(manager.resolveHandSelect('player1', [fodder.id])).toBe(true);
    expect(state.phase).toBe(GamePhase.EVENT_EFFECT_STEP);

    const pendingEffectId = state.pendingEventEffects?.[0]?.id || '';
    expect(manager.resolveEventEffect('player1', pendingEffectId, [])).toBe(true);
    expect(state.players.player1.hand.some(card => card.id === drawCard.id)).toBe(true);
    expect(state.players.player1.trash.some(card => card.id === fodder.id)).toBe(true);
    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
  });

  it('detects static card-definition keywords when runtime keywords are absent', () => {
    const manager = new GameStateManager('game-static-keywords', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'STATIC-DOUBLE-ATTACK',
        keywords: ['Double Attack'],
        effects: [],
      }),
    ]);

    const state = manager.getState();
    const attacker = createMockCard({
      id: 'static-keyword-attacker',
      cardId: 'STATIC-DOUBLE-ATTACK',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      keywords: [],
    });
    state.players.player1.field = [attacker];

    expect(manager.getEffectEngine().hasDoubleAttack(attacker, state)).toBe(true);
  });
});
