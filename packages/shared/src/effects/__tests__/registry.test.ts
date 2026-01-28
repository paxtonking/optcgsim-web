/**
 * Registry Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  IMPLEMENTED_EFFECT_TYPES,
  IMPLEMENTED_TRIGGERS,
  STUB_EFFECT_TYPES,
  validateCardEffect,
  validateCardEffects,
  isEffectImplemented,
  isTriggerImplemented,
  getEffectImplementationStatus,
} from '../registry';
import { EffectType, EffectTrigger, EffectDuration } from '../types';

describe('Registry', () => {
  describe('IMPLEMENTED_EFFECT_TYPES', () => {
    it('should include core effect types', () => {
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.RUSH)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.BLOCKER)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.BUFF_SELF)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.DRAW_CARDS)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.KO_CHARACTER)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.CANT_BE_BLOCKED)).toBe(true);
    });

    it('should include newly implemented effect types', () => {
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.LOOK_AT_TOP_DECK)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.DISCARD_FROM_HAND)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.ADD_DON)).toBe(true);
    });

    it('should include all formerly stub effect types (now implemented)', () => {
      // All stub effects have been implemented
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.BUFF_OTHER)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.BUFF_FIELD)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.IMMUNE_COMBAT)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.UNBLOCKABLE)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.WIN_GAME)).toBe(true);
    });

    it('should include newly implemented play/combat effects', () => {
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.PLAY_FROM_TRASH)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.PLAY_FROM_DECK)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.ACTIVE_DON)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.CANT_ATTACK)).toBe(true);
      expect(IMPLEMENTED_EFFECT_TYPES.has(EffectType.IMMUNE_KO)).toBe(true);
    });
  });

  describe('IMPLEMENTED_TRIGGERS', () => {
    it('should include core triggers', () => {
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.ON_PLAY)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.ON_ATTACK)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.COUNTER)).toBe(true);
      expect(IMPLEMENTED_TRIGGERS.has(EffectTrigger.TRIGGER)).toBe(true);
    });
  });

  describe('isEffectImplemented', () => {
    it('should return true for implemented effects', () => {
      expect(isEffectImplemented(EffectType.BUFF_POWER)).toBe(true);
      expect(isEffectImplemented(EffectType.GRANT_KEYWORD)).toBe(true);
    });

    it('should return true for formerly stub effects (now implemented)', () => {
      // All stub effects have been implemented
      expect(isEffectImplemented(EffectType.BUFF_OTHER)).toBe(true);
      expect(isEffectImplemented(EffectType.BUFF_FIELD)).toBe(true);
      expect(isEffectImplemented(EffectType.IMMUNE_COMBAT)).toBe(true);
      expect(isEffectImplemented(EffectType.UNBLOCKABLE)).toBe(true);
    });

    it('should return true for newly implemented effects', () => {
      expect(isEffectImplemented(EffectType.PLAY_FROM_TRASH)).toBe(true);
      expect(isEffectImplemented(EffectType.PLAY_FROM_DECK)).toBe(true);
      expect(isEffectImplemented(EffectType.ACTIVE_DON)).toBe(true);
    });
  });

  describe('isTriggerImplemented', () => {
    it('should return true for implemented triggers', () => {
      expect(isTriggerImplemented(EffectTrigger.ON_PLAY)).toBe(true);
      expect(isTriggerImplemented(EffectTrigger.ACTIVATE_MAIN)).toBe(true);
    });

    it('should return true for newly implemented triggers', () => {
      expect(isTriggerImplemented(EffectTrigger.ON_KO)).toBe(true);
      expect(isTriggerImplemented(EffectTrigger.START_OF_TURN)).toBe(true);
    });

    it('should return true for all implemented triggers', () => {
      // All major triggers are now implemented
      expect(isTriggerImplemented(EffectTrigger.PRE_KO)).toBe(true);
      expect(isTriggerImplemented(EffectTrigger.CARD_DRAWN)).toBe(true);
      expect(isTriggerImplemented(EffectTrigger.TRASH_ALLY)).toBe(true);
      expect(isTriggerImplemented(EffectTrigger.DEPLOYED_FROM_HAND)).toBe(true);
    });

    it('should return true for OPPONENT_ATTACK trigger', () => {
      expect(isTriggerImplemented(EffectTrigger.OPPONENT_ATTACK)).toBe(true);
    });
  });

  describe('validateCardEffect', () => {
    it('should return no issues for fully implemented effect', () => {
      const issues = validateCardEffect('TEST-001', {
        id: 'effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.DRAW_CARDS,
          value: 1,
        }],
        description: 'Draw 1 card',
      });

      expect(issues.length).toBe(0);
    });

    it('should return no issues for formerly stub effect types (now implemented)', () => {
      const issues = validateCardEffect('TEST-001', {
        id: 'effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [{
          type: EffectType.BUFF_OTHER,
          value: 1,
        }],
        description: 'Buff other',
      });

      expect(issues.length).toBe(0);
    });

    it('should return no issues for formerly unimplemented triggers (now implemented)', () => {
      const issues = validateCardEffect('TEST-001', {
        id: 'effect-1',
        trigger: EffectTrigger.PRE_KO,
        effects: [{
          type: EffectType.DRAW_CARDS,
          value: 1,
        }],
        description: 'Pre KO draw',
      });

      expect(issues.length).toBe(0);
    });

    it('should pass for newly implemented triggers', () => {
      const issues = validateCardEffect('TEST-001', {
        id: 'effect-1',
        trigger: EffectTrigger.ON_KO,
        effects: [{
          type: EffectType.DRAW_CARDS,
          value: 1,
        }],
        description: 'On KO draw',
      });

      expect(issues.length).toBe(0);
    });
  });

  describe('validateCardEffects', () => {
    it('should return valid for all implemented effects', () => {
      const report = validateCardEffects([
        {
          id: 'CARD-1',
          effects: [{
            id: 'e1',
            trigger: EffectTrigger.ON_PLAY,
            effects: [{ type: EffectType.DRAW_CARDS, value: 1 }],
            description: 'Draw',
          }],
        },
      ]);

      expect(report.valid).toBe(true);
      expect(report.issues.length).toBe(0);
      expect(report.stats.implementedEffects).toBe(1);
    });

    it('should report stats correctly (all effects now implemented)', () => {
      const report = validateCardEffects([
        {
          id: 'CARD-1',
          effects: [
            {
              id: 'e1',
              trigger: EffectTrigger.ON_PLAY,
              effects: [{ type: EffectType.DRAW_CARDS }],
              description: 'Draw',
            },
            {
              id: 'e2',
              trigger: EffectTrigger.ON_PLAY,
              effects: [{ type: EffectType.BUFF_OTHER }],
              description: 'Buff other',
            },
          ],
        },
      ]);

      // Both effects are now implemented
      expect(report.valid).toBe(true);
      expect(report.stats.totalEffects).toBe(2);
      expect(report.stats.implementedEffects).toBe(2);
      expect(report.stats.stubEffects).toBe(0);
    });
  });

  describe('getEffectImplementationStatus', () => {
    it('should return status for all effect types', () => {
      const status = getEffectImplementationStatus();

      expect(status.get(EffectType.RUSH)).toBe('implemented');
      // All former stub effects are now implemented
      expect(status.get(EffectType.BUFF_OTHER)).toBe('implemented');
      expect(status.get(EffectType.BUFF_FIELD)).toBe('implemented');
      expect(status.get(EffectType.WIN_GAME)).toBe('implemented');
    });
  });
});
