import { Router } from 'express';
import { TournamentMatchStatus } from '@prisma/client';
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

// ============== TOURNAMENT MANAGEMENT ==============

// Get all tournaments (admin view)
adminRouter.get('/tournaments', async (_req, res, next) => {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { participants: true, matches: true } },
      },
    });

    res.json({ tournaments });
  } catch (error) {
    next(error);
  }
});

// Create tournament
adminRouter.post('/tournaments', async (req, res, next) => {
  try {
    const {
      name,
      description,
      format,
      maxParticipants,
      minParticipants,
      registrationStart,
      registrationEnd,
      startDate,
      rules,
      prizes,
      isRanked,
      bestOf,
    } = req.body;

    if (!name) {
      throw new AppError('Tournament name is required', 400);
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        description,
        format: format || 'SINGLE_ELIMINATION',
        maxParticipants: maxParticipants || 32,
        minParticipants: minParticipants || 4,
        registrationStart: registrationStart ? new Date(registrationStart) : null,
        registrationEnd: registrationEnd ? new Date(registrationEnd) : null,
        startDate: startDate ? new Date(startDate) : null,
        rules,
        prizes,
        isRanked: isRanked || false,
        bestOf: bestOf || 1,
        createdById: req.user!.id,
        status: 'DRAFT',
      },
    });

    res.status(201).json({ tournament });
  } catch (error) {
    next(error);
  }
});

// Update tournament
adminRouter.patch('/tournaments/:id', async (req, res, next) => {
  try {
    const {
      name,
      description,
      format,
      status,
      maxParticipants,
      minParticipants,
      registrationStart,
      registrationEnd,
      startDate,
      endDate,
      rules,
      prizes,
      isRanked,
      bestOf,
    } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (format !== undefined) updateData.format = format;
    if (status !== undefined) updateData.status = status;
    if (maxParticipants !== undefined) updateData.maxParticipants = maxParticipants;
    if (minParticipants !== undefined) updateData.minParticipants = minParticipants;
    if (registrationStart !== undefined) updateData.registrationStart = registrationStart ? new Date(registrationStart) : null;
    if (registrationEnd !== undefined) updateData.registrationEnd = registrationEnd ? new Date(registrationEnd) : null;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (rules !== undefined) updateData.rules = rules;
    if (prizes !== undefined) updateData.prizes = prizes;
    if (isRanked !== undefined) updateData.isRanked = isRanked;
    if (bestOf !== undefined) updateData.bestOf = bestOf;

    const tournament = await prisma.tournament.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ tournament });
  } catch (error) {
    next(error);
  }
});

// Delete tournament
adminRouter.delete('/tournaments/:id', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status === 'IN_PROGRESS') {
      throw new AppError('Cannot delete a tournament in progress', 400);
    }

    await prisma.tournament.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Tournament deleted' });
  } catch (error) {
    next(error);
  }
});

// Generate bracket for tournament
adminRouter.post('/tournaments/:id/generate-bracket', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          where: {
            status: { in: ['CHECKED_IN', 'REGISTERED'] },
          },
          include: {
            user: { select: { eloRating: true } },
          },
        },
      },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError('Tournament must be in registration status', 400);
    }

    if (tournament.participants.length < tournament.minParticipants) {
      throw new AppError(`Need at least ${tournament.minParticipants} participants`, 400);
    }

    // Delete existing matches
    await prisma.tournamentMatch.deleteMany({
      where: { tournamentId: tournament.id },
    });

    // Sort participants by ELO for seeding
    const sortedParticipants = tournament.participants
      .sort((a, b) => (b.user.eloRating || 1000) - (a.user.eloRating || 1000));

    // Update seeds
    for (let i = 0; i < sortedParticipants.length; i++) {
      await prisma.tournamentParticipant.update({
        where: { id: sortedParticipants[i].id },
        data: { seed: i + 1, status: 'ACTIVE' },
      });
    }

    // Generate single elimination bracket
    const numParticipants = sortedParticipants.length;
    const numRounds = Math.ceil(Math.log2(numParticipants));
    const bracketSize = Math.pow(2, numRounds);

    const matches: { round: number; matchNumber: number; player1Id: string | null; player2Id: string | null; status: TournamentMatchStatus }[] = [];

    // First round with byes
    const firstRoundMatches = bracketSize / 2;
    for (let i = 0; i < firstRoundMatches; i++) {
      const player1Seed = i + 1;
      const player2Seed = bracketSize - i;

      const player1 = sortedParticipants[player1Seed - 1];
      const player2 = sortedParticipants[player2Seed - 1];

      matches.push({
        round: 1,
        matchNumber: i + 1,
        player1Id: player1?.userId || null,
        player2Id: player2?.userId || null,
        status: player1 && player2 ? TournamentMatchStatus.PENDING : TournamentMatchStatus.BYE,
      });
    }

    // Create remaining rounds
    let matchesInRound = firstRoundMatches / 2;
    for (let round = 2; round <= numRounds; round++) {
      for (let i = 0; i < matchesInRound; i++) {
        matches.push({
          round,
          matchNumber: i + 1,
          player1Id: null,
          player2Id: null,
          status: TournamentMatchStatus.PENDING,
        });
      }
      matchesInRound = matchesInRound / 2;
    }

    // Create matches in database
    await prisma.tournamentMatch.createMany({
      data: matches.map(m => ({
        tournamentId: tournament.id,
        ...m,
      })),
    });

    // Handle byes - advance players with byes
    const byeMatches = matches.filter(m => m.status === TournamentMatchStatus.BYE);
    for (const byeMatch of byeMatches) {
      const winnerId = byeMatch.player1Id || byeMatch.player2Id;
      if (winnerId) {
        await prisma.tournamentMatch.updateMany({
          where: {
            tournamentId: tournament.id,
            round: byeMatch.round,
            matchNumber: byeMatch.matchNumber,
          },
          data: {
            winnerId,
            status: 'COMPLETED',
          },
        });
      }
    }

    // Update tournament status
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'IN_PROGRESS' },
    });

    res.json({ message: 'Bracket generated', matchCount: matches.length });
  } catch (error) {
    next(error);
  }
});

// Update match result
adminRouter.patch('/tournaments/:tournamentId/matches/:matchId', async (req, res, next) => {
  try {
    const { winnerId, player1Score, player2Score } = req.body;

    const match = await prisma.tournamentMatch.findFirst({
      where: {
        id: req.params.matchId,
        tournamentId: req.params.tournamentId,
      },
    });

    if (!match) {
      throw new AppError('Match not found', 404);
    }

    const updateData: Record<string, unknown> = {};
    if (winnerId !== undefined) {
      updateData.winnerId = winnerId;
      updateData.status = 'COMPLETED';
      updateData.completedAt = new Date();
    }
    if (player1Score !== undefined) updateData.player1Score = player1Score;
    if (player2Score !== undefined) updateData.player2Score = player2Score;

    const updatedMatch = await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: updateData,
    });

    // If match completed, update eliminated player and advance winner
    if (winnerId) {
      const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;

      if (loserId) {
        await prisma.tournamentParticipant.updateMany({
          where: {
            tournamentId: req.params.tournamentId,
            userId: loserId,
          },
          data: { status: 'ELIMINATED' },
        });
      }

      // Update winner's record
      await prisma.tournamentParticipant.updateMany({
        where: {
          tournamentId: req.params.tournamentId,
          userId: winnerId,
        },
        data: { wins: { increment: 1 } },
      });

      // Update loser's record
      if (loserId) {
        await prisma.tournamentParticipant.updateMany({
          where: {
            tournamentId: req.params.tournamentId,
            userId: loserId,
          },
          data: { losses: { increment: 1 } },
        });
      }
    }

    res.json({ match: updatedMatch });
  } catch (error) {
    next(error);
  }
});

// ============== REPORT MANAGEMENT ==============

// Get all reports
adminRouter.get('/reports', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const where: any = {};
    if (status) where.status = status;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          author: { select: { id: true, username: true } },
          target: { select: { id: true, username: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ reports, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// Get report by ID
adminRouter.get('/reports/:id', async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, username: true, email: true } },
        target: { select: { id: true, username: true, email: true, eloRating: true, gamesPlayed: true } },
      },
    });

    if (!report) {
      throw new AppError('Report not found', 404);
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

// Update report status
adminRouter.patch('/reports/:id', async (req, res, next) => {
  try {
    const { status, resolution } = req.body;

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status === 'RESOLVED' || status === 'DISMISSED') {
        updateData.reviewedBy = req.user!.id;
        updateData.reviewedAt = new Date();
      }
    }
    if (resolution !== undefined) updateData.resolution = resolution;

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

// ============== SUSPENSION MANAGEMENT ==============

// Get user suspensions
adminRouter.get('/suspensions', async (req, res, next) => {
  try {
    const isActive = req.query.active === 'true';
    const userId = req.query.userId as string | undefined;

    const where: any = {};
    if (isActive) where.isActive = true;
    if (userId) where.userId = userId;

    const suspensions = await prisma.suspension.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    });

    res.json({ suspensions });
  } catch (error) {
    next(error);
  }
});

// Create suspension
adminRouter.post('/suspensions', async (req, res, next) => {
  try {
    const { userId, type, reason, reportId, expiresAt } = req.body;

    if (!userId || !type || !reason) {
      throw new AppError('userId, type, and reason are required', 400);
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Don't allow suspending admins
    if (user.isAdmin) {
      throw new AppError('Cannot suspend an admin', 400);
    }

    const suspension = await prisma.suspension.create({
      data: {
        userId,
        type,
        reason,
        reportId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        issuedBy: req.user!.id,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    res.status(201).json({ suspension });
  } catch (error) {
    next(error);
  }
});

// Revoke suspension
adminRouter.patch('/suspensions/:id/revoke', async (req, res, next) => {
  try {
    const suspension = await prisma.suspension.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ suspension, message: 'Suspension revoked' });
  } catch (error) {
    next(error);
  }
});
