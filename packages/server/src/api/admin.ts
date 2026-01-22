import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const adminRouter = Router();

// All admin routes require authentication and admin privileges
adminRouter.use(authenticate);
adminRouter.use(requireAdmin);

// Get admin dashboard stats
adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalUsers,
      totalMatches,
      totalDecks,
      activeToday,
      matchesToday,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.deck.count(),
      prisma.user.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.match.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
          eloRating: true,
          gamesPlayed: true,
        },
      }),
    ]);

    res.json({
      stats: {
        totalUsers,
        totalMatches,
        totalDecks,
        activeToday,
        matchesToday,
      },
      recentUsers,
    });
  } catch (error) {
    next(error);
  }
});

// Get all users with pagination
adminRouter.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          username: true,
          email: true,
          eloRating: true,
          gamesPlayed: true,
          gamesWon: true,
          isAdmin: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get user details
adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        eloRating: true,
        gamesPlayed: true,
        gamesWon: true,
        isAdmin: true,
        avatarId: true,
        badges: true,
        createdAt: true,
        updatedAt: true,
        decks: {
          select: {
            id: true,
            name: true,
            leaderId: true,
            isPublic: true,
            createdAt: true,
            cards: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get recent matches
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: userId },
          { player2Id: userId },
        ],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        winnerId: true,
        ranked: true,
        createdAt: true,
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
      },
    });

    // Format response
    const formattedUser = {
      ...user,
      decks: user.decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        leaderId: deck.leaderId,
        cardCount: Array.isArray(deck.cards) ? (deck.cards as unknown[]).length : 0,
        createdAt: deck.createdAt,
      })),
      recentMatches: recentMatches.map((match) => ({
        id: match.id,
        isRanked: match.ranked,
        winnerId: match.winnerId,
        createdAt: match.createdAt,
        opponent: match.player1.id === userId ? match.player2.username : match.player1.username,
      })),
    };

    res.json({ user: formattedUser });
  } catch (error) {
    next(error);
  }
});

// Update user (admin actions)
adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const { isAdmin, eloRating, username, email } = req.body;
    const targetId = req.params.id;

    // Prevent self-demotion
    if (targetId === req.user!.id && isAdmin === false) {
      throw new AppError('Cannot remove your own admin privileges', 400);
    }

    const updateData: Record<string, unknown> = {};
    if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;
    if (typeof eloRating === 'number') updateData.eloRating = eloRating;
    if (typeof username === 'string') updateData.username = username;
    if (typeof email === 'string') updateData.email = email;

    const user = await prisma.user.update({
      where: { id: targetId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        eloRating: true,
        isAdmin: true,
      },
    });

    res.json({ user, message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Ban user (delete account)
adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    const targetId = req.params.id;

    // Prevent self-deletion
    if (targetId === req.user!.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    // Check if target is admin
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { isAdmin: true, username: true },
    });

    if (!targetUser) {
      throw new AppError('User not found', 404);
    }

    if (targetUser.isAdmin) {
      throw new AppError('Cannot delete another admin account', 400);
    }

    await prisma.user.delete({
      where: { id: targetId },
    });

    res.json({ message: `User ${targetUser.username} has been deleted` });
  } catch (error) {
    next(error);
  }
});

// Get all card sets
adminRouter.get('/cardsets', async (_req, res, next) => {
  try {
    const cardSets = await prisma.cardSet.findMany({
      orderBy: { releaseDate: 'desc' },
    });

    res.json({ cardSets });
  } catch (error) {
    next(error);
  }
});

// Update card set
adminRouter.patch('/cardsets/:id', async (req, res, next) => {
  try {
    const { name, isActive, releaseDate } = req.body;

    const updateData: Record<string, unknown> = {};
    if (typeof name === 'string') updateData.name = name;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (releaseDate) updateData.releaseDate = new Date(releaseDate);

    const cardSet = await prisma.cardSet.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ cardSet });
  } catch (error) {
    next(error);
  }
});

// Get match analytics
adminRouter.get('/analytics/matches', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get daily match counts
    const matches = await prisma.match.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        ranked: true,
      },
    });

    // Group by day
    const dailyStats: Record<string, { total: number; ranked: number }> = {};
    for (const match of matches) {
      const day = match.createdAt.toISOString().split('T')[0];
      if (!dailyStats[day]) {
        dailyStats[day] = { total: 0, ranked: 0 };
      }
      dailyStats[day].total++;
      if (match.ranked) dailyStats[day].ranked++;
    }

    // Convert to array sorted by date
    const dailyMatchData = Object.entries(dailyStats)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ dailyMatchData, totalMatches: matches.length });
  } catch (error) {
    next(error);
  }
});

// Get all announcements
adminRouter.get('/announcements', async (_req, res, next) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: [
        { isPinned: 'desc' },
        { publishedAt: 'desc' },
      ],
    });

    res.json({ announcements });
  } catch (error) {
    next(error);
  }
});

// Create announcement
adminRouter.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, type, isPinned, isActive, publishedAt, expiresAt } = req.body;

    if (!title || !content) {
      throw new AppError('Title and content are required', 400);
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        type: type || 'INFO',
        isPinned: isPinned || false,
        isActive: isActive !== false,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        authorId: req.user!.id,
      },
    });

    res.status(201).json({ announcement });
  } catch (error) {
    next(error);
  }
});

// Update announcement
adminRouter.patch('/announcements/:id', async (req, res, next) => {
  try {
    const { title, content, type, isPinned, isActive, publishedAt, expiresAt } = req.body;

    const updateData: Record<string, unknown> = {};
    if (typeof title === 'string') updateData.title = title;
    if (typeof content === 'string') updateData.content = content;
    if (type) updateData.type = type;
    if (typeof isPinned === 'boolean') updateData.isPinned = isPinned;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (publishedAt) updateData.publishedAt = new Date(publishedAt);
    if (expiresAt === null) updateData.expiresAt = null;
    else if (expiresAt) updateData.expiresAt = new Date(expiresAt);

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ announcement });
  } catch (error) {
    next(error);
  }
});

// Delete announcement
adminRouter.delete('/announcements/:id', async (req, res, next) => {
  try {
    await prisma.announcement.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    next(error);
  }
});

// Get popular decks/leaders
adminRouter.get('/analytics/decks', async (_req, res, next) => {
  try {
    const decks = await prisma.deck.findMany({
      select: {
        leaderId: true,
      },
    });

    // Count by leader
    const leaderCounts: Record<string, number> = {};
    for (const deck of decks) {
      if (deck.leaderId) {
        leaderCounts[deck.leaderId] = (leaderCounts[deck.leaderId] || 0) + 1;
      }
    }

    // Sort by count and get top 20
    const popularLeaders = Object.entries(leaderCounts)
      .map(([leaderId, count]) => ({ leaderId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    res.json({ popularLeaders, totalDecks: decks.length });
  } catch (error) {
    next(error);
  }
});
