/**
 * Trigger Integration Tests
 *
 * Tests for all implemented triggers in the EffectEngine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EffectEngine, TriggerEvent } from '../EffectEngine';
import { EffectType, EffectTrigger } from '../types';
import { GamePhase, CardState, CardZone, GameState, PlayerState, GameCard } from '../../types/game';
import {
  createMockGameState,
  createMockCard,
  createMockCardDefinition,
  resetCardIdCounter,
} from '../../test-utils';
import { IMPLEMENTED_TRIGGERS } from '../registry';

describe('Trigger Integration Tests', () => {
  let engine: EffectEngine;

  beforeEach(() => {
    engine = new EffectEngine();
    resetCardIdCounter();
  });

  describe('Play Triggers', () => {
    it('ON_PLAY should fire when card is played to field', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const card = createMockCard({
        cardId: 'TEST-ONPLAY',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'TEST-ONPLAY',
        effects: [{
          id: 'on-play-effect',
          trigger: EffectTrigger.ON_PLAY,
          effects: [{
            type: EffectType.DRAW_CARDS,
            value: 1,
          }],
          description: 'Draw 1 card',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(card);

      const event: TriggerEvent = {
        type: EffectTrigger.ON_PLAY,
        cardId: card.id,
        playerId: 'player1',
      };

      const effects = engine.checkTriggers(gameState, event);
      expect(effects.length).toBeGreaterThan(0);
    });
  });

  describe('KO Triggers', () => {
    it('ON_KO should fire for the KOd card', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const card = createMockCard({
        cardId: 'TEST-KO',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'TEST-KO',
        effects: [{
          id: 'on-ko-effect',
          trigger: EffectTrigger.ON_KO,
          effects: [{
            type: EffectType.DRAW_CARDS,
            value: 1,
          }],
          description: 'Draw 1 card when KOd',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(card);

      const event: TriggerEvent = {
        type: EffectTrigger.ON_KO,
        cardId: card.id,
        playerId: 'player1',
      };

      const effects = engine.checkTriggers(gameState, event);
      expect(effects.length).toBeGreaterThan(0);
    });
  });

  describe('DON Triggers', () => {
    it('DON_X should fire when card has enough DON attached', () => {
      const gameState = createMockGameState();
      const player = gameState.players['player1'];

      const card = createMockCard({
        cardId: 'TEST-DON',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      // Add DON attached to this card
      const don = createMockCard({
        cardId: 'DON',
        owner: 'player1',
        zone: CardZone.DON_FIELD,
        attachedTo: card.id,
      });

      const definition = createMockCardDefinition({
        id: 'TEST-DON',
        effects: [{
          id: 'don-x-effect',
          trigger: EffectTrigger.DON_X,
          triggerValue: 1,
          effects: [{
            type: EffectType.BUFF_SELF,
            value: 1000,
          }],
          description: 'DON!! x1: +1000 power',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(card);
      player.donField.push(don);

      const event: TriggerEvent = {
        type: EffectTrigger.DON_X,
        cardId: card.id,
        playerId: 'player1',
      };

      const effects = engine.checkTriggers(gameState, event);
      expect(effects.length).toBeGreaterThan(0);
    });
  });

  describe('Turn Triggers', () => {
    it('START_OF_TURN should fire at turn start', () => {
      const gameState = createMockGameState();
      gameState.activePlayerId = 'player1';
      const player = gameState.players['player1'];

      const card = createMockCard({
        cardId: 'TEST-START',
        owner: 'player1',
        zone: CardZone.FIELD,
      });

      const definition = createMockCardDefinition({
        id: 'TEST-START',
        effects: [{
          id: 'start-turn-effect',
          trigger: EffectTrigger.START_OF_TURN,
          effects: [{
            type: EffectType.DRAW_CARDS,
            value: 1,
          }],
          description: 'At start of turn, draw 1',
        }],
      });

      engine.loadCardDefinitions([definition]);
      player.field.push(card);

      const event: TriggerEvent = {
        type: EffectTrigger.START_OF_TURN,
        playerId: 'player1',
      };

      const effects = engine.checkTriggers(gameState, event);
      expect(effects.length).toBeGreaterThan(0);
    });
  });

  describe('Trigger Registry Compliance', () => {
    it('should have all expected triggers implemented in registry', () => {
      // Phase 2 triggers
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.ON_PLAY_FROM_TRIGGER)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.DON_TAP)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.ATTACH_DON)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.PRE_KO)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.AFTER_KO_CHARACTER)).toBe(true);

      // Phase 4 triggers
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.OPPONENT_DEPLOYS)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.OPPONENT_ACTIVATES_BLOCKER)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.TRASH_SELF)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.TRASH_ALLY)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.CARD_DRAWN)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.DEPLOYED_FROM_HAND)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.WHILE_RESTED)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.HAND_EMPTY)).toBe(true);
    });
  });
});
