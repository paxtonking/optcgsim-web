import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const tournamentsRouter = Router();

// Get all tournaments (public)
tournamentsRouter.get('/', optionalAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      // By default, show non-draft tournaments
      where.status = { not: 'DRAFT' };
    }

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { participants: true },
          },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    res.json({ tournaments, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// Get tournament by ID
tournamentsRouter.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, eloRating: true, avatarId: true },
            },
          },
          orderBy: { seed: 'asc' },
        },
        matches: {
          orderBy: [{ round: 'asc' }, { matchNumber: 'asc' }],
        },
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    // Check if user is registered
    let isRegistered = false;
    let userParticipant = null;
    if (req.user) {
      userParticipant = tournament.participants.find(p => p.userId === req.user!.id);
      isRegistered = !!userParticipant;
    }

    res.json({ tournament, isRegistered, userParticipant });
  } catch (error) {
    next(error);
  }
});

// Register for tournament
tournamentsRouter.post('/:id/register', authenticate, async (req, res, next) => {
  try {
    const { deckId } = req.body;
    const tournamentId = req.params.id;
    const userId = req.user!.id;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        _count: { select: { participants: true } },
      },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError('Tournament is not open for registration', 400);
    }

    if (tournament._count.participants >= tournament.maxParticipants) {
      throw new AppError('Tournament is full', 400);
    }

    // Check registration period
    const now = new Date();
    if (tournament.registrationStart && now < tournament.registrationStart) {
      throw new AppError('Registration has not started yet', 400);
    }
    if (tournament.registrationEnd && now > tournament.registrationEnd) {
      throw new AppError('Registration has ended', 400);
    }

    // Check if already registered
    const existing = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: { tournamentId, userId },
      },
    });

    if (existing) {
      throw new AppError('Already registered for this tournament', 400);
    }

    // Validate deck if provided
    if (deckId) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
      });
      if (!deck) {
        throw new AppError('Deck not found', 404);
      }
    }

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId,
        userId,
        deckId,
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    res.status(201).json({ participant });
  } catch (error) {
    next(error);
  }
});

// Withdraw from tournament
tournamentsRouter.delete('/:id/register', authenticate, async (req, res, next) => {
  try {
    const tournamentId = req.params.id;
    const userId = req.user!.id;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status !== 'REGISTRATION' && tournament.status !== 'DRAFT') {
      throw new AppError('Cannot withdraw after tournament has started', 400);
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: { tournamentId, userId },
      },
    });

    if (!participant) {
      throw new AppError('Not registered for this tournament', 400);
    }

    await prisma.tournamentParticipant.delete({
      where: { id: participant.id },
    });

    res.json({ message: 'Successfully withdrawn from tournament' });
  } catch (error) {
    next(error);
  }
});

// Check in for tournament
tournamentsRouter.post('/:id/checkin', authenticate, async (req, res, next) => {
  try {
    const tournamentId = req.params.id;
    const userId = req.user!.id;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError('Check-in is not available', 400);
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: { tournamentId, userId },
      },
    });

    if (!participant) {
      throw new AppError('Not registered for this tournament', 400);
    }

    if (participant.status === 'CHECKED_IN') {
      throw new AppError('Already checked in', 400);
    }

    const updated = await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });

    res.json({ participant: updated });
  } catch (error) {
    next(error);
  }
});

// Update participant deck
tournamentsRouter.patch('/:id/deck', authenticate, async (req, res, next) => {
  try {
    const { deckId } = req.body;
    const tournamentId = req.params.id;
    const userId = req.user!.id;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError('Cannot change deck after tournament has started', 400);
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: { tournamentId, userId },
      },
    });

    if (!participant) {
      throw new AppError('Not registered for this tournament', 400);
    }

    // Validate deck
    if (deckId) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
      });
      if (!deck) {
        throw new AppError('Deck not found', 404);
      }
    }

    const updated = await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: { deckId },
    });

    res.json({ participant: updated });
  } catch (error) {
    next(error);
  }
});

// Get tournament bracket
tournamentsRouter.get('/:id/bracket', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        matches: {
          orderBy: [{ round: 'asc' }, { matchNumber: 'asc' }],
        },
        participants: {
          include: {
            user: {
              select: { id: true, username: true, avatarId: true },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    // Build bracket structure
    const userMap = new Map(
      tournament.participants.map(p => [p.userId, p.user])
    );

    const bracket = tournament.matches.map(match => ({
      ...match,
      player1: match.player1Id ? userMap.get(match.player1Id) : null,
      player2: match.player2Id ? userMap.get(match.player2Id) : null,
      winner: match.winnerId ? userMap.get(match.winnerId) : null,
    }));

    // Group by round
    const rounds: Record<number, typeof bracket> = {};
    bracket.forEach(match => {
      if (!rounds[match.round]) {
        rounds[match.round] = [];
      }
      rounds[match.round].push(match);
    });

    res.json({ bracket, rounds, format: tournament.format });
  } catch (error) {
    next(error);
  }
});

// Get user's tournament matches
tournamentsRouter.get('/:id/my-matches', authenticate, async (req, res, next) => {
  try {
    const tournamentId = req.params.id;
    const userId = req.user!.id;

    const matches = await prisma.tournamentMatch.findMany({
      where: {
        tournamentId,
        OR: [
          { player1Id: userId },
          { player2Id: userId },
        ],
      },
      orderBy: { round: 'asc' },
    });

    res.json({ matches });
  } catch (error) {
    next(error);
  }
});
