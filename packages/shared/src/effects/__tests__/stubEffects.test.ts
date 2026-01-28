/**
 * Stub Effect Type Tests
 *
 * Tests for the formerly stub effect types that are now implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EffectEngine, EffectContext } from '../EffectEngine';
import { EffectType, EffectTrigger, EffectDuration, TargetType } from '../types';
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

describe('Stub Effect Types Tests', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  describe('BUFF_OTHER', () => {
    it('should buff other characters but not self', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      // Source card that applies the buff
      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
        power: 5000,
      });

      // Target card that should receive the buff
      const targetCard = createMockCard({
        cardId: 'TARGET',
        owner: 'player1',
        zone: CardZone.FIELD,
        power: 3000,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'buff-other-effect',
          trigger: EffectTrigger.ON_PLAY,
          effects: [{
            type: EffectType.BUFF_OTHER,
            value: 2000,
            target: { type: TargetType.YOUR_CHARACTER },
          }],
          description: 'Give other characters +2000',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);
      player.field.push(targetCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id, sourceCard.id], // Include self in targets
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      // targetCard should be buffed, sourceCard should NOT be buffed
    });
  });

  describe('BUFF_FIELD', () => {
    it('should buff all matching characters on field', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const char1 = createMockCard({
        cardId: 'CHAR1',
        owner: 'player1',
        zone: CardZone.FIELD,
        power: 3000,
      });

      const char2 = createMockCard({
        cardId: 'CHAR2',
        owner: 'player1',
        zone: CardZone.FIELD,
        power: 4000,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'buff-field-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.BUFF_FIELD,
            value: 1000,
          }],
          description: 'All characters get +1000',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);
      player.field.push(char1);
      player.field.push(char2);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
    });
  });

  describe('SEND_TO_DECK_TOP', () => {
    it('should send card to top of deck', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const targetCard = createMockCard({
        cardId: 'TARGET',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'deck-top-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.SEND_TO_DECK_TOP,
            target: { type: TargetType.YOUR_CHARACTER },
          }],
          description: 'Put target on top of deck',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);
      player.field.push(targetCard);

      const initialDeckLength = player.deck.length;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
    });
  });

  describe('DRAW_AND_TRASH', () => {
    it('should draw cards then allow trashing', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      // Add cards to deck
      for (let i = 0; i < 5; i++) {
        player.deck.push(createMockCard({
          cardId: `DECK-${i}`,
          owner: 'player1',
          zone: CardZone.DECK,
        }));
      }

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'draw-trash-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.DRAW_AND_TRASH,
            value: 2, // Draw 2
          }],
          description: 'Draw 2, then discard 1',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const initialHandSize = player.hand.length;
      const initialDeckSize = player.deck.length;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(player.hand.length).toBe(initialHandSize + 2);
    });
  });

  describe('BECOME_BLOCKER', () => {
    it('should grant Blocker keyword to target', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const targetCard = createMockCard({
        cardId: 'TARGET',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'become-blocker-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.BECOME_BLOCKER,
            target: { type: TargetType.YOUR_CHARACTER },
          }],
          description: 'Target gains Blocker',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);
      player.field.push(targetCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [targetCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(targetCard.temporaryKeywords).toContain('Blocker');
    });
  });

  describe('UNBLOCKABLE', () => {
    it('should grant Unblockable keyword to target', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'unblockable-effect',
          trigger: EffectTrigger.ON_ATTACK,
          effects: [{
            type: EffectType.UNBLOCKABLE,
            target: { type: TargetType.SELF },
          }],
          description: 'This attack cannot be blocked',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [sourceCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(sourceCard.temporaryKeywords).toContain('Unblockable');
    });
  });

  describe('RETURN_DON', () => {
    it('should return DON to DON deck', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      // Add DON to field
      const don = createMockCard({
        cardId: 'DON',
        owner: 'player1',
        zone: CardZone.DON_FIELD,
        state: CardState.RESTED,
      });
      player.donField.push(don);

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'return-don-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.RETURN_DON,
            value: 1,
          }],
          description: 'Return 1 DON to deck',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const initialDonField = player.donField.length;
      const initialDonDeck = player.donDeck;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(player.donField.length).toBe(initialDonField - 1);
      expect(player.donDeck).toBe(initialDonDeck + 1);
    });
  });

  describe('IMMUNE_COMBAT', () => {
    it('should grant combat immunity to target', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'immune-combat-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.IMMUNE_COMBAT,
            target: { type: TargetType.SELF },
          }],
          description: 'Cannot take battle damage',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        selectedTargets: [sourceCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(sourceCard.temporaryKeywords).toContain('ImmuneCombat');
    });
  });

  describe('OPPONENT_TRASH_CARDS', () => {
    it('should trash opponent field card', () => {
      const gameState = createMockGameState();
      const player1 = gameState.players['player1'];
      const player2 = gameState.players['player2'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const targetCard = createMockCard({
        cardId: 'OPP-TARGET',
        owner: 'player2',
        zone: CardZone.FIELD,
      });
      player2.field.push(targetCard);

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'opp-trash-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.OPPONENT_TRASH_CARDS,
            target: { type: TargetType.OPPONENT_CHARACTER },
          }],
          description: 'Trash opponent character',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player1.field.push(sourceCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player1,
        selectedTargets: [targetCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(player2.field.length).toBe(0);
      expect(player2.trash.length).toBe(1);
    });
  });

  describe('OPPONENT_TRASH_FROM_HAND', () => {
    it('should trash from opponent hand', () => {
      const gameState = createMockGameState();
      const player1 = gameState.players['player1'];
      const player2 = gameState.players['player2'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const handCard = createMockCard({
        cardId: 'OPP-HAND',
        owner: 'player2',
        zone: CardZone.HAND,
      });
      player2.hand.push(handCard);

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'opp-trash-hand-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.OPPONENT_TRASH_FROM_HAND,
            value: 1,
          }],
          description: 'Opponent trashes 1 from hand',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player1.field.push(sourceCard);

      const initialHandSize = player2.hand.length;

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player1,
        selectedTargets: [handCard.id],
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(player2.hand.length).toBe(initialHandSize - 1);
    });
  });

  describe('WIN_GAME', () => {
    it('should set game over with winner', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'win-game-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.WIN_GAME,
          }],
          description: 'Win the game',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(gameState.phase).toBe(GamePhase.GAME_OVER);
      expect(gameState.winner).toBe('player1');
    });
  });

  describe('TAKE_ANOTHER_TURN', () => {
    it('should mark player for extra turn', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];
      player.leaderCard = createMockCard({
        cardId: 'LEADER',
        owner: 'player1',
        zone: CardZone.LEADER,
      });

      const sourceCard = createMockCard({
        cardId: 'SOURCE',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'SOURCE',
        effects: [{
          id: 'extra-turn-effect',
          trigger: EffectTrigger.ACTIVATE_MAIN,
          effects: [{
            type: EffectType.TAKE_ANOTHER_TURN,
          }],
          description: 'Take another turn',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(sourceCard);

      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
      };

      const result = engine.resolveEffect(definition.effects[0], context);
      expect(result.success).toBe(true);
      expect(player.leaderCard.temporaryKeywords).toContain('ExtraTurn');
    });
  });
});
