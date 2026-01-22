import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { getCurrentSeason, getRankTier, RANK_TIERS, getPlayerRankInfo } from '../services/EloService.js';
import { authenticate } from '../middleware/auth.js';

export const leaderboardRouter = Router();

/**
 * GET /leaderboard
 * Get the current season's leaderboard
 * Query params:
 *  - season: optional, defaults to current season
 *  - limit: optional, defaults to 100
 *  - offset: optional, defaults to 0
 */
leaderboardRouter.get('/', async (req, res, next) => {
  try {
    const season = (req.query.season as string) || getCurrentSeason();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Get leaderboard entries
    const entries = await prisma.leaderboard.findMany({
      where: { season },
      orderBy: { eloRating: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.leaderboard.count({
      where: { season },
    });

    // Add rank tier info to each entry
    const entriesWithTiers = entries.map((entry, index) => {
      const tier = getRankTier(entry.eloRating);
      const tierInfo = RANK_TIERS[tier];
      return {
        ...entry,
        displayRank: offset + index + 1,
        tier,
        tierName: tierInfo.name,
        tierColor: tierInfo.color,
        winRate: entry.gamesWon + entry.gamesLost > 0
          ? Math.round((entry.gamesWon / (entry.gamesWon + entry.gamesLost)) * 100)
          : 0,
      };
    });

    res.json({
      season,
      entries: entriesWithTiers,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /leaderboard/me
 * Get the authenticated user's leaderboard position
 */
leaderboardRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const season = (req.query.season as string) || getCurrentSeason();
    const userId = req.user!.id;

    // Get user's leaderboard entry
    const entry = await prisma.leaderboard.findUnique({
      where: { season_userId: { season, userId } },
    });

    if (!entry) {
      // User hasn't played ranked this season
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { eloRating: true, gamesPlayed: true },
      });

      return res.json({
        season,
        hasPlayed: false,
        currentRating: user?.eloRating || 1000,
        rankInfo: getPlayerRankInfo(user?.eloRating || 1000, user?.gamesPlayed || 0),
      });
    }

    // Calculate rank position
    const higherRanked = await prisma.leaderboard.count({
      where: {
        season,
        eloRating: { gt: entry.eloRating },
      },
    });

    const tier = getRankTier(entry.eloRating);
    const tierInfo = RANK_TIERS[tier];

    res.json({
      season,
      hasPlayed: true,
      rank: higherRanked + 1,
      eloRating: entry.eloRating,
      gamesWon: entry.gamesWon,
      gamesLost: entry.gamesLost,
      winRate: entry.gamesWon + entry.gamesLost > 0
        ? Math.round((entry.gamesWon / (entry.gamesWon + entry.gamesLost)) * 100)
        : 0,
      tier,
      tierName: tierInfo.name,
      tierColor: tierInfo.color,
      rankInfo: getPlayerRankInfo(entry.eloRating, entry.gamesWon + entry.gamesLost),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /leaderboard/user/:userId
 * Get a specific user's leaderboard info
 */
leaderboardRouter.get('/user/:userId', async (req, res, next) => {
  try {
    const season = (req.query.season as string) || getCurrentSeason();
    const userId = req.params.userId;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's leaderboard entry for this season
    const entry = await prisma.leaderboard.findUnique({
      where: { season_userId: { season, userId } },
    });

    // Calculate rank position if they have an entry
    let rank = null;
    if (entry) {
      const higherRanked = await prisma.leaderboard.count({
        where: {
          season,
          eloRating: { gt: entry.eloRating },
        },
      });
      rank = higherRanked + 1;
    }

    const tier = getRankTier(user.eloRating);
    const tierInfo = RANK_TIERS[tier];

    res.json({
      user: {
        id: user.id,
        username: user.username,
        eloRating: user.eloRating,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        winRate: user.gamesPlayed > 0
          ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
          : 0,
        tier,
        tierName: tierInfo.name,
        tierColor: tierInfo.color,
      },
      seasonStats: entry ? {
        season,
        rank,
        gamesWon: entry.gamesWon,
        gamesLost: entry.gamesLost,
        winRate: entry.gamesWon + entry.gamesLost > 0
          ? Math.round((entry.gamesWon / (entry.gamesWon + entry.gamesLost)) * 100)
          : 0,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /leaderboard/seasons
 * Get list of available seasons
 */
leaderboardRouter.get('/seasons', async (_req, res, next) => {
  try {
    const seasons = await prisma.leaderboard.findMany({
      select: { season: true },
      distinct: ['season'],
      orderBy: { season: 'desc' },
    });

    const currentSeason = getCurrentSeason();
    const seasonList = seasons.map(s => ({
      season: s.season,
      isCurrent: s.season === currentSeason,
    }));

    // Add current season if not in list
    if (!seasonList.find(s => s.season === currentSeason)) {
      seasonList.unshift({ season: currentSeason, isCurrent: true });
    }

    res.json({ seasons: seasonList, currentSeason });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /leaderboard/rank-tiers
 * Get rank tier information
 */
leaderboardRouter.get('/rank-tiers', (_req, res) => {
  const tiers = Object.entries(RANK_TIERS).map(([key, value]) => ({
    key,
    ...value,
  }));

  res.json({ tiers });
});
