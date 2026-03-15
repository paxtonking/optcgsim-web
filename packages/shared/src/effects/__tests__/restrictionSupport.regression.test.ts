import { beforeEach, describe, expect, it } from 'vitest';
import { GameStateManager } from '../../game/GameStateManager';
import { KW_CANT_PLAY_CHARACTERS, KW_DISABLE_EFFECT_DRAWS } from '../../constants/keywords';
import { EffectTrigger, EffectType } from '../types';
import { CardState, CardZone, GamePhase } from '../../types/game';
import {
  addDonToField,
  createMockCard,
  createMockCardDefinition,
  createMockLeader,
  resetCardIdCounter,
} from '../../test-utils';
import { effectTextParser } from '../parser/EffectTextParser';

describe('restriction support regressions', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('stores filtered CANT_PLAY_CHARACTERS restrictions and only blocks matching character plays', () => {
    const manager = new GameStateManager('game-filtered-play-restriction', 'player1', 'player2');
    manager.loadCardDefinitions([
      createMockCardDefinition({ id: 'LOW-COST', type: 'CHARACTER', cost: 4, power: 4000, effects: [] }),
      createMockCardDefinition({ id: 'HIGH-COST', type: 'CHARACTER', cost: 5, power: 6000, effects: [] }),
    ]);

    const state = manager.getState();
    state.players.player1.leaderCard = createMockLeader('player1', { id: 'p1-leader' });
    state.players.player2.leaderCard = createMockLeader('player2', { id: 'p2-leader' });

    const sourceCard = createMockCard({
      id: 'restriction-source',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const lowCostCharacter = createMockCard({
      id: 'low-cost-character',
      cardId: 'LOW-COST',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });
    const highCostCharacter = createMockCard({
      id: 'high-cost-character',
      cardId: 'HIGH-COST',
      owner: 'player2',
      zone: CardZone.HAND,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [sourceCard];
    state.players.player2.hand = [lowCostCharacter, highCostCharacter];
    addDonToField(state.players.player2, 10);

    const restrictionEffect = effectTextParser.parse(
      '[Main] Your opponent cannot play Character cards with a base cost of 5 or more during this turn.',
      'RESTRICTOR',
    )[0];

    manager.getEffectEngine().resolveEffect(restrictionEffect, {
      gameState: state,
      sourceCard,
      sourcePlayer: state.players.player1,
    });

    expect(state.players.player2.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: KW_CANT_PLAY_CHARACTERS,
          filters: expect.arrayContaining([
            expect.objectContaining({
              property: 'BASE_COST',
              operator: 'OR_MORE',
              value: 5,
            }),
          ]),
        }),
      ]),
    );

    state.activePlayerId = 'player2';
    state.phase = GamePhase.MAIN_PHASE;

    expect(manager.playCard('player2', lowCostCharacter.id)).toBe(true);
    expect(manager.playCard('player2', highCostCharacter.id)).toBe(false);
    expect(state.players.player2.field.map(card => card.id)).toContain(lowCostCharacter.id);
    expect(state.players.player2.field.map(card => card.id)).not.toContain(highCostCharacter.id);
  });

  it('expires DisableEffectDraws off both restrictions and leader keywords at end of turn', () => {
    const manager = new GameStateManager('game-disable-effect-draws-expiry', 'player1', 'player2');
    const state = manager.getState();

    state.players.player1.leaderCard = createMockLeader('player1', { id: 'p1-leader' });
    state.players.player2.leaderCard = createMockLeader('player2', { id: 'p2-leader' });

    const sourceCard = createMockCard({
      id: 'draw-restriction-source',
      owner: 'player1',
      zone: CardZone.FIELD,
      state: CardState.ACTIVE,
    });
    const playerOneNormalDraw = createMockCard({
      id: 'player1-normal-draw',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const playerOneEffectDraw = createMockCard({
      id: 'player1-effect-draw',
      owner: 'player1',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });
    const playerTwoTurnDraw = createMockCard({
      id: 'player2-turn-draw',
      owner: 'player2',
      zone: CardZone.DECK,
      state: CardState.ACTIVE,
    });

    state.players.player1.field = [sourceCard];
    state.players.player1.deck = [playerOneNormalDraw, playerOneEffectDraw];
    state.players.player2.deck = [playerTwoTurnDraw];
    state.activePlayerId = 'player1';
    state.phase = GamePhase.MAIN_PHASE;
    state.turn = 1;

    const disableDrawsEffect = effectTextParser.parse(
      '[Main] You cannot draw cards via effects during this turn.',
      'DRAW-LOCK',
    )[0];

    manager.getEffectEngine().resolveEffect(disableDrawsEffect, {
      gameState: state,
      sourceCard,
      sourcePlayer: state.players.player1,
    });

    expect(state.players.player1.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: KW_DISABLE_EFFECT_DRAWS }),
      ]),
    );
    expect(state.players.player1.leaderCard?.temporaryKeywords).toContain(KW_DISABLE_EFFECT_DRAWS);

    manager.getEffectEngine().resolveEffect(
      {
        id: 'effect-draw-now',
        trigger: EffectTrigger.MAIN,
        description: 'Draw 1 card.',
        effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
      },
      {
        gameState: state,
        sourceCard,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.hand.map(card => card.id)).not.toContain(playerOneNormalDraw.id);

    manager.endTurn('player1');

    expect(state.players.player1.restrictions ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: KW_DISABLE_EFFECT_DRAWS }),
      ]),
    );
    expect(state.players.player1.leaderCard?.temporaryKeywords ?? []).not.toContain(KW_DISABLE_EFFECT_DRAWS);

    manager.endTurn('player2');

    manager.getEffectEngine().resolveEffect(
      {
        id: 'effect-draw-later',
        trigger: EffectTrigger.MAIN,
        description: 'Draw 1 card.',
        effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
      },
      {
        gameState: state,
        sourceCard,
        sourcePlayer: state.players.player1,
      },
    );

    expect(state.players.player1.hand.map(card => card.id)).toContain(playerOneEffectDraw.id);
  });
});
