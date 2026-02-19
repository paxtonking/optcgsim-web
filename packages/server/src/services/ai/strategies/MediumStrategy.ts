/**
 * MediumStrategy - Solid fundamentals, reasonable decisions
 *
 * This is the baseline strategy that ports the original AI logic
 * with some improvements for keyword awareness and threat recognition.
 */

import {
  GameState,
  PlayerState,
  GameCard,
  CardState,
  ActionType,
} from '@optcgsim/shared';
import { AIDecision, AttackTarget } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';

export class MediumStrategy extends BaseStrategy {
  /**
   * Mulligan decision - evaluate mana curve
   */
  decideMulligan(player: PlayerState): AIDecision {
    // Evaluate hand quality based on curve
    const playableEarly = player.hand.filter(card => {
      const cardDef = this.getCardDef(card);
      return cardDef && cardDef.cost !== null && cardDef.cost >= 2 && cardDef.cost <= 4;
    });

    const hasCounter = player.hand.some(card => {
      const cardDef = this.getCardDef(card);
      return cardDef && cardDef.counter && cardDef.counter > 0;
    });

    // Keep if: 2+ early plays AND has counter potential
    const shouldKeep = playableEarly.length >= 2 || (playableEarly.length >= 1 && hasCounter);

    this.log(`Mulligan decision: ${shouldKeep ? 'KEEP' : 'MULLIGAN'}`, {
      earlyPlays: playableEarly.length,
      hasCounter,
    });

    return {
      action: shouldKeep ? ActionType.KEEP_HAND : ActionType.MULLIGAN,
      data: {},
    };
  }

  /**
   * Select card to play - consider board state and keywords
   */
  selectCardToPlay(player: PlayerState, availableDon: number, gameState: GameState): GameCard | null {
    let playableCards = this.getPlayableCards(player, availableDon);
    if (playableCards.length === 0) return null;

    // Filter out STAGE if player already has one in play
    if (player.stage) {
      playableCards = playableCards.filter(c => c.def.type !== 'STAGE');
      if (playableCards.length === 0) return null;
    }

    const situation = this.assessSituation(gameState);

    // Separate by type for priority ordering
    const events = playableCards.filter(c => c.def.type === 'EVENT');
    const characters = playableCards.filter(c => c.def.type === 'CHARACTER');
    const stages = playableCards.filter(c => c.def.type === 'STAGE');

    // Use runtime keywords for keyword checks
    const hasKeyword = (c: { card: GameCard; def: any }, kw: string) => {
      if (c.card.keywords?.length) return c.card.keywords.includes(kw);
      return c.def.keywords?.includes(kw) || false;
    };

    // Priority 1: Events first (they resolve immediately and don't take field space)
    if (events.length > 0) {
      // Sort events by cost (highest first for maximum impact)
      events.sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0));
      this.log('Playing event card', { cost: events[0].def.cost });
      return events[0].card;
    }

    // Priority 2: Characters with situation-aware logic
    if (characters.length > 0) {
      characters.sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0));

      // If behind, prioritize Blockers
      if (situation.tempo === 'behind' || situation.lifeState === 'critical') {
        const blockers = characters.filter(c => hasKeyword(c, 'Blocker'));
        if (blockers.length > 0) {
          this.log('Playing Blocker due to defensive situation');
          return blockers[0].card;
        }
      }

      // If ahead or early game, prioritize Rush for pressure
      if ((situation.tempo === 'ahead' || situation.phase === 'early') && player.field.length < 4) {
        const rushCards = characters.filter(c => hasKeyword(c, 'Rush'));
        if (rushCards.length > 0) {
          this.log('Playing Rush card for pressure');
          return rushCards[0].card;
        }
      }

      // Default: play highest cost character
      this.log('Playing highest cost character', { cost: characters[0].def.cost });
      return characters[0].card;
    }

    // Priority 3: Stages (if no better play)
    if (stages.length > 0) {
      this.log('Playing stage card', { cost: stages[0].def.cost });
      return stages[0].card;
    }

    return null;
  }

  /**
   * Select DON attachment - enable KOs or maximize damage
   */
  selectDonAttachment(player: PlayerState, gameState: GameState): { donId: string; targetId: string } | null {
    const activeDon = this.getActiveDon(player);
    if (activeDon.length === 0) return null;

    // Get active characters that can attack
    const attackers = player.field.filter(c => c.state === CardState.ACTIVE);
    if (attackers.length === 0) return null;

    const opponent = this.getOpponent(gameState);

    // Strategy: Enable character KOs first
    for (const attacker of attackers) {
      const currentPower = this.calculateAttackPower(attacker, player);
      const attachedCount = this.countAttachedDon(attacker, player);

      if (attachedCount >= 3) continue; // Max 3 DON per character

      // Check if +1000 would enable a KO
      for (const target of opponent.field) {
        if (target.state !== CardState.RESTED) continue;
        const targetPower = target.power || 0;

        if (currentPower < targetPower && currentPower + 1000 >= targetPower) {
          this.log('Attaching DON to enable KO', { attacker: attacker.id, target: target.id });
          return { donId: activeDon[0].id, targetId: attacker.id };
        }
      }
    }

    // Default: attach to highest power attacker
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));
    for (const attacker of sortedAttackers) {
      const attachedCount = this.countAttachedDon(attacker, player);
      if (attachedCount < 3) {
        this.log('Attaching DON to strongest attacker');
        return { donId: activeDon[0].id, targetId: attacker.id };
      }
    }

    return null;
  }

  /**
   * Select attack target - prioritize threats
   */
  selectAttackTarget(gameState: GameState, player: PlayerState, attacker: GameCard): AttackTarget {
    const opponent = this.getOpponent(gameState);
    const attackPower = this.calculateAttackPower(attacker, player);

    // Find KO-able characters (prioritize threats)
    const koableCharacters = opponent.field.filter(c => {
      const charPower = c.power || 0;
      return charPower <= attackPower && c.state === CardState.RESTED;
    });

    if (koableCharacters.length > 0) {
      // Prioritize by threat level
      const prioritized = koableCharacters
        .map(c => ({
          card: c,
          threat: this.assessCardThreat(c),
        }))
        .sort((a, b) => b.threat - a.threat);

      this.log('Attacking highest threat KO-able character', {
        target: prioritized[0].card.id,
        threat: prioritized[0].threat,
      });

      return {
        attackerId: attacker.id,
        targetId: prioritized[0].card.id,
        targetType: 'character',
      };
    }

    // No KO targets - attack leader
    this.log('No KO targets, attacking leader');
    return {
      attackerId: attacker.id,
      targetId: opponent.leaderCard?.id || Object.keys(gameState.players).find(id => id !== this.playerId)!,
      targetType: 'leader',
    };
  }

  /**
   * Decide whether to block
   */
  decideBlock(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    // Only block leader attacks
    if (gameState.currentCombat.targetType !== 'leader') {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    const attackPower = gameState.currentCombat.attackPower;
    const blockers = this.getAvailableBlockers(player);

    if (blockers.length === 0) {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    // Find blockers that can survive
    const survivingBlockers = blockers.filter(b => (b.power || 0) >= attackPower);

    if (survivingBlockers.length > 0) {
      // Use lowest power surviving blocker
      survivingBlockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      this.log('Blocking with surviving blocker', { blocker: survivingBlockers[0].id });
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: survivingBlockers[0].id },
      };
    }

    // If life is critical, sacrifice a blocker
    if (player.life <= 2) {
      blockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      this.log('Sacrificing blocker due to low life');
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: blockers[0].id },
      };
    }

    // Don't block - save blockers
    return { action: ActionType.PASS_PRIORITY, data: {} };
  }

  /**
   * Decide whether to use counters
   */
  decideCounter(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    const attackPower = gameState.currentCombat.attackPower;
    const targetId = gameState.currentCombat.targetId;

    // Calculate defender power
    let defenderPower = 0;
    if (gameState.currentCombat.targetType === 'leader') {
      defenderPower = player.leaderCard?.power || 5000;
    } else {
      const targetCard = player.field.find(c => c.id === targetId);
      defenderPower = targetCard?.power || 0;
    }

    // Add any existing counter power
    defenderPower += gameState.currentCombat.counterPower || 0;

    const powerGap = attackPower - defenderPower;

    // Already winning
    if (powerGap <= 0) {
      this.log('Already winning combat, passing counter');
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Get counter cards
    const counterCards = this.getCounterCards(player);
    if (counterCards.length === 0) {
      this.log('No counter cards available');
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Calculate minimum counters needed
    let counterPower = 0;
    const countersToUse: string[] = [];

    for (const { card, counterValue } of counterCards) {
      counterPower += counterValue;
      countersToUse.push(card.id);

      if (counterPower >= powerGap) break;
    }

    // Only counter if we can survive
    if (counterPower >= powerGap) {
      this.log('Using counters to survive', { counters: countersToUse.length, power: counterPower });
      return {
        action: ActionType.USE_COUNTER,
        data: { cardIds: countersToUse },
      };
    }

    // Can't survive, don't waste counters
    this.log('Cannot survive, passing counter');
    return { action: ActionType.PASS_COUNTER, data: {} };
  }

  /**
   * Select effect targets - basic priority
   */
  selectEffectTargets(validTargets: string[], gameState: GameState, effectType?: string): string[] {
    if (validTargets.length === 0) return [];

    const opponent = this.getOpponent(gameState);

    // For KO/removal effects, target highest threat
    if (effectType?.includes('KO') || effectType?.includes('TRASH') || effectType?.includes('RETURN')) {
      const opponentTargets = validTargets.filter(id =>
        opponent.field.some(c => c.id === id)
      );

      if (opponentTargets.length > 0) {
        // Sort by power
        const sorted = opponentTargets
          .map(id => {
            const card = opponent.field.find(c => c.id === id);
            return { id, power: card?.power || 0 };
          })
          .sort((a, b) => b.power - a.power);

        return [sorted[0].id];
      }
    }

    // Default: first valid target
    return [validTargets[0]];
  }

  /**
   * Assess threat level of a card (0-10)
   */
  private assessCardThreat(card: GameCard): number {
    const cardDef = this.getCardDef(card);
    let threat = 0;

    // Power-based threat
    const power = card.power || 0;
    if (power >= 8000) threat += 4;
    else if (power >= 6000) threat += 2;
    else if (power >= 4000) threat += 1;

    // Keyword threats - use runtime keywords first, fall back to static
    const keywords = card.keywords?.length ? card.keywords : cardDef?.keywords;
    if (keywords?.includes('Rush')) threat += 2;
    if (keywords?.includes('Double Attack')) threat += 3;
    if (keywords?.includes('Blocker')) threat += 1;

    // Effect threats (simplified - check for common dangerous effects)
    if (cardDef?.effects?.some(e => e.trigger === 'ON_ATTACK')) threat += 2;

    return Math.min(10, threat);
  }
}
