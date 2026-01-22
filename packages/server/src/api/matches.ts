import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

export const matchesRouter = Router();

// Get user's match history
matchesRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: {
          OR: [
            { player1Id: req.user!.id },
            { player2Id: req.user!.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } },
        },
      }),
      prisma.match.count({
        where: {
          OR: [
            { player1Id: req.user!.id },
            { player2Id: req.user!.id },
          ],
        },
      }),
    ]);

    const formattedMatches = matches.map((match: any) => ({
      id: match.id,
      opponent: match.player1Id === req.user!.id
        ? match.player2
        : match.player1,
      won: match.winnerId === req.user!.id,
      ranked: match.ranked,
      duration: match.duration,
      createdAt: match.createdAt,
    }));

    res.json({ matches: formattedMatches, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// Get match by ID (with replay data)
matchesRouter.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        player1: { select: { id: true, username: true, eloRating: true } },
        player2: { select: { id: true, username: true, eloRating: true } },
      },
    });

    if (!match) {
      throw new AppError('Match not found', 404);
    }

    res.json({
      id: match.id,
      player1: {
        ...match.player1,
        eloBefore: match.player1EloBefore,
        eloChange: match.player1EloChange,
      },
      player2: {
        ...match.player2,
        eloBefore: match.player2EloBefore,
        eloChange: match.player2EloChange,
      },
      winnerId: match.winnerId,
      ranked: match.ranked,
      duration: match.duration,
      createdAt: match.createdAt,
      // Replay data
      initialState: match.initialState,
      gameLog: match.gameLog,
      hasReplay: !!(match.initialState && match.gameLog),
    });
  } catch (error) {
    next(error);
  }
});

// Get recent matches (for spectate/featured)
matchesRouter.get('/recent/all', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

    const matches = await prisma.match.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        player1: { select: { id: true, username: true, eloRating: true } },
        player2: { select: { id: true, username: true, eloRating: true } },
      },
    });

    res.json(matches);
  } catch (error) {
    next(error);
  }
});
