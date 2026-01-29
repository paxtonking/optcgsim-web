/**
 * AIService - AI opponent for One Piece TCG
 *
 * Uses strategy pattern to implement different difficulty levels.
 * Each difficulty has its own decision-making strategy.
 */

import {
  GameState,
  GamePhase,
  PlayerState,
  CardState,
  ActionType,
} from '@optcgsim/shared';
import { AIDecision, DifficultyLevel } from './types.js';
import { AI_CONFIG } from './config.js';
import { BaseStrategy } from './strategies/BaseStrategy.js';
import { EasyStrategy } from './strategies/EasyStrategy.js';
import { MediumStrategy } from './strategies/MediumStrategy.js';
import { HardStrategy } from './strategies/HardStrategy.js';

export class AIService {
  private playerId: string;
  private difficulty: DifficultyLevel;
  private strategy: BaseStrategy;

  constructor(playerId: string, difficulty: DifficultyLevel = 'medium') {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.strategy = this.createStrategy(difficulty);
  }

  /**
   * Create the appropriate strategy for the difficulty level
   */
  private createStrategy(difficulty: DifficultyLevel): BaseStrategy {
    switch (difficulty) {
      case 'easy':
      case 'basic':
        return new EasyStrategy(this.playerId, difficulty);

      case 'medium':
        return new MediumStrategy(this.playerId, difficulty);

      case 'hard':
        return new HardStrategy(this.playerId, difficulty);

      default:
        return new MediumStrategy(this.playerId, 'medium');
    }
  }

  /**
   * Get the next action the AI should take based on current game state
   */
  public getNextAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    // Pre-game setup phase
    if (gameState.phase === GamePhase.PRE_GAME_SETUP) {
      return this.decidePreGameSetup(gameState, player);
    }

    // Mulligan phase
    if (gameState.phase === GamePhase.START_MULLIGAN) {
      return this.strategy.decideMulligan(player);
    }

    // Defensive phases (BLOCKER_STEP, COUNTER_STEP)
    if (gameState.phase === GamePhase.BLOCKER_STEP || gameState.phase === GamePhase.COUNTER_STEP) {
      if (gameState.currentCombat) {
        const attackerId = gameState.currentCombat.attackerId;
        const aiOwnsAttacker = player.field.some(c => c.id === attackerId) ||
                               player.leaderCard?.id === attackerId;

        if (aiOwnsAttacker) {
          return null; // AI is attacker, wait for defender
        } else {
          return this.getDefensiveAction(gameState);
        }
      }
    }

    // Check if it's AI's turn
    if (gameState.activePlayerId !== this.playerId) {
      return this.getDefensiveAction(gameState);
    }

    // Handle different phases
    switch (gameState.phase) {
      case GamePhase.MAIN_PHASE:
        return this.getMainPhaseAction(gameState, player);

      case GamePhase.COMBAT_PHASE:
        return this.getCombatAction(gameState, player);

      case GamePhase.PLAY_EFFECT_STEP:
        return this.getPlayEffectAction(gameState, player);

      case GamePhase.ATTACK_EFFECT_STEP:
        return this.getAttackEffectAction(gameState, player);

      default:
        return null;
    }
  }

  /**
   * Pre-game setup (e.g., Imu's stage play)
   */
  private decidePreGameSetup(gameState: GameState, _player: PlayerState): AIDecision | null {
    const pendingEffects = gameState.pendingPreGameEffects || [];
    const myEffect = pendingEffects.find(e => e.playerId === this.playerId);

    if (!myEffect) return null;

    if (myEffect.validCardIds && myEffect.validCardIds.length > 0) {
      return {
        action: ActionType.PRE_GAME_SELECT,
        data: { cardId: myEffect.validCardIds[0] },
      };
    }

    return {
      action: ActionType.SKIP_PRE_GAME,
      data: {},
    };
  }

  /**
   * Main phase action
   */
  private getMainPhaseAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;

    // 1. Try to play cards
    const cardToPlay = this.strategy.selectCardToPlay(player, activeDon, gameState);
    if (cardToPlay) {
      return {
        action: ActionType.PLAY_CARD,
        data: { cardId: cardToPlay.id },
      };
    }

    // 2. Attach DON
    const donAttachment = this.strategy.selectDonAttachment(player, gameState);
    if (donAttachment) {
      return {
        action: ActionType.ATTACH_DON,
        data: donAttachment,
      };
    }

    // 3. Declare attacks
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);
    if (readyAttackers.length > 0) {
      const target = this.strategy.selectAttackTarget(gameState, player, readyAttackers[0]);
      return {
        action: ActionType.DECLARE_ATTACK,
        data: target,
      };
    }

    // 4. End turn
    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Combat phase action
   */
  private getCombatAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);

    if (readyAttackers.length > 0) {
      const target = this.strategy.selectAttackTarget(gameState, player, readyAttackers[0]);
      return {
        action: ActionType.DECLARE_ATTACK,
        data: target,
      };
    }

    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Handle play effect step
   */
  private getPlayEffectAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const pendingEffect = gameState.pendingPlayEffects?.[0];
    if (!pendingEffect || pendingEffect.playerId !== this.playerId) return null;

    const validTargets = pendingEffect.validTargets || [];

    // Handle ATTACH_DON effects
    if (pendingEffect.effectType === 'ATTACH_DON') {
      const restedDon = player.donField.filter(d => d.state === CardState.RESTED && !d.attachedTo);

      if (restedDon.length === 0) {
        return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
      }

      const donId = restedDon[0].id;
      const targetId = player.leaderCard?.id || player.field[0]?.id;

      if (!targetId) {
        return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
      }

      return {
        action: ActionType.RESOLVE_PLAY_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets: [donId, targetId] },
      };
    }

    // Use strategy for target selection
    if (validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(validTargets, gameState, pendingEffect.effectType);
      return {
        action: ActionType.RESOLVE_PLAY_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    // Skip optional effects with no targets
    if (pendingEffect.minTargets === 0) {
      return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
    }

    return {
      action: ActionType.RESOLVE_PLAY_EFFECT,
      data: { effectId: pendingEffect.id, selectedTargets: [] },
    };
  }

  /**
   * Handle attack effect step
   */
  private getAttackEffectAction(gameState: GameState, _player: PlayerState): AIDecision | null {
    const pendingEffect = gameState.pendingAttackEffects?.[0];
    if (!pendingEffect || pendingEffect.playerId !== this.playerId) return null;

    const validTargets = pendingEffect.validTargets || [];

    if (validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(validTargets, gameState, pendingEffect.description);
      return {
        action: ActionType.RESOLVE_ATTACK_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    if (!pendingEffect.requiresChoice) {
      return { action: ActionType.SKIP_ATTACK_EFFECT, data: { effectId: pendingEffect.id } };
    }

    return {
      action: ActionType.RESOLVE_ATTACK_EFFECT,
      data: { effectId: pendingEffect.id, selectedTargets: [] },
    };
  }

  /**
   * Handle defensive actions
   */
  private getDefensiveAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    switch (gameState.phase) {
      case GamePhase.COUNTER_STEP:
        return this.strategy.decideCounter(gameState, player);

      case GamePhase.BLOCKER_STEP:
        return this.strategy.decideBlock(gameState, player);

      default:
        return null;
    }
  }

  /**
   * Get characters ready to attack
   */
  private getReadyAttackers(player: PlayerState, currentTurn: number): any[] {
    const { cardLoaderService } = require('../CardLoaderService.js');

    return player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      if (card.hasAttacked) return false;

      if (card.turnPlayed === currentTurn) {
        const cardDef = cardLoaderService.getCard(card.cardId);
        if (!cardDef?.keywords?.includes('Rush')) return false;
      }

      return true;
    });
  }

  /**
   * Get AI player ID
   */
  public getPlayerId(): string {
    return this.playerId;
  }

  /**
   * Get AI difficulty
   */
  public getDifficulty(): string {
    return this.difficulty;
  }

  /**
   * Get think delay for this difficulty
   */
  public getThinkDelay(): number {
    return AI_CONFIG[this.difficulty].thinkDelay;
  }
}

// Factory function to create AI players
export function createAIPlayer(difficulty: DifficultyLevel = 'medium'): AIService {
  const aiPlayerId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return new AIService(aiPlayerId, difficulty);
}

// Re-export types
export type { AIDecision } from './types.js';
