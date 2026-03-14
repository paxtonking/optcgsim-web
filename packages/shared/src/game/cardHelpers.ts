import { PlayerState, GameState, GameCard, CardState } from '../types/game.js';

/**
 * Normalize a colors array by splitting any compound color strings
 * (e.g. "GREEN RED") into individual elements.
 *
 * Card definitions may store multi-color values as either
 * `["GREEN", "RED"]` or the legacy compound format `["GREEN RED"]`.
 * This helper ensures a flat, single-color-per-element array.
 */
export function normalizeColors(colors: string[]): string[] {
  return colors.flatMap(c => c.includes(' ') ? c.split(' ') : [c]);
}

/**
 * Get characters ready to attack for a given player.
 *
 * Returns leader and field characters that are ACTIVE, haven't attacked,
 * and (if played this turn) have the Rush keyword.
 * Returns an empty array if the first player is on their very first turn.
 */
export function getReadyAttackers(
  player: PlayerState,
  currentTurn: number,
  gameState?: GameState,
): GameCard[] {
  // Only the FIRST player cannot attack on their first personal turn
  if (player.turnCount === 1 && gameState?.firstPlayerId === player.id) {
    return [];
  }

  const attackers: GameCard[] = [];

  // Include leader as a potential attacker
  if (player.leaderCard && player.leaderCard.state === CardState.ACTIVE && !player.leaderCard.hasAttacked) {
    attackers.push(player.leaderCard);
  }

  // Include field characters
  for (const card of player.field) {
    if (card.state !== CardState.ACTIVE) continue;
    if (card.hasAttacked) continue;

    // Check if can attack (Rush or not played this turn)
    if (card.turnPlayed === currentTurn) {
      if (!card.keywords?.includes('Rush')) continue;
    }

    attackers.push(card);
  }

  return attackers;
}
