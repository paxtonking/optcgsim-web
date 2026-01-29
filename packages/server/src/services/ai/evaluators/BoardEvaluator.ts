/**
 * BoardEvaluator - Scores game positions to determine advantage
 */

import { GameState, PlayerState, CardState } from '@optcgsim/shared';
import { BoardScore, GameSituation } from '../types.js';
import { BOARD_WEIGHTS, LIFE_THRESHOLDS } from '../config.js';

export class BoardEvaluator {
  /**
   * Evaluate the board position for a player
   * Positive score = ahead, negative = behind, 0 = even
   */
  evaluate(gameState: GameState, playerId: string): BoardScore {
    const player = gameState.players[playerId];
    const opponentId = Object.keys(gameState.players).find(id => id !== playerId)!;
    const opponent = gameState.players[opponentId];

    if (!player || !opponent) {
      return { total: 0, breakdown: { fieldPresence: 0, handAdvantage: 0, lifeAdvantage: 0, donAdvantage: 0, tempo: 0 } };
    }

    const breakdown = {
      fieldPresence: this.scoreFieldPresence(player, opponent),
      handAdvantage: this.scoreHandAdvantage(player, opponent),
      lifeAdvantage: this.scoreLifeAdvantage(player, opponent),
      donAdvantage: this.scoreDonAdvantage(player, opponent),
      tempo: this.scoreTempo(player, opponent, gameState),
    };

    const total =
      breakdown.fieldPresence * BOARD_WEIGHTS.fieldPresence +
      breakdown.handAdvantage * BOARD_WEIGHTS.handAdvantage +
      breakdown.lifeAdvantage * BOARD_WEIGHTS.lifeAdvantage +
      breakdown.donAdvantage * BOARD_WEIGHTS.donAdvantage +
      breakdown.tempo * BOARD_WEIGHTS.tempo;

    return { total, breakdown };
  }

  /**
   * Assess the overall game situation
   */
  assessSituation(gameState: GameState, playerId: string): GameSituation {
    const score = this.evaluate(gameState, playerId);
    const player = gameState.players[playerId];

    // Determine game phase based on turn
    let phase: 'early' | 'mid' | 'late';
    if (gameState.turn <= 3) {
      phase = 'early';
    } else if (gameState.turn <= 7) {
      phase = 'mid';
    } else {
      phase = 'late';
    }

    // Determine tempo
    let tempo: 'ahead' | 'even' | 'behind';
    if (score.total > 2) {
      tempo = 'ahead';
    } else if (score.total < -2) {
      tempo = 'behind';
    } else {
      tempo = 'even';
    }

    // Determine pressure
    let pressure: 'applying' | 'receiving' | 'neutral';
    if (gameState.activePlayerId === playerId && score.breakdown.fieldPresence > 0) {
      pressure = 'applying';
    } else if (score.breakdown.fieldPresence < -2) {
      pressure = 'receiving';
    } else {
      pressure = 'neutral';
    }

    // Determine resource state
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;
    let resourceState: 'flush' | 'stable' | 'constrained';
    if (activeDon >= 6 && player.hand.length >= 4) {
      resourceState = 'flush';
    } else if (activeDon >= 3 || player.hand.length >= 2) {
      resourceState = 'stable';
    } else {
      resourceState = 'constrained';
    }

    // Determine life state
    let lifeState: 'safe' | 'moderate' | 'critical';
    if (player.life >= LIFE_THRESHOLDS.safe) {
      lifeState = 'safe';
    } else if (player.life >= LIFE_THRESHOLDS.moderate) {
      lifeState = 'moderate';
    } else {
      lifeState = 'critical';
    }

    return { phase, tempo, pressure, resourceState, lifeState };
  }

  /**
   * Score field presence (characters on board)
   */
  private scoreFieldPresence(player: PlayerState, opponent: PlayerState): number {
    const playerPower = this.calculateFieldPower(player);
    const opponentPower = this.calculateFieldPower(opponent);

    // Normalize to -5 to +5 range
    const powerDiff = (playerPower - opponentPower) / 5000;
    const countDiff = (player.field.length - opponent.field.length) * 0.5;

    return Math.max(-5, Math.min(5, powerDiff + countDiff));
  }

  /**
   * Calculate total power on field
   */
  private calculateFieldPower(player: PlayerState): number {
    return player.field.reduce((total, card) => total + (card.power || 0), 0);
  }

  /**
   * Score hand advantage
   */
  private scoreHandAdvantage(player: PlayerState, opponent: PlayerState): number {
    const handDiff = player.hand.length - opponent.hand.length;
    // Each card difference is worth ~0.5 points, capped at +-3
    return Math.max(-3, Math.min(3, handDiff * 0.5));
  }

  /**
   * Score life advantage (very important)
   */
  private scoreLifeAdvantage(player: PlayerState, opponent: PlayerState): number {
    const lifeDiff = player.life - opponent.life;
    // Life is critical - each point matters a lot
    return Math.max(-5, Math.min(5, lifeDiff * 1.5));
  }

  /**
   * Score DON advantage
   */
  private scoreDonAdvantage(player: PlayerState, opponent: PlayerState): number {
    const playerActiveDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;
    const opponentActiveDon = opponent.donField.filter(d => d.state === CardState.ACTIVE).length;

    const donDiff = playerActiveDon - opponentActiveDon;
    return Math.max(-2, Math.min(2, donDiff * 0.3));
  }

  /**
   * Score tempo (who is on the offensive)
   */
  private scoreTempo(player: PlayerState, opponent: PlayerState, gameState: GameState): number {
    let tempo = 0;

    // Active player has tempo
    if (gameState.activePlayerId === player.id) {
      tempo += 1;
    }

    // More active characters = more tempo
    const playerActive = player.field.filter(c => c.state === CardState.ACTIVE).length;
    const opponentActive = opponent.field.filter(c => c.state === CardState.ACTIVE).length;
    tempo += (playerActive - opponentActive) * 0.3;

    // Rested characters can't block - opponent is vulnerable
    const opponentRested = opponent.field.filter(c => c.state === CardState.RESTED).length;
    tempo += opponentRested * 0.2;

    return Math.max(-3, Math.min(3, tempo));
  }

  /**
   * Check if player is winning (positive) or losing (negative)
   */
  isAhead(gameState: GameState, playerId: string): boolean {
    const score = this.evaluate(gameState, playerId);
    return score.total > 1;
  }

  isBehind(gameState: GameState, playerId: string): boolean {
    const score = this.evaluate(gameState, playerId);
    return score.total < -1;
  }
}
