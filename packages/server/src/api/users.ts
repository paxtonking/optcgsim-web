import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

export const usersRouter = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/).optional(),
});

// Get current user
usersRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update current user
usersRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    if (data.username) {
      const existing = await prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id: req.user!.id },
        },
      });

      if (existing) {
        throw new AppError('Username already taken', 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
});

// Get user by ID (public profile)
usersRouter.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Get user stats
usersRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get recent matches
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: req.params.id },
          { player2Id: req.params.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        winnerId: true,
        ranked: true,
        createdAt: true,
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
      },
    });

    const stats = {
      ...user,
      winRate: user.gamesPlayed > 0
        ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
        : 0,
      losses: user.gamesPlayed - user.gamesWon,
      recentMatches: recentMatches.map(match => ({
        id: match.id,
        opponent: match.player1.id === req.params.id
          ? match.player2
          : match.player1,
        won: match.winnerId === req.params.id,
        ranked: match.ranked,
        createdAt: match.createdAt,
      })),
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get leaderboard
usersRouter.get('/leaderboard', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const users = await prisma.user.findMany({
      where: { gamesPlayed: { gt: 0 } },
      orderBy: { eloRating: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        username: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    const total = await prisma.user.count({
      where: { gamesPlayed: { gt: 0 } },
    });

    res.json({
      users: users.map((user, index) => ({
        ...user,
        rank: offset + index + 1,
        winRate: Math.round((user.gamesWon / user.gamesPlayed) * 100),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});
