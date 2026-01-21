/**
 * AIService - Basic AI opponent for One Piece TCG
 *
 * Implements a rule-based AI that can play cards, attack, and block.
 * This is a "basic" difficulty AI that makes reasonable decisions
 * but doesn't employ advanced strategies.
 */

import {
  GameState,
  GamePhase,
  PlayerState,
  GameCard,
  CardState,
  ActionType,
} from '@optcgsim/shared';
import { cardLoaderService } from './CardLoaderService.js';

export interface AIDecision {
  action: ActionType;
  data: any;
}

export class AIService {
  private playerId: string;
  private difficulty: 'basic' | 'medium' | 'hard';

  constructor(playerId: string, difficulty: 'basic' | 'medium' | 'hard' = 'basic') {
    this.playerId = playerId;
    this.difficulty = difficulty;
  }

  /**
   * Get the next action the AI should take based on current game state
   */
  public getNextAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    // Check if it's AI's turn
    if (gameState.activePlayerId !== this.playerId) {
      // Handle defensive actions (blocking, countering)
      return this.getDefensiveAction(gameState);
    }

    // Handle different phases
    switch (gameState.phase) {
      case GamePhase.START_MULLIGAN:
        return this.decideMulligan(player);

      case GamePhase.MAIN_PHASE:
        return this.getMainPhaseAction(gameState, player);

      case GamePhase.COMBAT_PHASE:
        return this.getCombatAction(gameState, player);

      case GamePhase.COUNTER_STEP:
        return this.getCounterAction(gameState, player);

      case GamePhase.BLOCKER_STEP:
        return this.getBlockerAction(gameState, player);

      default:
        return null;
    }
  }

  /**
   * Decide whether to mulligan
   */
  private decideMulligan(player: PlayerState): AIDecision {
    // Basic AI: Keep hand if we have at least 2 playable cards (cost 2-4)
    const playableCards = player.hand.filter(card => {
      const cardDef = cardLoaderService.getCard(card.cardId);
      return cardDef && cardDef.cost !== null && cardDef.cost >= 2 && cardDef.cost <= 4;
    });

    if (playableCards.length >= 2) {
      return { action: ActionType.KEEP_HAND, data: {} };
    }

    return { action: ActionType.MULLIGAN, data: {} };
  }

  /**
   * Get action for main phase
   */
  private getMainPhaseAction(gameState: GameState, player: PlayerState): AIDecision | null {
    // Calculate available DON
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;

    // 1. First, try to play cards
    const cardToPlay = this.selectCardToPlay(player, activeDon);
    if (cardToPlay) {
      return {
        action: ActionType.PLAY_CARD,
        data: { cardId: cardToPlay.id }
      };
    }

    // 2. Attach DON to characters for attacks
    const donAttachment = this.selectDonAttachment(player);
    if (donAttachment) {
      return {
        action: ActionType.ATTACH_DON,
        data: { donId: donAttachment.donId, targetId: donAttachment.targetId }
      };
    }

    // 3. If we have attackers ready, move to combat
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);
    if (readyAttackers.length > 0) {
      return {
        action: ActionType.DECLARE_ATTACK,
        data: this.selectAttackTarget(gameState, player, readyAttackers[0])
      };
    }

    // 4. End turn if nothing else to do
    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Select a card to play from hand
   */
  private selectCardToPlay(player: PlayerState, availableDon: number): GameCard | null {
    // Get playable cards (cost <= available DON)
    const playableCards = player.hand
      .filter(card => {
        const cardDef = cardLoaderService.getCard(card.cardId);
        if (!cardDef || cardDef.cost === null) return false;
        return cardDef.cost <= availableDon && cardDef.type === 'CHARACTER';
      })
      .map(card => ({
        card,
        def: cardLoaderService.getCard(card.cardId)!
      }));

    if (playableCards.length === 0) return null;

    // Strategy: Play the highest cost card we can afford
    // This maximizes board presence
    playableCards.sort((a, b) => (b.def.cost || 0) - (a.def.cost || 0));

    // Consider keywords - prioritize Rush cards early game
    const rushCards = playableCards.filter(c => c.def.keywords?.includes('Rush'));
    if (rushCards.length > 0 && player.field.length < 3) {
      return rushCards[0].card;
    }

    // Otherwise play highest cost
    return playableCards[0].card;
  }

  /**
   * Select DON to attach to a character
   */
  private selectDonAttachment(player: PlayerState): { donId: string; targetId: string } | null {
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
    if (activeDon.length === 0) return null;

    // Get active characters that can attack
    const attackers = player.field.filter(c => c.state === CardState.ACTIVE);
    if (attackers.length === 0) return null;

    // Attach to highest power attacker to maximize damage
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));
    const targetAttacker = sortedAttackers[0];

    // Count already attached DON
    const attachedCount = player.donField.filter(d => d.attachedTo === targetAttacker.id).length;

    // Don't attach more than 3 DON to one character
    if (attachedCount >= 3) {
      // Try next attacker
      const nextAttacker = sortedAttackers[1];
      if (nextAttacker) {
        return { donId: activeDon[0].id, targetId: nextAttacker.id };
      }
      return null;
    }

    return { donId: activeDon[0].id, targetId: targetAttacker.id };
  }

  /**
   * Get characters ready to attack
   */
  private getReadyAttackers(player: PlayerState, currentTurn: number): GameCard[] {
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
   * Select attack target
   */
  private selectAttackTarget(gameState: GameState, player: PlayerState, attacker: GameCard): { attackerId: string; targetId: string; targetType: 'leader' | 'character' } {
    const opponentId = Object.keys(gameState.players).find(id => id !== this.playerId)!;
    const opponent = gameState.players[opponentId];

    // Calculate attacker power with attached DON
    const attachedDon = player.donField.filter(d => d.attachedTo === attacker.id).length;
    const attackPower = (attacker.power || 0) + (attachedDon * 1000);

    // Strategy: Attack characters we can KO, otherwise attack leader
    const koableCharacters = opponent.field.filter(c => {
      const charPower = c.power || 0;
      return charPower <= attackPower && c.state === CardState.RESTED;
    });

    // Prioritize KOing rested characters
    if (koableCharacters.length > 0) {
      // Target highest power character we can KO
      koableCharacters.sort((a, b) => (b.power || 0) - (a.power || 0));
      return {
        attackerId: attacker.id,
        targetId: koableCharacters[0].id,
        targetType: 'character'
      };
    }

    // Otherwise attack leader if we can deal damage
    const leaderPower = opponent.leaderCard?.power || 5000;
    if (attackPower >= leaderPower || opponent.field.length === 0) {
      return {
        attackerId: attacker.id,
        targetId: opponent.leaderCard?.id || opponentId,
        targetType: 'leader'
      };
    }

    // Default to leader attack
    return {
      attackerId: attacker.id,
      targetId: opponent.leaderCard?.id || opponentId,
      targetType: 'leader'
    };
  }

  /**
   * Get combat phase action
   */
  private getCombatAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);

    if (readyAttackers.length > 0) {
      return {
        action: ActionType.DECLARE_ATTACK,
        data: this.selectAttackTarget(gameState, player, readyAttackers[0])
      };
    }

    // No more attacks, end turn
    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Get counter step action (when being attacked)
   */
  private getCounterAction(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    const attackPower = gameState.currentCombat.attackPower;
    const targetId = gameState.currentCombat.targetId;

    // Find target being attacked
    let defenderPower = 0;
    if (gameState.currentCombat.targetType === 'leader') {
      defenderPower = player.leaderCard?.power || 5000;
    } else {
      const targetCard = player.field.find(c => c.id === targetId);
      defenderPower = targetCard?.power || 0;
    }

    // Calculate power gap
    const powerGap = attackPower - defenderPower;

    // If we're already winning, pass
    if (powerGap <= 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Try to use counter cards from hand
    const counterCards = player.hand.filter(card => {
      const cardDef = cardLoaderService.getCard(card.cardId);
      return cardDef && cardDef.counter !== null && cardDef.counter > 0;
    });

    if (counterCards.length > 0) {
      // Use enough counters to survive
      let counterPower = 0;
      const countersToUse: string[] = [];

      for (const card of counterCards) {
        const cardDef = cardLoaderService.getCard(card.cardId);
        counterPower += cardDef?.counter || 0;
        countersToUse.push(card.id);

        if (counterPower >= powerGap) break;
      }

      // Only counter if we can actually survive
      if (counterPower >= powerGap && countersToUse.length > 0) {
        return {
          action: ActionType.USE_COUNTER,
          data: { cardIds: countersToUse }
        };
      }
    }

    // Can't survive, pass
    return { action: ActionType.PASS_COUNTER, data: {} };
  }

  /**
   * Get blocker step action
   */
  private getBlockerAction(gameState: GameState, player: PlayerState): AIDecision | null {
    if (!gameState.currentCombat) return null;

    // Only consider blocking if leader is being attacked
    if (gameState.currentCombat.targetType !== 'leader') {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    const attackPower = gameState.currentCombat.attackPower;

    // Find available blockers
    const blockers = player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      const cardDef = cardLoaderService.getCard(card.cardId);
      return cardDef?.keywords?.includes('Blocker');
    });

    if (blockers.length === 0) {
      return { action: ActionType.PASS_COUNTER, data: {} };
    }

    // Strategy: Block with a character that can survive
    // Or sacrifice a low-value blocker if necessary
    const survivingBlockers = blockers.filter(b => {
      const blockerPower = b.power || 0;
      return blockerPower >= attackPower;
    });

    if (survivingBlockers.length > 0) {
      // Use lowest power blocker that survives
      survivingBlockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: survivingBlockers[0].id }
      };
    }

    // If life is low, sacrifice a blocker
    if (player.life <= 2) {
      // Use lowest value blocker
      blockers.sort((a, b) => (a.power || 0) - (b.power || 0));
      return {
        action: ActionType.SELECT_BLOCKER,
        data: { blockerId: blockers[0].id }
      };
    }

    // Otherwise, don't block - save blockers
    return { action: ActionType.PASS_COUNTER, data: {} };
  }

  /**
   * Handle defensive actions when it's not AI's turn
   */
  private getDefensiveAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    switch (gameState.phase) {
      case GamePhase.COUNTER_STEP:
        return this.getCounterAction(gameState, player);

      case GamePhase.BLOCKER_STEP:
        return this.getBlockerAction(gameState, player);

      default:
        return null;
    }
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
}

// Factory function to create AI players
export function createAIPlayer(difficulty: 'basic' | 'medium' | 'hard' = 'basic'): AIService {
  const aiPlayerId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return new AIService(aiPlayerId, difficulty);
}
