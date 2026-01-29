/**
 * EasyStrategy - Intentionally suboptimal AI for beginners
 *
 * Makes predictable mistakes, misses obvious plays, and doesn't
 * calculate threats or lethal. Good for learning the game.
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

export class EasyStrategy extends BaseStrategy {
  /**
   * Mulligan decision - keep most hands, sometimes mulligan good ones
   */
  decideMulligan(player: PlayerState): AIDecision {
    const playableCards = player.hand.filter(card => {
      const cardDef = this.getCardDef(card);
      return cardDef && cardDef.cost !== null && cardDef.cost >= 1 && cardDef.cost <= 5;
    });

    // Easy AI has low standards - keep if at least 1 playable card
    let shouldKeep = playableCards.length >= 1;

    // 20% chance to make a mistake (mulligan good hand or keep bad hand)
    if (this.shouldMakeMistake()) {
      shouldKeep = !shouldKeep;
      this.log('Made mulligan mistake!');
    }

    this.log(`Mulligan: ${shouldKeep ? 'KEEP' : 'MULLIGAN'}`, { playable: playableCards.length });

    return {
      action: shouldKeep ? ActionType.KEEP_HAND : ActionType.MULLIGAN,
      data: {},
    };
  }

  /**
   * Select card to play - simple highest cost, no keyword awareness
   */
  selectCardToPlay(player: PlayerState, availableDon: number, _gameState: GameState): GameCard | null {
    const playableCards = this.getPlayableCards(player, availableDon);
    if (playableCards.length === 0) return null;

    // Sort by cost (highest first)
    playableCards.sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0));

    // 25% chance to play a random card instead of optimal
    if (this.shouldMakeMistake() && playableCards.length > 1) {
      const randomIndex = Math.floor(Math.random() * playableCards.length);
      this.log('Playing random card instead of highest cost');
      return playableCards[randomIndex].card;
    }

    // Play highest cost card
    this.log('Playing highest cost card', { cost: playableCards[0].def.cost });
    return playableCards[0].card;
  }

  /**
   * Select DON attachment - always attach to highest power, no strategy
   */
  selectDonAttachment(player: PlayerState, _gameState: GameState): { donId: string; targetId: string } | null {
    const activeDon = this.getActiveDon(player);
    if (activeDon.length === 0) return null;

    // Get active characters
    const attackers = player.field.filter(c => c.state === CardState.ACTIVE);
    if (attackers.length === 0) return null;

    // 25% chance to skip DON attachment entirely
    if (this.shouldMakeMistake()) {
      this.log('Skipping DON attachment (mistake)');
      return null;
    }

    // Simple: attach to highest power character
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));

    for (const attacker of sortedAttackers) {
      const attachedCount = this.countAttachedDon(attacker, player);
      if (attachedCount < 3) {
        this.log('Attaching DON to highest power character');
        return { donId: activeDon[0].id, targetId: attacker.id };
      }
    }

    return null;
  }

  /**
   * Select attack target - simple logic, attack rested chars or leader
   */
  selectAttackTarget(gameState: GameState, player: PlayerState, attacker: GameCard): AttackTarget {
    const opponent = this.getOpponent(gameState);
    const attackPower = this.calculateAttackPower(attacker, player);

    // Find rested characters we can KO
    const koableCharacters = opponent.field.filter(c => {
      const charPower = c.power || 0;
      return charPower <= attackPower && c.state === CardState.RESTED;
    });

    // 30% chance to attack leader instead of KO-able character (miss lethal on board)
    if (koableCharacters.length > 0 && !this.shouldMakeMistake()) {
      // Attack lowest power target (not optimal)
      koableCharacters.sort((a, b) => (a.power || 0) - (b.power || 0));
      this.log('Attacking KO-able character (lowest power)');
      return {
        attackerId: attacker.id,
        targetId: koableCharacters[0].id,
        targetType: 'character',
      };
    }

    // Attack leader
    this.log('Attacking leader');
    return {
      attackerId: attacker.id,
      targetId: opponent.leaderCard?.id || Object.keys(gameState.players).find(id => id !== this.playerId)!,
      targetType: 'leader',
    };
  }

  /**
   * Decide whether to block - very simple, only block if survives
   */
  decideBlock(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    // Only consider blocking leader attacks
    if (gameState.currentCombat.targetType !== 'leader') {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    const attackPower = gameState.currentCombat.attackPower;
    const blockers = this.getAvailableBlockers(player);

    if (blockers.length === 0) {
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    // 25% chance to not block even when we should
    if (this.shouldMakeMistake()) {
      this.log('Not blocking (mistake)');
      return { action: ActionType.PASS_PRIORITY, data: {} };
    }

    // Find blockers that survive
    const survivingBlockers = blockers.filter(b => (b.power || 0) >= attackPower);

    if (survivingBlockers.length > 0) {
      // Easy AI doesn't optimize - just pick first surviving blocker
      this.log('Blocking with first surviving blocker');
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: survivingBlockers[0].id },
      };
    }

    // Only sacrifice blocker if at 1 life
    if (player.life === 1) {
      this.log('Sacrificing blocker at 1 life');
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: blockers[0].id },
      };
    }

    // Don't sacrifice blockers
    return { action: ActionType.PASS_PRIORITY, data: {} };
  }

  /**
   * Decide whether to use counters - often over/under-counters
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

    defenderPower += gameState.currentCombat.counterPower || 0;
    const powerGap = attackPower - defenderPower;

    // Already winning
    if (powerGap <= 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // 30% chance to not counter even when we could survive
    if (this.shouldMakeMistake()) {
      this.log('Not countering (mistake)');
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Get counter cards
    const counterCards = this.getCounterCards(player);
    if (counterCards.length === 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Easy AI often over-counters - use ALL counters if we have them
    let counterPower = 0;
    const countersToUse: string[] = [];

    for (const { card, counterValue } of counterCards) {
      counterPower += counterValue;
      countersToUse.push(card.id);

      // 50% chance to stop at optimal, 50% chance to over-counter
      if (counterPower >= powerGap && Math.random() > 0.5) {
        break;
      }
    }

    // Only counter if we can survive
    if (counterPower >= powerGap) {
      this.log('Using counters', { count: countersToUse.length, power: counterPower, gap: powerGap });
      return {
        action: ActionType.USE_COUNTER,
        data: { cardIds: countersToUse },
      };
    }

    // Can't survive, don't waste counters
    return { action: ActionType.PASS_COUNTER, data: {} };
  }

  /**
   * Select effect targets - just pick first valid, no strategy
   */
  selectEffectTargets(validTargets: string[], _gameState: GameState, _effectType?: string): string[] {
    if (validTargets.length === 0) return [];

    // 25% chance to pick random target instead of first
    if (this.shouldMakeMistake() && validTargets.length > 1) {
      const randomIndex = Math.floor(Math.random() * validTargets.length);
      this.log('Selecting random effect target (mistake)');
      return [validTargets[randomIndex]];
    }

    // Just pick first target
    this.log('Selecting first valid effect target');
    return [validTargets[0]];
  }
}
