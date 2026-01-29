/**
 * HardStrategy - Advanced strategic AI
 *
 * Uses threat assessment, lethal calculation, and efficient resource
 * management to make optimal decisions.
 */

import {
  GameState,
  PlayerState,
  GameCard,
  CardState,
  ActionType,
} from '@optcgsim/shared';
import { AIDecision, AttackTarget, ThreatCard } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';
import { ThreatAssessor } from '../evaluators/ThreatAssessor.js';
import { LethalCalculator } from '../evaluators/LethalCalculator.js';

export class HardStrategy extends BaseStrategy {
  private threatAssessor: ThreatAssessor;
  private lethalCalculator: LethalCalculator;

  constructor(playerId: string, difficulty: 'easy' | 'basic' | 'medium' | 'hard') {
    super(playerId, difficulty);
    this.threatAssessor = new ThreatAssessor();
    this.lethalCalculator = new LethalCalculator();
  }

  /**
   * Mulligan decision - full curve + synergy + counter evaluation
   */
  decideMulligan(player: PlayerState): AIDecision {
    let score = 0;

    // Evaluate mana curve
    const costDistribution: Record<number, number> = {};
    player.hand.forEach(card => {
      const cardDef = this.getCardDef(card);
      const cost = cardDef?.cost || 0;
      costDistribution[cost] = (costDistribution[cost] || 0) + 1;
    });

    // Want at least 1 card each at cost 2, 3, 4
    if (costDistribution[2]) score += 0.2;
    if (costDistribution[3]) score += 0.2;
    if (costDistribution[4]) score += 0.15;

    // Penalize too many high cost cards
    const highCostCount = (costDistribution[6] || 0) + (costDistribution[7] || 0) +
                          (costDistribution[8] || 0) + (costDistribution[9] || 0);
    if (highCostCount > 1) score -= 0.1 * (highCostCount - 1);

    // Evaluate counter potential
    const counterCards = player.hand.filter(card => {
      const cardDef = this.getCardDef(card);
      return cardDef && cardDef.counter && cardDef.counter > 0;
    });
    score += Math.min(0.2, counterCards.length * 0.1);

    // Evaluate keywords
    const hasRush = player.hand.some(card => this.hasKeyword(card, 'Rush'));
    const hasBlocker = player.hand.some(card => this.hasKeyword(card, 'Blocker'));
    if (hasRush) score += 0.1;
    if (hasBlocker) score += 0.1;

    // Evaluate playability (can we play something early?)
    const earlyPlays = player.hand.filter(card => {
      const cardDef = this.getCardDef(card);
      return cardDef && cardDef.cost !== null && cardDef.cost >= 2 && cardDef.cost <= 4;
    });
    score += Math.min(0.3, earlyPlays.length * 0.15);

    const shouldKeep = score >= this.config.mulliganThreshold;

    this.log(`Mulligan evaluation: score=${score.toFixed(2)}, threshold=${this.config.mulliganThreshold}`, {
      curve: costDistribution,
      counters: counterCards.length,
      hasRush,
      hasBlocker,
      earlyPlays: earlyPlays.length,
    });

    return {
      action: shouldKeep ? ActionType.KEEP_HAND : ActionType.MULLIGAN,
      data: {},
    };
  }

  /**
   * Select card to play - threat response + tempo awareness
   */
  selectCardToPlay(player: PlayerState, availableDon: number, gameState: GameState): GameCard | null {
    const playableCards = this.getPlayableCards(player, availableDon);
    if (playableCards.length === 0) return null;

    const situation = this.assessSituation(gameState);
    const opponent = this.getOpponent(gameState);
    const threats = this.threatAssessor.getCriticalThreats(opponent);

    // Check for lethal opportunity - if we have it, don't play more cards
    const lethal = this.lethalCalculator.calculateLethal(gameState, this.playerId);
    if (lethal?.hasLethal) {
      this.log('Lethal available - not playing more cards');
      return null;
    }

    // Score each playable card
    const scoredCards = playableCards.map(({ card, def }) => {
      let score = def.cost || 0; // Base score is cost (higher = generally better)

      // Adjust for situation
      if (situation.tempo === 'behind') {
        // Prioritize defensive cards when behind
        if (def.keywords?.includes('Blocker')) score += 3;
        if (def.keywords?.includes('Rush')) score -= 1; // Rush less valuable when behind
      } else if (situation.tempo === 'ahead') {
        // Prioritize aggressive cards when ahead
        if (def.keywords?.includes('Rush')) score += 2;
        if (def.keywords?.includes('Double Attack')) score += 3;
      }

      // Critical life - need blockers
      if (situation.lifeState === 'critical' && def.keywords?.includes('Blocker')) {
        score += 5;
      }

      // Consider if this card can remove a threat
      // Cards with KO effects are valuable when threats exist
      if (threats.length > 0) {
        const hasRemoval = def.effects?.some(e =>
          e.effects?.some(a => a.type === 'KO_CHARACTER' || a.type === 'TRASH_CHARACTER')
        );
        if (hasRemoval) score += 3;
      }

      // Penalize holding back in late game
      if (situation.phase === 'late') {
        score += 1; // Prefer playing cards in late game
      }

      return { card, def, score };
    });

    // Sort by score and play highest
    scoredCards.sort((a, b) => b.score - a.score);

    this.log('Card play decision', {
      chosen: scoredCards[0].def.name,
      score: scoredCards[0].score,
      situation: situation.tempo,
    });

    return scoredCards[0].card;
  }

  /**
   * Select DON attachment - optimal for lethal or KOs
   */
  selectDonAttachment(player: PlayerState, gameState: GameState): { donId: string; targetId: string } | null {
    const activeDon = this.getActiveDon(player);
    if (activeDon.length === 0) return null;

    const attackers = player.field.filter(c => c.state === CardState.ACTIVE && !c.hasAttacked);
    if (attackers.length === 0) return null;

    const opponent = this.getOpponent(gameState);

    // Check for lethal - attach DON optimally for lethal
    const lethal = this.lethalCalculator.calculateLethal(gameState, this.playerId);
    if (lethal?.hasLethal && lethal.donAttachments.length > 0) {
      const nextAttachment = lethal.donAttachments[0];
      const targetCard = attackers.find(a => a.id === nextAttachment.targetId);
      if (targetCard && this.countAttachedDon(targetCard, player) < 3) {
        this.log('Attaching DON for lethal', { target: nextAttachment.targetId });
        return { donId: activeDon[0].id, targetId: nextAttachment.targetId };
      }
    }

    // Calculate optimal attachment for character KOs
    for (const attacker of attackers) {
      const currentPower = this.calculateAttackPower(attacker, player);
      const attachedCount = this.countAttachedDon(attacker, player);

      if (attachedCount >= 3) continue;

      // Find best KO target with this attacker
      const bestTarget = this.threatAssessor.findBestKOTarget(opponent, currentPower + 1000);
      if (bestTarget && bestTarget.card.power && bestTarget.card.power > currentPower) {
        // This DON would enable a KO
        this.log('Attaching DON to enable KO', {
          attacker: attacker.id,
          target: bestTarget.card.id,
          threat: bestTarget.threatLevel,
        });
        return { donId: activeDon[0].id, targetId: attacker.id };
      }
    }

    // No KO opportunity - attach to enable leader damage
    const leaderPower = opponent.leaderCard?.power || 5000;
    for (const attacker of attackers) {
      const currentPower = this.calculateAttackPower(attacker, player);
      const attachedCount = this.countAttachedDon(attacker, player);

      if (attachedCount >= 3) continue;

      // Would this DON enable hitting leader?
      if (currentPower < leaderPower && currentPower + 1000 >= leaderPower) {
        this.log('Attaching DON to hit leader');
        return { donId: activeDon[0].id, targetId: attacker.id };
      }
    }

    // Default: attach to highest power attacker that isn't maxed
    const sortedAttackers = [...attackers]
      .filter(a => this.countAttachedDon(a, player) < 3)
      .sort((a, b) => (b.power || 0) - (a.power || 0));

    if (sortedAttackers.length > 0) {
      this.log('Attaching DON to strongest attacker (default)');
      return { donId: activeDon[0].id, targetId: sortedAttackers[0].id };
    }

    return null;
  }

  /**
   * Select attack target - full threat assessment + sequencing
   */
  selectAttackTarget(gameState: GameState, player: PlayerState, attacker: GameCard): AttackTarget {
    const opponent = this.getOpponent(gameState);
    const attackPower = this.calculateAttackPower(attacker, player);

    // Check for lethal first
    const lethal = this.lethalCalculator.calculateLethal(gameState, this.playerId);
    if (lethal?.hasLethal) {
      this.log('Going for lethal - attacking leader');
      return {
        attackerId: attacker.id,
        targetId: opponent.leaderCard?.id || Object.keys(gameState.players).find(id => id !== this.playerId)!,
        targetType: 'leader',
      };
    }

    // Find KO-able threats
    const bestKOTarget = this.threatAssessor.findBestKOTarget(opponent, attackPower);
    if (bestKOTarget) {
      this.log('Attacking highest threat KO target', {
        target: bestKOTarget.card.id,
        threat: bestKOTarget.threatLevel,
        reasons: bestKOTarget.reasons,
      });
      return {
        attackerId: attacker.id,
        targetId: bestKOTarget.card.id,
        targetType: 'character',
      };
    }

    // No good KO targets - evaluate leader attack vs. board control
    const situation = this.assessSituation(gameState);

    // If ahead, push damage to close game
    if (situation.tempo === 'ahead' || opponent.life <= 2) {
      this.log('Attacking leader (pushing advantage)');
      return {
        attackerId: attacker.id,
        targetId: opponent.leaderCard?.id || Object.keys(gameState.players).find(id => id !== this.playerId)!,
        targetType: 'leader',
      };
    }

    // Default to leader attack
    this.log('Attacking leader (default)');
    return {
      attackerId: attacker.id,
      targetId: opponent.leaderCard?.id || Object.keys(gameState.players).find(id => id !== this.playerId)!,
      targetType: 'leader',
    };
  }

  /**
   * Decide whether to block - value assessment + life management
   */
  decideBlock(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    // Only consider blocking leader attacks (for now)
    if (gameState.currentCombat.targetType !== 'leader') {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    const attackPower = gameState.currentCombat.attackPower;
    const blockers = this.getAvailableBlockers(player);

    if (blockers.length === 0) {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    const situation = this.assessSituation(gameState);

    // Critical life - must block if possible
    if (situation.lifeState === 'critical') {
      // Find best blocker (preferring one that survives)
      const survivingBlockers = blockers.filter(b => (b.power || 0) >= attackPower);

      if (survivingBlockers.length > 0) {
        // Use lowest power surviving blocker
        survivingBlockers.sort((a, b) => (a.power || 0) - (b.power || 0));
        this.log('Critical life - blocking with surviving blocker');
        return {
          action: ActionType.SELECT_BLOCKER,
          data: { blockerId: survivingBlockers[0].id },
        };
      }

      // No surviving blocker - sacrifice lowest value one
      blockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      this.log('Critical life - sacrificing blocker');
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: blockers[0].id },
      };
    }

    // Moderate life - block efficiently
    if (situation.lifeState === 'moderate') {
      const survivingBlockers = blockers.filter(b => (b.power || 0) >= attackPower);
      if (survivingBlockers.length > 0) {
        survivingBlockers.sort((a, b) => (a.power || 0) - (b.power || 0));
        this.log('Moderate life - blocking with surviving blocker');
        return {
          action: ActionType.SELECT_BLOCKER,
          data: { blockerId: survivingBlockers[0].id },
        };
      }
    }

    // Safe life - only block with surviving blockers
    const survivingBlockers = blockers.filter(b => (b.power || 0) >= attackPower);
    if (survivingBlockers.length > 0) {
      survivingBlockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      this.log('Safe blocking with surviving blocker');
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: survivingBlockers[0].id },
      };
    }

    // Don't sacrifice blockers when safe
    this.log('Preserving blockers - not blocking');
    return { action: ActionType.PASS_PRIORITY, data: {} };
  }

  /**
   * Decide whether to use counters - efficient resource management
   */
  decideCounter(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    const attackPower = gameState.currentCombat.attackPower;
    const targetId = gameState.currentCombat.targetId;

    let defenderPower = 0;
    if (gameState.currentCombat.targetType === 'leader') {
      defenderPower = player.leaderCard?.power || 5000;
    } else {
      const targetCard = player.field.find(c => c.id === targetId);
      defenderPower = targetCard?.power || 0;
    }

    defenderPower += gameState.currentCombat.counterPower || 0;
    const powerGap = attackPower - defenderPower;

    if (powerGap <= 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    const counterCards = this.getCounterCards(player);
    if (counterCards.length === 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    const situation = this.assessSituation(gameState);

    // Calculate optimal counters - minimum needed to survive
    let counterPower = 0;
    const countersToUse: string[] = [];

    // Sort by counter value (use highest value first for efficiency)
    for (const { card, counterValue } of counterCards) {
      if (counterPower >= powerGap) break;

      counterPower += counterValue;
      countersToUse.push(card.id);
    }

    // Evaluate if countering is worth it
    if (counterPower >= powerGap) {
      // Consider hand size - don't burn all counters if safe
      if (situation.lifeState === 'safe' && countersToUse.length > 2 && player.life > 3) {
        // Maybe better to take damage and keep counters
        this.log('Safe - taking damage to preserve counters');
        return { action: ActionType.PASS_COUNTER, data: {} };
      }

      this.log('Using optimal counters', {
        count: countersToUse.length,
        power: counterPower,
        gap: powerGap,
      });
      return {
        action: ActionType.USE_COUNTER,
        data: { cardIds: countersToUse },
      };
    }

    // Can't survive - don't waste counters
    this.log('Cannot survive - not countering');
    return { action: ActionType.PASS_COUNTER, data: {} };
  }

  /**
   * Select effect targets - threat-based priority
   */
  selectEffectTargets(validTargets: string[], gameState: GameState, effectType?: string): string[] {
    if (validTargets.length === 0) return [];

    const opponent = this.getOpponent(gameState);
    const player = gameState.players[this.playerId];

    // For KO/removal effects, target highest threat
    if (effectType?.includes('KO') || effectType?.includes('TRASH') || effectType?.includes('RETURN')) {
      const opponentTargets = validTargets.filter(id =>
        opponent.field.some(c => c.id === id)
      );

      if (opponentTargets.length > 0) {
        // Use threat assessor to find best target
        const threats = this.threatAssessor.assessThreats(opponent);
        const targetableThreats = threats.filter(t => opponentTargets.includes(t.card.id));

        if (targetableThreats.length > 0) {
          this.log('Targeting highest threat for removal', {
            target: targetableThreats[0].card.id,
            threat: targetableThreats[0].threatLevel,
          });
          return [targetableThreats[0].card.id];
        }
      }
    }

    // For buff effects, target best attacker
    if (effectType?.includes('BUFF') || effectType?.includes('POWER')) {
      const myTargets = validTargets.filter(id =>
        player.field.some(c => c.id === id) || player.leaderCard?.id === id
      );

      if (myTargets.length > 0) {
        // Prefer attackers that haven't attacked yet
        const attackers = player.field
          .filter(c => myTargets.includes(c.id) && !c.hasAttacked && c.state === CardState.ACTIVE)
          .sort((a, b) => (b.power || 0) - (a.power || 0));

        if (attackers.length > 0) {
          this.log('Buffing best available attacker');
          return [attackers[0].id];
        }
      }
    }

    // Default: first valid target
    return [validTargets[0]];
  }
}
