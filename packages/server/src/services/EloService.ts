/**
 * ELO Rating Service
 * Implements the ELO rating system for ranked matches
 */

// K-factor determines how much a single match affects rating
// Higher K = more volatile ratings
const K_FACTORS = {
  NEW_PLAYER: 40,      // First 30 games
  INTERMEDIATE: 32,    // 30-100 games
  ESTABLISHED: 24,     // 100+ games
  MASTER: 16,          // 2000+ rating
};

// Rating thresholds for rank tiers
export const RANK_TIERS = {
  BRONZE: { min: 0, max: 999, name: 'Bronze', color: '#CD7F32' },
  SILVER: { min: 1000, max: 1199, name: 'Silver', color: '#C0C0C0' },
  GOLD: { min: 1200, max: 1399, name: 'Gold', color: '#FFD700' },
  PLATINUM: { min: 1400, max: 1599, name: 'Platinum', color: '#E5E4E2' },
  DIAMOND: { min: 1600, max: 1799, name: 'Diamond', color: '#B9F2FF' },
  MASTER: { min: 1800, max: 1999, name: 'Master', color: '#9966CC' },
  GRANDMASTER: { min: 2000, max: Infinity, name: 'Grandmaster', color: '#FF4500' },
};

export interface EloResult {
  player1NewRating: number;
  player2NewRating: number;
  player1Change: number;
  player2Change: number;
}

export interface PlayerRankInfo {
  rating: number;
  tier: keyof typeof RANK_TIERS;
  tierName: string;
  tierColor: string;
  progress: number; // 0-100 progress to next tier
  gamesUntilRanked: number; // Games needed for placement (0 if placed)
}

/**
 * Get K-factor based on player's games played and rating
 */
function getKFactor(gamesPlayed: number, rating: number): number {
  if (gamesPlayed < 30) return K_FACTORS.NEW_PLAYER;
  if (rating >= 2000) return K_FACTORS.MASTER;
  if (gamesPlayed < 100) return K_FACTORS.INTERMEDIATE;
  return K_FACTORS.ESTABLISHED;
}

/**
 * Calculate expected score (probability of winning)
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate ELO changes after a match
 * @param player1Rating Current rating of player 1
 * @param player2Rating Current rating of player 2
 * @param player1GamesPlayed Games played by player 1
 * @param player2GamesPlayed Games played by player 2
 * @param winnerId ID of the winner (1 for player1, 2 for player2, null for draw)
 */
export function calculateEloChange(
  player1Rating: number,
  player2Rating: number,
  player1GamesPlayed: number,
  player2GamesPlayed: number,
  winner: 1 | 2 | null
): EloResult {
  const k1 = getKFactor(player1GamesPlayed, player1Rating);
  const k2 = getKFactor(player2GamesPlayed, player2Rating);

  const expected1 = expectedScore(player1Rating, player2Rating);
  const expected2 = expectedScore(player2Rating, player1Rating);

  // Actual scores: 1 for win, 0.5 for draw, 0 for loss
  let actual1: number;
  let actual2: number;

  if (winner === 1) {
    actual1 = 1;
    actual2 = 0;
  } else if (winner === 2) {
    actual1 = 0;
    actual2 = 1;
  } else {
    actual1 = 0.5;
    actual2 = 0.5;
  }

  const change1 = Math.round(k1 * (actual1 - expected1));
  const change2 = Math.round(k2 * (actual2 - expected2));

  // Minimum floor to prevent negative ratings
  const newRating1 = Math.max(0, player1Rating + change1);
  const newRating2 = Math.max(0, player2Rating + change2);

  return {
    player1NewRating: newRating1,
    player2NewRating: newRating2,
    player1Change: change1,
    player2Change: change2,
  };
}

/**
 * Get rank tier info for a given rating
 */
export function getRankTier(rating: number): keyof typeof RANK_TIERS {
  if (rating >= RANK_TIERS.GRANDMASTER.min) return 'GRANDMASTER';
  if (rating >= RANK_TIERS.MASTER.min) return 'MASTER';
  if (rating >= RANK_TIERS.DIAMOND.min) return 'DIAMOND';
  if (rating >= RANK_TIERS.PLATINUM.min) return 'PLATINUM';
  if (rating >= RANK_TIERS.GOLD.min) return 'GOLD';
  if (rating >= RANK_TIERS.SILVER.min) return 'SILVER';
  return 'BRONZE';
}

/**
 * Get full rank info for a player
 */
export function getPlayerRankInfo(
  rating: number,
  gamesPlayed: number,
  placementGamesRequired: number = 10
): PlayerRankInfo {
  const tier = getRankTier(rating);
  const tierInfo = RANK_TIERS[tier];

  // Calculate progress to next tier
  let progress = 0;
  if (tier !== 'GRANDMASTER') {
    const tierRange = tierInfo.max - tierInfo.min;
    const currentProgress = rating - tierInfo.min;
    progress = Math.min(100, Math.round((currentProgress / tierRange) * 100));
  } else {
    progress = 100;
  }

  return {
    rating,
    tier,
    tierName: tierInfo.name,
    tierColor: tierInfo.color,
    progress,
    gamesUntilRanked: Math.max(0, placementGamesRequired - gamesPlayed),
  };
}

/**
 * Check if two players can be matched (within rating range)
 * Range expands with queue time
 */
export function canMatch(
  rating1: number,
  rating2: number,
  queueTimeSeconds: number
): boolean {
  // Base range is 100, expands by 50 every 30 seconds
  const baseRange = 100;
  const expansionRate = 50;
  const expansionInterval = 30;

  const expansions = Math.floor(queueTimeSeconds / expansionInterval);
  const maxRange = baseRange + (expansions * expansionRate);

  // Cap at 500 to prevent very mismatched games
  const effectiveRange = Math.min(maxRange, 500);

  return Math.abs(rating1 - rating2) <= effectiveRange;
}

/**
 * Get current season identifier
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Calculate the ELO decay for inactive players (optional feature)
 * Returns the new rating after decay
 */
export function calculateDecay(
  rating: number,
  daysSinceLastGame: number,
  tier: keyof typeof RANK_TIERS
): number {
  // Only decay for Diamond and above, after 14 days of inactivity
  if (tier === 'BRONZE' || tier === 'SILVER' || tier === 'GOLD' || tier === 'PLATINUM') {
    return rating;
  }

  if (daysSinceLastGame < 14) {
    return rating;
  }

  // Decay 25 points per week of inactivity (after grace period)
  const weeksInactive = Math.floor((daysSinceLastGame - 14) / 7);
  const decay = weeksInactive * 25;

  // Don't decay below tier minimum
  const minRating = RANK_TIERS[tier].min;
  return Math.max(minRating, rating - decay);
}
