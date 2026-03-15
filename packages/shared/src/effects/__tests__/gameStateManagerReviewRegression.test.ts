import { beforeEach, describe, expect, it } from 'vitest';
import { GameStateManager } from '../../game/GameStateManager';
import { EffectDuration, EffectTrigger, EffectType, TargetType } from '../types';
import { ActionType, CardState, CardZone, GamePhase } from '../../types/game';
import {
  createMockCard,
  createMockCardDefinition,
  createMockGameState,
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

  it('lets the defending player legally resolve OPPONENT_ATTACK effects before combat continues', () => {
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

    const pendingEffect = state.pendingAttackEffects?.find(
      effect => effect.sourceCardId === reactiveDefender.id
    );

    if (pendingEffect) {
      expect(state.phase).toBe(GamePhase.ATTACK_EFFECT_STEP);
      expect(pendingEffect).toEqual(expect.objectContaining({
        playerId: 'player2',
        validTargets: [attacker.id],
      }));

      expect(manager.processAction({
        id: 'attacker-cannot-resolve-defender-effect',
        type: ActionType.RESOLVE_ATTACK_EFFECT,
        playerId: 'player1',
        timestamp: Date.now(),
        data: { effectId: pendingEffect.id, selectedTargets: [attacker.id] },
      })).toBe(false);

      expect(manager.processAction({
        id: 'defender-resolves-opponent-attack-effect',
        type: ActionType.RESOLVE_ATTACK_EFFECT,
        playerId: 'player2',
        timestamp: Date.now(),
        data: { effectId: pendingEffect.id, selectedTargets: [attacker.id] },
      })).toBe(true);
    }

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

  it('uses modified cost for KO_COST_OR_LESS effects', () => {
    const manager = new GameStateManager('game-ko-cost-or-less-modified-cost', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'BLACK-REMOVAL', type: 'CHARACTER', cost: 0, power: 4000, effects: [] }),
      createMockCardDefinition({ id: 'REDUCED-TARGET', type: 'CHARACTER', cost: 5, power: 5000, effects: [] }),
    ]);

    const state = manager.getState();
    const removal = createMockCard({
      id: 'black-removal',
      cardId: 'BLACK-REMOVAL',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      cost: 0,
    });
    const target = createMockCard({
      id: 'reduced-target',
      cardId: 'REDUCED-TARGET',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      cost: 5,
      modifiedCost: 3,
      power: 5000,
      basePower: 5000,
    });

    manager.getEffectEngine().addPendingEffect({
      id: 'pending-ko-effect',
      sourceCardId: removal.id,
      playerId: 'player1',
      trigger: EffectTrigger.ON_PLAY,
      requiresChoice: true,
      priority: 1,
      effect: {
        id: 'ko-3-cost-or-less',
        trigger: EffectTrigger.ON_PLAY,
        description: 'K.O. up to 1 of your opponent\'s 3-cost-or-less characters.',
        effects: [{
          type: EffectType.KO_COST_OR_LESS,
          value: 3,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        }],
      },
    });

    state.players.player1.field = [removal];
    state.players.player2.field = [target];
    expect(manager.getValidTargetsForEffect('pending-ko-effect')).toContain(target.id);

    manager.resolveEffect('pending-ko-effect', [target.id]);
    expect(state.players.player2.field).toHaveLength(0);
    expect(state.players.player2.trash.map(card => card.id)).toContain(target.id);
  });

  it('keeps mandatory non-choice ON_PLAY and ON_ATTACK effects non-skippable', () => {
    const manager = new GameStateManager('game-mandatory-auto-effects', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({
        id: 'DRAWER',
        type: 'CHARACTER',
        cost: 0,
        power: 1000,
        effects: [{
          id: 'draw-one',
          trigger: EffectTrigger.ON_PLAY,
          description: 'Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
      createMockCardDefinition({
        id: 'ATTACK-BUFFER',
        type: 'CHARACTER',
        cost: 1,
        power: 5000,
        effects: [{
          id: 'self-buff-on-attack',
          trigger: EffectTrigger.ON_ATTACK,
          description: 'This card gets +1000 power during this battle.',
          effects: [{
            type: EffectType.BUFF_SELF,
            value: 1000,
            duration: EffectDuration.UNTIL_END_OF_BATTLE,
          }],
        }],
      }),
      createMockCardDefinition({ id: 'BATTLE-TARGET', type: 'CHARACTER', cost: 1, power: 3000, effects: [] }),
      createMockCardDefinition({ id: 'FILLER', type: 'CHARACTER', cost: 1, power: 1000, effects: [] }),
    ]);

    const state = manager.getState();
    const drawer = createMockCard({
      id: 'drawer',
      cardId: 'DRAWER',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
      cost: 0,
    });
    const drawnCard = createMockCard({
      id: 'drawn-card',
      cardId: 'FILLER',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const attacker = createMockCard({
      id: 'attack-buffer',
      cardId: 'ATTACK-BUFFER',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 5000,
      basePower: 5000,
    });
    const attackTarget = createMockCard({
      id: 'battle-target',
      cardId: 'BATTLE-TARGET',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 3000,
      basePower: 3000,
    });

    state.players.player1.hand = [drawer];
    state.players.player1.deck = [drawnCard];
    state.players.player1.donDeck = 0;
    state.players.player1.field = [attacker];
    state.players.player2.field = [attackTarget];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.playCard('player1', drawer.id)).toBe(true);

    const pendingPlayEffect = state.pendingPlayEffects?.find(
      effect => effect.sourceCardId === drawer.id
    );

    if (pendingPlayEffect) {
      expect(state.phase).toBe(GamePhase.PLAY_EFFECT_STEP);
      expect(pendingPlayEffect.isOptional).toBe(false);
      expect(manager.processAction({
        id: 'cannot-skip-mandatory-play-effect',
        type: ActionType.SKIP_PLAY_EFFECT,
        playerId: 'player1',
        timestamp: Date.now(),
        data: { effectId: pendingPlayEffect.id },
      })).toBe(false);
      expect(manager.processAction({
        id: 'resolve-mandatory-play-effect',
        type: ActionType.RESOLVE_PLAY_EFFECT,
        playerId: 'player1',
        timestamp: Date.now(),
        data: { effectId: pendingPlayEffect.id, selectedTargets: [] },
      })).toBe(true);
    }

    expect(state.phase).toBe(GamePhase.MAIN_PHASE);
    expect(state.pendingPlayEffects).toBeUndefined();
    expect(state.players.player1.hand.map(card => card.id)).toContain(drawnCard.id);

    expect(manager.declareAttack(attacker.id, attackTarget.id, 'character')).toBe(true);

    const pendingAttackEffect = state.pendingAttackEffects?.find(
      effect => effect.sourceCardId === attacker.id
    );

    if (pendingAttackEffect) {
      expect(state.phase).toBe(GamePhase.ATTACK_EFFECT_STEP);
      expect(pendingAttackEffect.isOptional).toBe(false);
      expect(manager.processAction({
        id: 'cannot-skip-mandatory-attack-effect',
        type: ActionType.SKIP_ATTACK_EFFECT,
        playerId: 'player1',
        timestamp: Date.now(),
        data: { effectId: pendingAttackEffect.id },
      })).toBe(false);
      expect(manager.processAction({
        id: 'resolve-mandatory-attack-effect',
        type: ActionType.RESOLVE_ATTACK_EFFECT,
        playerId: 'player1',
        timestamp: Date.now(),
        data: { effectId: pendingAttackEffect.id, selectedTargets: [] },
      })).toBe(true);
    }

    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(attacker.powerBuffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 1000,
          duration: 'THIS_BATTLE',
        }),
      ])
    );
    expect(state.pendingAttackEffects).toBeUndefined();
  });

  it('allows blockers to redirect attacks targeting characters', () => {
    const manager = new GameStateManager('game-blocker-vs-character-attack', 'player1', 'player2');
    const state = manager.getState();

    const attacker = createMockCard({
      id: 'attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const attackTarget = createMockCard({
      id: 'attack-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 3000,
      basePower: 3000,
    });
    const blocker = createMockCard({
      id: 'blocker',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 2000,
      basePower: 2000,
      keywords: ['Blocker'],
    });

    state.players.player1.field = [attacker];
    state.players.player2.field = [attackTarget, blocker];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, attackTarget.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(manager.declareBlocker('player2', blocker.id)).toBe(true);
    expect(state.currentCombat?.targetId).toBe(blocker.id);
    expect(state.currentCombat?.targetType).toBe('character');
    expect(state.currentCombat?.isBlocked).toBe(true);
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);
  });

  it('keeps a counter window for direct and unblockable character attacks', () => {
    const manager = new GameStateManager('game-character-counter-window', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'COUNTER-2000', type: 'CHARACTER', cost: 1, power: 2000, counter: 2000, effects: [] }),
    ]);

    const state = manager.getState();
    const attacker = createMockCard({
      id: 'attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const unblockableAttacker = createMockCard({
      id: 'unblockable-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
      keywords: ['Unblockable'],
    });
    const defendedTarget = createMockCard({
      id: 'defended-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 5000,
      basePower: 5000,
    });
    const secondTarget = createMockCard({
      id: 'second-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 5000,
      basePower: 5000,
    });
    const counterA = createMockCard({
      id: 'counter-a',
      cardId: 'COUNTER-2000',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const counterB = createMockCard({
      id: 'counter-b',
      cardId: 'COUNTER-2000',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [attacker, unblockableAttacker];
    state.players.player2.field = [defendedTarget, secondTarget];
    state.players.player2.hand = [counterA, counterB];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.declareAttack(attacker.id, defendedTarget.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.BLOCKER_STEP);
    expect(manager.passBlocker('player2')).toBe(true);
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);
    expect(manager.useCounter('player2', [counterA.id])).toBe(true);
    expect(state.players.player2.field.map(card => card.id)).toContain(defendedTarget.id);
    expect(state.players.player2.trash.map(card => card.id)).not.toContain(defendedTarget.id);

    state.phase = GamePhase.MAIN_PHASE;
    state.currentCombat = undefined;
    defendedTarget.state = CardState.RESTED;
    secondTarget.state = CardState.RESTED;
    counterB.zone = CardZone.HAND;
    state.players.player2.hand = [counterB];

    expect(manager.declareAttack(unblockableAttacker.id, secondTarget.id, 'character')).toBe(true);
    expect(state.phase).toBe(GamePhase.COUNTER_STEP);
    expect(manager.useCounter('player2', [counterB.id])).toBe(true);
    // useCounter automatically resolves combat, so passCounter is not needed
    expect(state.players.player2.field.map(card => card.id)).toContain(secondTarget.id);
    expect(state.players.player2.trash.map(card => card.id)).not.toContain(secondTarget.id);
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

  it('sends banished life cards to trash instead of recycling them into the deck', () => {
    const manager = new GameStateManager('game-banish-life-damage', 'player1', 'player2');
    const state = createMockGameState({
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });

    const attacker = createMockCard({
      id: 'banish-life-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 7000,
      basePower: 7000,
      keywords: ['Banish'],
    });
    const topLife = createMockCard({
      id: 'top-life',
      owner: 'player2',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });
    const bottomLife = createMockCard({
      id: 'bottom-life',
      owner: 'player2',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });

    state.players.player1.field = [attacker];
    state.players.player2.lifeCards = [bottomLife, topLife];
    state.players.player2.hand = [];
    state.players.player2.trash = [];
    state.players.player2.deck = [];
    manager.setState(state);

    expect(manager.declareAttack(attacker.id, state.players.player2.leaderCard!.id, 'leader')).toBe(true);
    expect(manager.passBlocker('player2')).toBe(true);
    expect(manager.passCounter('player2')).toBe(true);

    expect(state.players.player2.lifeCards.map(card => card.id)).toEqual([bottomLife.id]);
    expect(state.players.player2.trash.map(card => card.id)).toContain(topLife.id);
    expect(state.players.player2.hand.map(card => card.id)).not.toContain(topLife.id);
    expect(state.players.player2.deck.map(card => card.id)).not.toContain(topLife.id);
  });

  it('only blocks character plays that match a cost-qualified play restriction', () => {
    const manager = new GameStateManager('game-cost-qualified-character-restriction', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'CHEAP-CHAR', type: 'CHARACTER', cost: 4, power: 2000, effects: [] }),
      createMockCardDefinition({ id: 'EXPENSIVE-CHAR', type: 'CHARACTER', cost: 6, power: 6000, effects: [] }),
    ]);

    const state = manager.getState();
    const cheapCharacter = createMockCard({
      id: 'cheap-character',
      cardId: 'CHEAP-CHAR',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
      modifiedCost: 0,
    });
    const expensiveCharacter = createMockCard({
      id: 'expensive-character',
      cardId: 'EXPENSIVE-CHAR',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
      modifiedCost: 0,
    });

    state.turn = 1;
    state.phase = GamePhase.MAIN_PHASE;
    state.activePlayerId = 'player1';
    state.players.player1.hand = [cheapCharacter, expensiveCharacter];
    state.players.player1.field = [];
    state.players.player1.donField = [];
    state.players.player1.restrictions = [{
      keyword: 'CantPlayCharacters',
      until: 'END_OF_TURN',
      turnApplied: 1,
      filters: [{
        property: 'BASE_COST',
        operator: 'OR_MORE',
        value: 5,
      }],
    }];

    expect(manager.playCard('player1', cheapCharacter.id)).toBe(true);
    expect(state.players.player1.field.map(card => card.id)).toContain(cheapCharacter.id);
    expect(state.players.player1.hand.map(card => card.id)).toContain(expensiveCharacter.id);

    state.phase = GamePhase.MAIN_PHASE;
    state.activePlayerId = 'player1';
    expect(manager.playCard('player1', expensiveCharacter.id)).toBe(false);
    expect(state.players.player1.field.map(card => card.id)).not.toContain(expensiveCharacter.id);
    expect(state.players.player1.hand.map(card => card.id)).toContain(expensiveCharacter.id);
  });

  it('keeps NO_ON_PLAYS_NEXT_TURN active through the opponent turn, then expires it', () => {
    const manager = new GameStateManager('game-no-on-plays-next-turn', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'SOURCE', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({
        id: 'DRAWER',
        type: 'CHARACTER',
        cost: 0,
        power: 1000,
        effects: [{
          id: 'draw-on-play',
          trigger: EffectTrigger.ON_PLAY,
          description: 'Draw 1 card.',
          effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
        }],
      }),
      createMockCardDefinition({ id: 'TURN-DRAW', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({ id: 'ON-PLAY-DRAW', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
    ]);

    const state = createMockGameState({
      turn: 1,
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });
    const source = createMockCard({
      id: 'no-on-plays-source',
      cardId: 'SOURCE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const drawer = createMockCard({
      id: 'drawer-next-turn',
      cardId: 'DRAWER',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const turnDraw = createMockCard({
      id: 'turn-draw',
      cardId: 'TURN-DRAW',
      owner: 'player2',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const onPlayDraw = createMockCard({
      id: 'on-play-draw',
      cardId: 'ON-PLAY-DRAW',
      owner: 'player2',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const attackTarget = createMockCard({
      id: 'restriction-persistence-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 1000,
      basePower: 1000,
    });

    state.players.player1.field = [source];
    state.players.player2.field = [attackTarget];
    state.players.player2.hand = [drawer];
    state.players.player2.deck = [turnDraw, onPlayDraw];
    state.players.player2.donField = [];
    manager.setState(state);

    manager.getEffectEngine().resolveEffect(
      {
        id: 'apply-no-on-plays-next-turn',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'Your opponent cannot activate [On Play] effects next turn.',
        effects: [{ type: EffectType.NO_ON_PLAYS_NEXT_TURN }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player2.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'NoOnPlays',
          until: 'END_OF_OPPONENT_TURN',
          turnApplied: 1,
        }),
      ])
    );
    expect(state.players.player2.leaderCard?.temporaryKeywords ?? []).toContain('NoOnPlays');

    expect(manager.declareAttack(source.id, attackTarget.id, 'character')).toBe(true);
    expect(manager.passBlocker('player2')).toBe(true);
    expect(manager.passCounter('player2')).toBe(true);
    expect(state.players.player2.leaderCard?.temporaryKeywords ?? []).toContain('NoOnPlays');

    manager.endTurn('player1');

    expect(state.turn).toBe(2);
    expect(state.activePlayerId).toBe('player2');
    expect(manager.playCard('player2', drawer.id)).toBe(true);
    expect(state.players.player2.hand.map(card => card.id)).toContain(turnDraw.id);
    expect(state.players.player2.hand.map(card => card.id)).not.toContain(onPlayDraw.id);
    expect(state.players.player2.deck.map(card => card.id)).toContain(onPlayDraw.id);
    expect(state.pendingPlayEffects).toBeUndefined();

    manager.endTurn('player2');

    expect(state.turn).toBe(3);
    expect(state.activePlayerId).toBe('player1');
    expect(state.players.player2.restrictions ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: 'NoOnPlays' }),
      ])
    );
    expect(state.players.player2.leaderCard?.temporaryKeywords ?? []).not.toContain('NoOnPlays');
  });

  it('lets DisableEffectDraws expire after the turn even if the leader still has the legacy keyword', () => {
    const manager = new GameStateManager('game-disable-effect-draws-expiry', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'SOURCE', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({ id: 'DRAWN-A', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({ id: 'DRAWN-B', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
    ]);

    const state = createMockGameState({
      turn: 1,
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });
    const source = createMockCard({
      id: 'disable-draw-source',
      cardId: 'SOURCE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const drawA = createMockCard({
      id: 'draw-a',
      cardId: 'DRAWN-A',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const drawB = createMockCard({
      id: 'draw-b',
      cardId: 'DRAWN-B',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [source];
    state.players.player1.hand = [];
    state.players.player1.deck = [drawA, drawB];
    manager.setState(state);

    manager.getEffectEngine().resolveEffect(
      {
        id: 'apply-disable-effect-draws',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'You cannot draw cards using your own effects during this turn.',
        effects: [{ type: EffectType.DISABLE_EFFECT_DRAWS }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.leaderCard?.temporaryKeywords ?? []).toContain('DisableEffectDraws');

    manager.getEffectEngine().resolveEffect(
      {
        id: 'draw-while-disabled',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'Draw 1 card.',
        effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.hand).toHaveLength(0);

    state.turn = 2;
    manager.getEffectEngine().resolveEffect(
      {
        id: 'draw-after-expiry',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'Draw 1 card.',
        effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.hand.map(card => card.id)).toContain(drawA.id);
    expect(state.players.player1.deck.map(card => card.id)).toContain(drawB.id);
  });

  it('enforces Confusion Tax when the restriction is stored on the attacker', () => {
    const manager = new GameStateManager('game-confusion-tax', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'TAX-SOURCE', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({ id: 'HAND-A', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
      createMockCardDefinition({ id: 'HAND-B', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
    ]);

    const state = createMockGameState({
      turn: 1,
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });
    const source = createMockCard({
      id: 'tax-source',
      cardId: 'TAX-SOURCE',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const attacker = createMockCard({
      id: 'taxed-attacker',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
      power: 6000,
      basePower: 6000,
    });
    const target = createMockCard({
      id: 'tax-target',
      owner: 'player2',
      zone: CardZone.FIELD,
      state: CardState.RESTED,
      power: 1000,
      basePower: 1000,
    });
    const handA = createMockCard({
      id: 'hand-a',
      cardId: 'HAND-A',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const handB = createMockCard({
      id: 'hand-b',
      cardId: 'HAND-B',
      owner: 'player1',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [attacker];
    state.players.player1.hand = [handA, handB];
    state.players.player1.trash = [];
    state.players.player2.field = [source, target];
    manager.setState(state);

    manager.getEffectEngine().resolveEffect(
      {
        id: 'apply-confusion-tax',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'That character must trash 2 cards from hand to attack.',
        effects: [{
          type: EffectType.CONFUSION_TAX,
          value: 2,
          duration: EffectDuration.UNTIL_END_OF_OPPONENT_TURN,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player2,
        selectedTargets: [attacker.id],
      },
    );

    expect(manager.declareAttack(attacker.id, target.id, 'character')).toBe(true);
    expect(state.players.player1.hand).toHaveLength(0);
    expect(state.players.player1.trash).toHaveLength(2);
  });

  it('flips the requested number of top life cards face up', () => {
    const manager = new GameStateManager('game-flip-life-count', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'SOURCE', type: 'CHARACTER', cost: 0, power: 1000, effects: [] }),
    ]);

    const state = createMockGameState({
      turn: 1,
      phase: GamePhase.MAIN_PHASE,
      activePlayerId: 'player1',
    });
    const source = createMockCard({
      id: 'flip-life-source',
      cardId: 'SOURCE',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const lifeA = createMockCard({
      id: 'life-a',
      owner: 'player1',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });
    const lifeB = createMockCard({
      id: 'life-b',
      owner: 'player1',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });
    const lifeC = createMockCard({
      id: 'life-c',
      owner: 'player1',
      zone: CardZone.LIFE,
      state: CardState.ACTIVE,
      faceUp: false,
    });

    state.players.player1.field = [source];
    state.players.player1.lifeCards = [lifeA, lifeB, lifeC];
    manager.setState(state);

    manager.getEffectEngine().resolveEffect(
      {
        id: 'flip-two-life',
        trigger: EffectTrigger.IMMEDIATE,
        description: 'Turn 2 cards from the top of your Life cards face-up.',
        effects: [{
          type: EffectType.FLIP_LIFE_FACE_UP,
          value: 2,
        }],
      },
      {
        gameState: state,
        sourceCard: source,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.lifeCards.map(card => ({ id: card.id, faceUp: card.faceUp }))).toEqual([
      { id: lifeA.id, faceUp: false },
      { id: lifeB.id, faceUp: true },
      { id: lifeC.id, faceUp: true },
    ]);

    const opponentView = manager.sanitizeStateForPlayer('player2');
    expect(opponentView.players.player1.lifeCards.map(card => card.id)).toEqual([
      'hidden-life-0',
      lifeB.id,
      lifeC.id,
    ]);
  });
});
