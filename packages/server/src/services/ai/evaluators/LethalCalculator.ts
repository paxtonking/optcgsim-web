/**
 * LethalCalculator - Detects when AI can win the game
 */

import { GameState, PlayerState, GameCard, CardState } from '@optcgsim/shared';
import { LethalInfo, AttackSequence, DonAttachment } from '../types.js';
import { cardLoaderService } from '../../CardLoaderService.js';

export class LethalCalculator {
  /**
   * Calculate if lethal damage is possible
   */
  calculateLethal(
    gameState: GameState,
    playerId: string
  ): LethalInfo | null {
    const player = gameState.players[playerId];
    const opponentId = Object.keys(gameState.players).find(id => id !== playerId)!;
    const opponent = gameState.players[opponentId];

    if (!player || !opponent) return null;

    // Opponent already at 0 life = already won
    if (opponent.life <= 0) return null;

    const availableAttackers = this.getAvailableAttackers(player, gameState.turn);
    if (availableAttackers.length === 0) return null;

    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
    const opponentBlockers = this.getAvailableBlockers(opponent);

    // Calculate lethal with various DON distribution strategies
    return this.findLethalSequence(
      availableAttackers,
      activeDon,
      opponent,
      opponentBlockers,
      player
    );
  }

  /**
   * Find an attack sequence that results in lethal
   */
  private findLethalSequence(
    attackers: GameCard[],
    availableDon: GameCard[],
    opponent: PlayerState,
    opponentBlockers: GameCard[],
    player: PlayerState
  ): LethalInfo | null {
    const leaderPower = opponent.leaderCard?.power || 5000;
    const opponentLife = opponent.life;

    // Simple case: can we deal enough damage to leader?
    const totalPossibleDamage = this.calculateMaxDamage(attackers, availableDon.length, player);

    // Each successful hit = 1 life damage
    // Need to hit leader "life" times
    const hitsNeeded = opponentLife;

    // Check if we have enough attacks that can succeed
    const successfulAttacks = this.simulateAttacks(
      attackers,
      availableDon,
      leaderPower,
      opponentBlockers,
      player
    );

    if (successfulAttacks.length >= hitsNeeded) {
      // We have lethal!
      const attackSequence: AttackSequence[] = successfulAttacks.slice(0, hitsNeeded).map(atk => ({
        attackerId: atk.attackerId,
        targetId: opponent.leaderCard?.id || 'leader',
        targetType: 'leader' as const,
        attackPower: atk.power,
        requiredDon: atk.donUsed,
        expectedOutcome: 'damage' as const,
      }));

      const donAttachments: DonAttachment[] = [];
      let donIndex = 0;
      for (const atk of successfulAttacks.slice(0, hitsNeeded)) {
        for (let i = 0; i < atk.donUsed; i++) {
          if (donIndex < availableDon.length) {
            donAttachments.push({
              donId: availableDon[donIndex].id,
              targetId: atk.attackerId,
              purpose: 'lethal',
            });
            donIndex++;
          }
        }
      }

      return {
        hasLethal: true,
        attackSequence,
        donAttachments,
        totalDamage: hitsNeeded,
        requiredCounterPower: this.calculateRequiredCounter(successfulAttacks, leaderPower),
      };
    }

    return null;
  }

  /**
   * Simulate attacks and return successful ones
   */
  private simulateAttacks(
    attackers: GameCard[],
    availableDon: GameCard[],
    leaderPower: number,
    opponentBlockers: GameCard[],
    player: PlayerState
  ): { attackerId: string; power: number; donUsed: number }[] {
    const results: { attackerId: string; power: number; donUsed: number }[] = [];
    let remainingDon = availableDon.length;
    const usedBlockers = new Set<string>();

    // Sort attackers by power (highest first for efficient DON usage)
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));

    for (const attacker of sortedAttackers) {
      const basePower = this.calculateAttackerPower(attacker, player);
      let donNeeded = 0;

      // Calculate DON needed to beat leader
      if (basePower < leaderPower) {
        donNeeded = Math.ceil((leaderPower - basePower) / 1000);
      }

      // Check if we have enough DON
      if (donNeeded <= remainingDon) {
        const finalPower = basePower + (donNeeded * 1000);

        // Check if opponent has an unused blocker that could stop this
        const canBeBlocked = opponentBlockers.some(b =>
          !usedBlockers.has(b.id) && b.state === CardState.ACTIVE
        );

        // For lethal calculation, assume blockers will try to block
        // but we still count the attack if power beats leader
        if (finalPower >= leaderPower) {
          // If there's a blocker, they might use it
          if (canBeBlocked) {
            // Find the blocker with lowest power that would survive
            const availableBlocker = opponentBlockers
              .filter(b => !usedBlockers.has(b.id) && b.state === CardState.ACTIVE)
              .sort((a, b) => (a.power || 0) - (b.power || 0))[0];

            if (availableBlocker) {
              // This attack gets blocked
              usedBlockers.add(availableBlocker.id);
              // Attack still "used" but blocked
              continue;
            }
          }

          // Attack succeeds
          results.push({
            attackerId: attacker.id,
            power: finalPower,
            donUsed: donNeeded,
          });
          remainingDon -= donNeeded;
        }
      }
    }

    return results;
  }

  /**
   * Calculate maximum possible damage
   */
  private calculateMaxDamage(attackers: GameCard[], availableDon: number, player: PlayerState): number {
    let totalPower = 0;
    for (const attacker of attackers) {
      totalPower += this.calculateAttackerPower(attacker, player);
    }
    // Add DON bonus
    totalPower += availableDon * 1000;
    return totalPower;
  }

  /**
   * Calculate attacker power including already-attached DON
   */
  private calculateAttackerPower(attacker: GameCard, player: PlayerState): number {
    const attachedDon = player.donField.filter(d => d.attachedTo === attacker.id).length;
    return (attacker.power || 0) + (attachedDon * 1000);
  }

  /**
   * Get attackers that can attack this turn
   */
  private getAvailableAttackers(player: PlayerState, currentTurn: number): GameCard[] {
    return player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      if (card.hasAttacked) return false;

      // Check Rush for same-turn attacks
      if (card.turnPlayed === currentTurn) {
        const cardDef = cardLoaderService.getCard(card.cardId);
        if (!cardDef?.keywords?.includes('Rush')) return false;
      }

      return true;
    });
  }

  /**
   * Get opponent's available blockers
   */
  private getAvailableBlockers(opponent: PlayerState): GameCard[] {
    return opponent.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      const cardDef = cardLoaderService.getCard(card.cardId);
      return cardDef?.keywords?.includes('Blocker');
    });
  }

  /**
   * Calculate total counter power opponent would need to survive
   */
  private calculateRequiredCounter(
    attacks: { power: number }[],
    leaderPower: number
  ): number {
    return attacks.reduce((total, atk) => {
      const gap = atk.power - leaderPower;
      return total + Math.max(0, gap);
    }, 0);
  }

  /**
   * Check if going for lethal is optimal (vs. building board)
   */
  hasReliableLethal(gameState: GameState, playerId: string): boolean {
    const lethal = this.calculateLethal(gameState, playerId);
    if (!lethal) return false;

    // Consider lethal "reliable" if opponent needs a lot of counter power
    // and we have enough attacks to push through
    const opponent = Object.values(gameState.players).find(p => p.id !== playerId);
    const opponentHandSize = opponent?.hand.length || 0;

    // Rough estimate: assume each card in hand could have ~2000 counter on average
    const estimatedCounterPower = opponentHandSize * 2000;

    return lethal.requiredCounterPower > estimatedCounterPower;
  }
}
