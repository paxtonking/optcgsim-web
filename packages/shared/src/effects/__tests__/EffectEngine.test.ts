/**
 * EffectEngine Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EffectEngine, EffectContext } from '../EffectEngine';
import { EffectType, EffectTrigger, EffectDuration, TargetType, ConditionType } from '../types';
import { GamePhase, CardState, CardZone } from '../../types/game';
import {
  createMockGameState,
  createMockPlayer,
  createMockCard,
  createMockCardDefinition,
  addToField,
  addDonToField,
  resetCardIdCounter,
} from '../../test-utils';

describe('EffectEngine', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  describe('Card Definition Management', () => {
    it('should load card definitions', () => {
      const def = createMockCardDefinition({ id: 'TEST-001', name: 'Test Card' });
      engine.loadCardDefinitions([def]);

      const loaded = engine.getCardDefinition('TEST-001');
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe('Test Card');
    });

    it('should warn about duplicate card IDs', () => {
      const def1 = createMockCardDefinition({ id: 'TEST-001', name: 'First' });
      const def2 = createMockCardDefinition({ id: 'TEST-001', name: 'Second' });

      const consoleSpy = vi.spyOn(console, 'warn');
      engine.loadCardDefinitions([def1, def2]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate card IDs'),
        expect.arrayContaining(['TEST-001'])
      );
    });
  });

  describe('Keyword Checking', () => {
    it('should detect Rush keyword', () => {
      const card = createMockCard({ keywords: ['Rush'] });
      expect(engine.hasKeyword(card, 'Rush')).toBe(true);
    });

    it('should detect Blocker keyword', () => {
      const card = createMockCard({ keywords: ['Blocker'] });
      expect(engine.hasKeyword(card, 'Blocker')).toBe(true);
    });

    it('should return false for missing keyword', () => {
      const card = createMockCard({ keywords: ['Rush'] });
      expect(engine.hasKeyword(card, 'Blocker')).toBe(false);
    });

    it('should handle card with no keywords', () => {
      const card = createMockCard({});
      expect(engine.hasKeyword(card, 'Rush')).toBe(false);
    });
  });

  describe('canAttackOnPlayTurn', () => {
    it('should allow attack with Rush on play turn', () => {
      const card = createMockCard({ keywords: ['Rush'], turnPlayed: 1 });
      expect(engine.canAttackOnPlayTurn(card, 1)).toBe(true);
    });

    it('should not allow attack without Rush on play turn', () => {
      const card = createMockCard({ turnPlayed: 1 });
      expect(engine.canAttackOnPlayTurn(card, 1)).toBe(false);
    });

    it('should allow attack on later turn without Rush', () => {
      const card = createMockCard({ turnPlayed: 1 });
      expect(engine.canAttackOnPlayTurn(card, 2)).toBe(true);
    });
  });

  describe('canBlock', () => {
    it('should allow active Blocker to block', () => {
      const card = createMockCard({
        keywords: ['Blocker'],
        state: CardState.ACTIVE,
      });
      expect(engine.canBlock(card)).toBe(true);
    });

    it('should not allow rested Blocker to block', () => {
      const card = createMockCard({
        keywords: ['Blocker'],
        state: CardState.RESTED,
      });
      expect(engine.canBlock(card)).toBe(false);
    });

    it('should not allow non-Blocker to block', () => {
      const card = createMockCard({ state: CardState.ACTIVE });
      expect(engine.canBlock(card)).toBe(false);
    });
  });

  describe('isUnblockable', () => {
    it('should detect permanent Unblockable keyword', () => {
      const card = createMockCard({ keywords: ['Unblockable'] });
      expect(engine.isUnblockable(card)).toBe(true);
    });

    it('should detect temporary Unblockable keyword', () => {
      const card = createMockCard({ temporaryKeywords: ['Unblockable'] });
      expect(engine.isUnblockable(card)).toBe(true);
    });

    it('should return false without Unblockable', () => {
      const card = createMockCard({});
      expect(engine.isUnblockable(card)).toBe(false);
    });
  });

  describe('Keyword Effects', () => {
    it('should detect Banish keyword', () => {
      const card = createMockCard({ keywords: ['Banish'] });
      expect(engine.hasBanish(card)).toBe(true);
    });

    it('should detect Double Attack keyword', () => {
      const card = createMockCard({ keywords: ['Double Attack'] });
      expect(engine.hasDoubleAttack(card)).toBe(true);
    });
  });
});

describe('EffectEngine.resolveAction', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  describe('BUFF_SELF', () => {
    it('should add power buff to source card', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const card = createMockCard({ power: 5000, basePower: 5000, owner: 'player1' });
      addToField(player, [card]);

      const context: EffectContext = {
        gameState,
        sourceCard: card,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-effect',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_SELF,
          value: 2000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '+2000 power',
      };

      engine.resolveEffect(effect, context);

      // Power buff is tracked in powerBuffs array
      expect(card.powerBuffs).toBeDefined();
      expect(card.powerBuffs!.length).toBe(1);
      expect(card.powerBuffs![0].value).toBe(2000);

      // Effective power = base + buffs
      const effectivePower = (card.basePower || 0) + card.powerBuffs!.reduce((sum, b) => sum + b.value, 0);
      expect(effectivePower).toBe(7000);
    });
  });

  describe('BUFF_POWER / BUFF_ANY', () => {
    it('should add power buff to target card', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ power: 5000, basePower: 5000, owner: 'player1' });
      const targetCard = createMockCard({ power: 3000, basePower: 3000, owner: 'player1' });
      addToField(player, [sourceCard, targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-effect',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_ANY,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          value: 4000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '+4000 power',
      };

      engine.resolveEffect(effect, context);

      // Power buff is tracked in powerBuffs array
      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].value).toBe(4000);

      // Effective power = base + buffs
      const effectivePower = (targetCard.basePower || 0) + targetCard.powerBuffs!.reduce((sum, b) => sum + b.value, 0);
      expect(effectivePower).toBe(7000);
    });
  });

  describe('BUFF_COMBAT', () => {
    it('should add to combat effectBuffPower', () => {
      const gameState = createMockGameState();
      gameState.currentCombat = {
        attackerId: 'attacker',
        targetId: 'defender',
        targetType: 'leader',
        attackPower: 5000,
        effectBuffPower: 0,
      };

      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1', zone: CardZone.HAND });
      const targetCard = player.leaderCard!;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-counter',
        trigger: EffectTrigger.COUNTER,
        effects: [{
          type: EffectType.BUFF_COMBAT,
          target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
          value: 3000,
          duration: EffectDuration.UNTIL_END_OF_BATTLE,
        }],
        description: '+3000 counter',
      };

      engine.resolveEffect(effect, context);
      expect(gameState.currentCombat.effectBuffPower).toBe(3000);
    });
  });

  describe('DEBUFF_POWER', () => {
    it('should add negative power buff to target card', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const opponent = gameState.players['player2'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ power: 6000, basePower: 6000, owner: 'player2' });
      addToField(player, [sourceCard]);
      addToField(opponent, [targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-effect',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DEBUFF_POWER,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
          value: 3000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '-3000 power',
      };

      engine.resolveEffect(effect, context);

      // Power debuff is tracked in powerBuffs array as negative value
      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].value).toBe(-3000);

      // Effective power = base + buffs (negative buff)
      const effectivePower = (targetCard.basePower || 0) + targetCard.powerBuffs!.reduce((sum, b) => sum + b.value, 0);
      expect(effectivePower).toBe(3000);
    });

    it('should track debuff even when it would reduce effective power below 0', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const opponent = gameState.players['player2'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ power: 2000, basePower: 2000, owner: 'player2' });
      addToField(player, [sourceCard]);
      addToField(opponent, [targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-effect',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DEBUFF_POWER,
          value: 5000,
        }],
        description: '-5000 power',
      };

      engine.resolveEffect(effect, context);

      // Power debuff is tracked in powerBuffs
      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].value).toBe(-5000);

      // Effective power calculation would be -3000, but should be clamped to 0 when used in combat
      const rawEffectivePower = (targetCard.basePower || 0) + targetCard.powerBuffs!.reduce((sum, b) => sum + b.value, 0);
      expect(rawEffectivePower).toBe(-3000);
      // Note: Actual clamping to 0 happens in GameStateManager.getEffectivePower()
    });
  });

  describe('DRAW_CARDS', () => {
    it('should draw cards from deck to hand', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard]);
      player.hand = [];
      player.deck = [
        createMockCard({ id: 'deck-1', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-2', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-3', owner: 'player1', zone: CardZone.DECK }),
      ];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-draw',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DRAW_CARDS,
          value: 2,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Draw 2 cards',
      };

      engine.resolveEffect(effect, context);
      expect(player.hand.length).toBe(2);
      expect(player.deck.length).toBe(1);
    });
  });

  describe('CANT_BE_BLOCKED', () => {
    it('should add Unblockable to temporaryKeywords', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const attackerCard = createMockCard({ owner: 'player1' });
      addToField(player, [attackerCard]);

      const context: EffectContext = {
        gameState,
        sourceCard: attackerCard,
        sourcePlayer: player,
        selectedTargets: [attackerCard.id],
      };

      const effect = {
        id: 'test-unblockable',
        trigger: EffectTrigger.ON_ATTACK,
        effects: [{
          type: EffectType.CANT_BE_BLOCKED,
          target: { type: TargetType.SELF },
          duration: EffectDuration.UNTIL_END_OF_BATTLE,
        }],
        description: 'Cannot be blocked',
      };

      engine.resolveEffect(effect, context);
      expect(attackerCard.temporaryKeywords).toContain('Unblockable');
      expect(engine.isUnblockable(attackerCard)).toBe(true);
    });
  });

  describe('KO Effects', () => {
    it('should KO a character with KO_CHARACTER', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const opponent = gameState.players['player2'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ owner: 'player2' });
      addToField(player, [sourceCard]);
      addToField(opponent, [targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-ko',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.KO_CHARACTER,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
          duration: EffectDuration.INSTANT,
        }],
        description: 'K.O. 1 character',
      };

      engine.resolveEffect(effect, context);
      expect(opponent.field.length).toBe(0);
      expect(opponent.trash.length).toBe(1);
      expect(opponent.trash[0].id).toBe(targetCard.id);
    });
  });

  describe('REST_CHARACTER', () => {
    it('should rest an active character', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const opponent = gameState.players['player2'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({
        owner: 'player2',
        state: CardState.ACTIVE,
      });
      addToField(player, [sourceCard]);
      addToField(opponent, [targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-rest',
        trigger: EffectTrigger.ON_ATTACK,
        effects: [{
          type: EffectType.REST_CHARACTER,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
          duration: EffectDuration.INSTANT,
        }],
        description: 'Rest 1 character',
      };

      engine.resolveEffect(effect, context);
      expect(targetCard.state).toBe(CardState.RESTED);
    });
  });

  describe('GRANT_KEYWORD', () => {
    it('should grant a keyword to target', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard, targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-grant',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        effects: [{
          type: EffectType.GRANT_KEYWORD,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          keyword: 'Rush',
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: 'Grant Rush',
      };

      engine.resolveEffect(effect, context);
      expect(targetCard.keywords ?? []).not.toContain('Rush');
      expect(targetCard.grantedEffects?.some(e => e.keyword === 'Rush' && e.duration === 'THIS_TURN')).toBe(true);
      expect(engine.hasKeyword(targetCard, 'Rush', gameState)).toBe(true);
    });

    it('should keep opponent-turn duration active for one additional turn', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard, targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-grant-opponent-turn',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        effects: [{
          type: EffectType.GRANT_KEYWORD,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          keyword: 'Rush',
          duration: EffectDuration.UNTIL_END_OF_OPPONENT_TURN,
        }],
        description: 'Grant Rush until end of opponent turn',
      };

      engine.resolveEffect(effect, context);
      expect(engine.hasKeyword(targetCard, 'Rush', gameState)).toBe(true);

      gameState.turn = 2;
      expect(engine.hasKeyword(targetCard, 'Rush', gameState)).toBe(true);

      gameState.turn = 3;
      expect(engine.hasKeyword(targetCard, 'Rush', gameState)).toBe(false);
    });
  });

  describe('DISCARD_FROM_HAND', () => {
    it('should discard specified cards from hand', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const handCard1 = createMockCard({ id: 'hand-1', owner: 'player1', zone: CardZone.HAND });
      const handCard2 = createMockCard({ id: 'hand-2', owner: 'player1', zone: CardZone.HAND });
      addToField(player, [sourceCard]);
      player.hand = [handCard1, handCard2];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [handCard1.id],
      };

      const effect = {
        id: 'test-discard',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DISCARD_FROM_HAND,
          value: 1,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Discard 1 card',
      };

      engine.resolveEffect(effect, context);
      expect(player.hand.length).toBe(1);
      expect(player.trash.length).toBe(1);
      expect(player.trash[0].id).toBe('hand-1');
    });

    it('should discard from end of hand when no targets specified', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const handCard1 = createMockCard({ id: 'hand-1', owner: 'player1', zone: CardZone.HAND });
      const handCard2 = createMockCard({ id: 'hand-2', owner: 'player1', zone: CardZone.HAND });
      addToField(player, [sourceCard]);
      player.hand = [handCard1, handCard2];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [],
      };

      const effect = {
        id: 'test-discard',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DISCARD_FROM_HAND,
          value: 1,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Discard 1 card',
      };

      engine.resolveEffect(effect, context);
      expect(player.hand.length).toBe(1);
      expect(player.trash.length).toBe(1);
    });
  });

  describe('LOOK_AT_TOP_DECK', () => {
    it('should record viewed cards from top of deck', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard]);
      player.deck = [
        createMockCard({ id: 'deck-1', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-2', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-3', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-4', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-5', owner: 'player1', zone: CardZone.DECK }),
      ];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-look',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.LOOK_AT_TOP_DECK,
          value: 3,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Look at top 3 cards',
      };

      const result = engine.resolveEffect(effect, context);
      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(1);
      expect(result.changes[0].type).toBe('EFFECT_APPLIED');
      expect(result.changes[0].value).toBe(3);
      // Cards should still be in deck (not moved)
      expect(player.deck.length).toBe(5);
    });

    it('should handle looking at more cards than deck size', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard]);
      player.deck = [
        createMockCard({ id: 'deck-1', owner: 'player1', zone: CardZone.DECK }),
        createMockCard({ id: 'deck-2', owner: 'player1', zone: CardZone.DECK }),
      ];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-look',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.LOOK_AT_TOP_DECK,
          value: 5,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Look at top 5 cards',
      };

      const result = engine.resolveEffect(effect, context);
      expect(result.success).toBe(true);
      expect(result.changes[0].value).toBe(2); // Only 2 cards in deck
    });
  });

  describe('ADD_DON', () => {
    it('should add DON from DON deck to field as rested', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard]);
      player.donDeck = 5;
      player.donField = [];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-add-don',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.ADD_DON,
          value: 1,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Add 1 DON',
      };

      engine.resolveEffect(effect, context);
      expect(player.donDeck).toBe(4);
      expect(player.donField.length).toBe(1);
      expect(player.donField[0].state).toBe(CardState.RESTED);
    });

    it('should not add DON if DON deck is empty', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1' });
      addToField(player, [sourceCard]);
      player.donDeck = 0;
      player.donField = [];

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const effect = {
        id: 'test-add-don',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.ADD_DON,
          value: 1,
          duration: EffectDuration.INSTANT,
        }],
        description: 'Add 1 DON',
      };

      engine.resolveEffect(effect, context);
      expect(player.donDeck).toBe(0);
      expect(player.donField.length).toBe(0);
    });
  });

  describe('Power Buff Tracking', () => {
    it('should create powerBuffs array when applying BUFF_POWER', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1', basePower: 5000, power: 5000 });
      const targetCard = createMockCard({ owner: 'player1', basePower: 3000, power: 3000 });
      addToField(player, [sourceCard, targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-buff',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_POWER,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          value: 2000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '+2000 power during this turn',
      };

      engine.resolveEffect(effect, context);

      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].value).toBe(2000);
      expect(targetCard.powerBuffs![0].duration).toBe('THIS_TURN');
      expect(targetCard.powerBuffs![0].sourceCardId).toBe(sourceCard.id);
    });

    it('should track THIS_BATTLE buffs from BUFF_COMBAT', () => {
      const gameState = createMockGameState();
      gameState.turn = 1;  // Explicitly set turn for combat ID generation
      gameState.currentCombat = {
        attackerId: 'attacker',
        targetId: 'defender',
        targetType: 'leader',
        attackPower: 5000,
        effectBuffPower: 0,
      };

      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1', zone: CardZone.HAND });
      const targetCard = player.leaderCard!;
      targetCard.basePower = 5000;
      targetCard.power = 5000;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-counter',
        trigger: EffectTrigger.COUNTER,
        effects: [{
          type: EffectType.BUFF_COMBAT,
          target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
          value: 3000,
          duration: EffectDuration.UNTIL_END_OF_BATTLE,
        }],
        description: '+3000 counter',
      };

      engine.resolveEffect(effect, context);

      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].duration).toBe('THIS_BATTLE');
      // Combat ID format is `turn-attackerId`
      expect(targetCard.powerBuffs![0].appliedCombatId).toBe('1-attacker');
    });

    it('should track negative buffs from DEBUFF_POWER', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const opponent = gameState.players['player2'];
      const sourceCard = createMockCard({ owner: 'player1' });
      const targetCard = createMockCard({ owner: 'player2', basePower: 6000, power: 6000 });
      addToField(player, [sourceCard]);
      addToField(opponent, [targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const effect = {
        id: 'test-debuff',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DEBUFF_POWER,
          target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
          value: 3000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '-3000 power',
      };

      engine.resolveEffect(effect, context);

      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(1);
      expect(targetCard.powerBuffs![0].value).toBe(-3000);
      expect(targetCard.powerBuffs![0].duration).toBe('THIS_TURN');
    });

    it('should stack multiple buffs on the same card', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      const sourceCard = createMockCard({ owner: 'player1', basePower: 5000, power: 5000 });
      const targetCard = createMockCard({ owner: 'player1', basePower: 3000, power: 3000 });
      addToField(player, [sourceCard, targetCard]);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      // Apply first buff
      const effect1 = {
        id: 'test-buff-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_POWER,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          value: 1000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '+1000 power',
      };

      engine.resolveEffect(effect1, context);

      // Apply second buff
      const effect2 = {
        id: 'test-buff-2',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_POWER,
          target: { type: TargetType.YOUR_CHARACTER, count: 1 },
          value: 2000,
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '+2000 power',
      };

      engine.resolveEffect(effect2, context);

      expect(targetCard.powerBuffs).toBeDefined();
      expect(targetCard.powerBuffs!.length).toBe(2);

      // Total buff should be 3000
      const totalBuff = targetCard.powerBuffs!.reduce((sum, b) => sum + b.value, 0);
      expect(totalBuff).toBe(3000);
    });
  });
});

describe('EffectEngine.checkCondition - DON_ATTACHED_OR_MORE', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  it('should return true when card has required DON attached', () => {
    const gameState = createMockGameState();
    const player = gameState.players['player1'];
    const card = createMockCard({ owner: 'player1' });
    addToField(player, [card]);

    // Add DON and attach to card
    addDonToField(player, 1);
    player.donField[0].attachedTo = card.id;
    player.donField[0].state = CardState.ATTACHED;

    const context: EffectContext = {
      gameState,
      sourceCard: card,
      sourcePlayer: player,
    };

    const condition = {
      type: ConditionType.DON_ATTACHED_OR_MORE,
      value: 1,
    };

    const result = engine.checkCondition(condition, context);
    expect(result).toBe(true);
  });

  it('should return false when card has insufficient DON attached', () => {
    const gameState = createMockGameState();
    const player = gameState.players['player1'];
    const card = createMockCard({ owner: 'player1' });
    addToField(player, [card]);

    // No DON attached

    const context: EffectContext = {
      gameState,
      sourceCard: card,
      sourcePlayer: player,
    };

    const condition = {
      type: ConditionType.DON_ATTACHED_OR_MORE,
      value: 1,
    };

    const result = engine.checkCondition(condition, context);
    expect(result).toBe(false);
  });

  it('should return true when card has more than required DON attached', () => {
    const gameState = createMockGameState();
    const player = gameState.players['player1'];
    const card = createMockCard({ owner: 'player1' });
    addToField(player, [card]);

    // Add 3 DON and attach to card
    addDonToField(player, 3);
    player.donField.forEach(don => {
      don.attachedTo = card.id;
      don.state = CardState.ATTACHED;
    });

    const context: EffectContext = {
      gameState,
      sourceCard: card,
      sourcePlayer: player,
    };

    const condition = {
      type: ConditionType.DON_ATTACHED_OR_MORE,
      value: 2,
    };

    const result = engine.checkCondition(condition, context);
    expect(result).toBe(true);
  });

  it('should count only attached DON, not DON in cost area', () => {
    const gameState = createMockGameState();
    const player = gameState.players['player1'];
    const card = createMockCard({ owner: 'player1' });
    addToField(player, [card]);

    // Add 3 DON but don't attach any
    addDonToField(player, 3);
    // All DON are in cost area (not attached)

    const context: EffectContext = {
      gameState,
      sourceCard: card,
      sourcePlayer: player,
    };

    const condition = {
      type: ConditionType.DON_ATTACHED_OR_MORE,
      value: 1,
    };

    const result = engine.checkCondition(condition, context);
    expect(result).toBe(false);
  });
});
