/**
 * ThreatAssessor - Identifies and prioritizes dangerous opponent cards
 */

import { PlayerState, GameCard } from '@optcgsim/shared';
import { ThreatCard, ThreatReason } from '../types.js';
import { THREAT_THRESHOLDS } from '../config.js';
import { cardLoaderService } from '../../CardLoaderService.js';

export class ThreatAssessor {
  /**
   * Assess all threats on opponent's field
   */
  assessThreats(opponent: PlayerState): ThreatCard[] {
    const threats = opponent.field.map(card => this.assessCard(card));

    // Also assess leader if it has dangerous effects
    if (opponent.leaderCard) {
      const leaderThreat = this.assessCard(opponent.leaderCard);
      if (leaderThreat.threatLevel > 0) {
        threats.push(leaderThreat);
      }
    }

    // Sort by threat level (highest first)
    return threats.sort((a, b) => b.threatLevel - a.threatLevel);
  }

  /**
   * Get only high-priority threats that need immediate response
   */
  getCriticalThreats(opponent: PlayerState): ThreatCard[] {
    return this.assessThreats(opponent)
      .filter(t => t.threatLevel >= THREAT_THRESHOLDS.criticalThreat);
  }

  /**
   * Get moderate threats worth considering
   */
  getModerateThreats(opponent: PlayerState): ThreatCard[] {
    return this.assessThreats(opponent)
      .filter(t => t.threatLevel >= THREAT_THRESHOLDS.moderateThreat);
  }

  /**
   * Find the highest threat card that can be KO'd with given power
   */
  findBestKOTarget(opponent: PlayerState, attackPower: number): ThreatCard | null {
    const threats = this.assessThreats(opponent);

    for (const threat of threats) {
      const cardPower = threat.card.power || 0;
      // Can only KO rested characters
      if (threat.card.state === 'RESTED' && cardPower <= attackPower) {
        return threat;
      }
    }

    return null;
  }

  /**
   * Assess threat level of a single card
   */
  assessCard(card: GameCard): ThreatCard {
    const cardDef = cardLoaderService.getCard(card.cardId);
    const reasons: ThreatReason[] = [];
    let threatLevel = 0;

    const power = card.power || 0;

    // High power threat
    if (power >= THREAT_THRESHOLDS.highPower) {
      threatLevel += 3;
      reasons.push(ThreatReason.HIGH_POWER);
    } else if (power >= 5000) {
      threatLevel += 1;
    }

    // Keyword threats - use runtime keywords first, fall back to static
    const keywords = card.keywords?.length ? card.keywords : cardDef?.keywords;
    if (keywords) {
      if (keywords.includes('Rush')) {
        threatLevel += 2;
        reasons.push(ThreatReason.RUSH_KEYWORD);
      }

      if (keywords.includes('Double Attack')) {
        threatLevel += 4;
        reasons.push(ThreatReason.DOUBLE_ATTACK);
      }

      if (keywords.includes('Blocker')) {
        threatLevel += 1;
        reasons.push(ThreatReason.BLOCKER);
      }

      if (keywords.includes('Banish')) {
        threatLevel += 2;
        reasons.push(ThreatReason.DANGEROUS_EFFECT);
      }
    }

    // Effect-based threats
    if (cardDef?.effects) {
      // Cards with ON_ATTACK effects are dangerous
      const hasOnAttackEffect = cardDef.effects.some(e =>
        e.trigger === 'ON_ATTACK'
      );
      if (hasOnAttackEffect) {
        threatLevel += 2;
        reasons.push(ThreatReason.DANGEROUS_EFFECT);
      }

      // Cards with recurring draw/search effects
      const hasDrawEffect = cardDef.effects.some(e =>
        e.effects?.some(action =>
          action.type === 'DRAW_CARDS' || action.type === 'SEARCH_DECK'
        )
      );
      if (hasDrawEffect) {
        threatLevel += 1;
        reasons.push(ThreatReason.DANGEROUS_EFFECT);
      }

      // Cards with KO effects
      const hasKOEffect = cardDef.effects.some(e =>
        e.effects?.some(action => {
          const actionType = action.type as string;
          return actionType === 'KO_CHARACTER' || actionType === 'TRASH_CHARACTER';
        })
      );
      if (hasKOEffect) {
        threatLevel += 2;
        reasons.push(ThreatReason.DANGEROUS_EFFECT);
      }
    }

    // Low cost high value (efficient cards)
    if (cardDef?.cost && cardDef.cost <= 3 && power >= 5000) {
      threatLevel += 1;
      reasons.push(ThreatReason.LOW_COST_HIGH_VALUE);
    }

    return {
      card,
      threatLevel: Math.min(10, threatLevel),
      reasons,
    };
  }

  /**
   * Check if a card poses immediate danger (can attack this turn)
   */
  isImmediateThreat(card: GameCard, turnPlayed: number, currentTurn: number): boolean {
    // Check runtime keywords first (includes granted Rush from effects)
    if (card.keywords?.includes('Rush')) {
      return true;
    }

    // Fall back to static definition
    const cardDef = cardLoaderService.getCard(card.cardId);
    if (cardDef?.keywords?.includes('Rush')) {
      return true;
    }

    // Card played on previous turn can attack
    return turnPlayed < currentTurn;
  }

  /**
   * Get total threat score for opponent's board
   */
  getBoardThreatScore(opponent: PlayerState): number {
    return this.assessThreats(opponent)
      .reduce((total, threat) => total + threat.threatLevel, 0);
  }
}
