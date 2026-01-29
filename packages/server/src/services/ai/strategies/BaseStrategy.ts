/**
 * BaseStrategy - Abstract base class for AI difficulty strategies
 */

import {
  GameState,
  PlayerState,
  GameCard,
  CardState,
} from '@optcgsim/shared';
import { AIDecision, AttackTarget, DifficultyLevel, GameSituation } from '../types.js';
import { DifficultyConfig, AI_CONFIG } from '../config.js';
import { BoardEvaluator } from '../evaluators/BoardEvaluator.js';
import { cardLoaderService } from '../../CardLoaderService.js';

export abstract class BaseStrategy {
  protected playerId: string;
  protected difficulty: DifficultyLevel;
  protected config: DifficultyConfig;
  protected boardEvaluator: BoardEvaluator;

  constructor(playerId: string, difficulty: DifficultyLevel) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.config = AI_CONFIG[difficulty];
    this.boardEvaluator = new BoardEvaluator();
  }

  // ============================================
  // ABSTRACT METHODS - Must be implemented by each difficulty
  // ============================================

  abstract decideMulligan(player: PlayerState): AIDecision;
  abstract selectCardToPlay(player: PlayerState, availableDon: number, gameState: GameState): GameCard | null;
  abstract selectDonAttachment(player: PlayerState, gameState: GameState): { donId: string; targetId: string } | null;
  abstract selectAttackTarget(gameState: GameState, player: PlayerState, attacker: GameCard): AttackTarget;
  abstract decideBlock(gameState: GameState, player: PlayerState): AIDecision | null;
  abstract decideCounter(gameState: GameState, player: PlayerState): AIDecision | null;
  abstract selectEffectTargets(validTargets: string[], gameState: GameState, effectType?: string): string[];

  // ============================================
  // SHARED HELPER METHODS - Available to all strategies
  // ============================================

  /**
   * Get the opponent's player state
   */
  protected getOpponent(gameState: GameState): PlayerState {
    const opponentId = Object.keys(gameState.players).find(id => id !== this.playerId)!;
    return gameState.players[opponentId];
  }

  /**
   * Assess current game situation
   */
  protected assessSituation(gameState: GameState): GameSituation {
    return this.boardEvaluator.assessSituation(gameState, this.playerId);
  }

  /**
   * Get characters ready to attack
   */
  protected getReadyAttackers(player: PlayerState, currentTurn: number): GameCard[] {
    return player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      if (card.hasAttacked) return false;

      // Check if can attack (Rush or not played this turn)
      if (card.turnPlayed === currentTurn) {
        const cardDef = cardLoaderService.getCard(card.cardId);
        if (!cardDef?.keywords?.includes('Rush')) return false;
      }

      return true;
    });
  }

  /**
   * Get available blockers
   */
  protected getAvailableBlockers(player: PlayerState): GameCard[] {
    return player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      const cardDef = cardLoaderService.getCard(card.cardId);
      return cardDef?.keywords?.includes('Blocker');
    });
  }

  /**
   * Get counter cards from hand
   */
  protected getCounterCards(player: PlayerState): { card: GameCard; counterValue: number }[] {
    return player.hand
      .map(card => {
        const cardDef = cardLoaderService.getCard(card.cardId);
        return {
          card,
          counterValue: cardDef?.counter || 0,
        };
      })
      .filter(c => c.counterValue > 0)
      .sort((a, b) => b.counterValue - a.counterValue); // Sort by counter value descending
  }

  /**
   * Calculate attack power including attached DON
   */
  protected calculateAttackPower(attacker: GameCard, player: PlayerState): number {
    const attachedDon = player.donField.filter(d => d.attachedTo === attacker.id).length;
    return (attacker.power || 0) + (attachedDon * 1000);
  }

  /**
   * Get playable cards from hand
   */
  protected getPlayableCards(player: PlayerState, availableDon: number): { card: GameCard; def: any }[] {
    return player.hand
      .filter(card => {
        const cardDef = cardLoaderService.getCard(card.cardId);
        if (!cardDef || cardDef.cost === null) return false;
        return cardDef.cost <= availableDon && cardDef.type === 'CHARACTER';
      })
      .map(card => ({
        card,
        def: cardLoaderService.getCard(card.cardId)!,
      }));
  }

  /**
   * Get active (unattached) DON cards
   */
  protected getActiveDon(player: PlayerState): GameCard[] {
    return player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
  }

  /**
   * Count attached DON on a card
   */
  protected countAttachedDon(card: GameCard, player: PlayerState): number {
    return player.donField.filter(d => d.attachedTo === card.id).length;
  }

  /**
   * Check if card has a specific keyword
   */
  protected hasKeyword(card: GameCard, keyword: string): boolean {
    const cardDef = cardLoaderService.getCard(card.cardId);
    return cardDef?.keywords?.includes(keyword) || false;
  }

  /**
   * Get card definition
   */
  protected getCardDef(card: GameCard) {
    return cardLoaderService.getCard(card.cardId);
  }

  /**
   * Random chance helper for Easy AI mistakes
   */
  protected shouldMakeMistake(): boolean {
    return Math.random() < this.config.mistakeChance;
  }

  /**
   * Log AI decision (for debugging)
   */
  protected log(message: string, data?: any): void {
    if (process.env.AI_DEBUG === 'true') {
      console.log(`[AI:${this.difficulty}] ${message}`, data || '');
    }
  }
}
