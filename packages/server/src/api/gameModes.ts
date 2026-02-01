import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const gameModesRouter = Router();

// All game mode routes require authentication
gameModesRouter.use(authenticate);

// ============== SERIES (BEST-OF-X) ==============

// Create a new series
gameModesRouter.post('/series', async (req, res, next) => {
  try {
    const { opponentId, bestOf, ranked } = req.body;
    const userId = req.user!.id;

    if (!opponentId) {
      throw new AppError('Opponent ID is required', 400);
    }

    if (![3, 5].includes(bestOf)) {
      throw new AppError('Best of must be 3 or 5', 400);
    }

    // Verify opponent exists
    const opponent = await prisma.user.findUnique({ where: { id: opponentId } });
    if (!opponent) {
      throw new AppError('Opponent not found', 404);
    }

    const series = await prisma.gameSeries.create({
      data: {
        player1Id: userId,
        player2Id: opponentId,
        bestOf: bestOf || 3,
        ranked: ranked || false,
      },
    });

    res.status(201).json({ series });
  } catch (error) {
    next(error);
  }
});

// Get series by ID
gameModesRouter.get('/series/:id', async (req, res, next) => {
  try {
    const series = await prisma.gameSeries.findUnique({
      where: { id: req.params.id },
      include: {
        matches: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            winnerId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!series) {
      throw new AppError('Series not found', 404);
    }

    res.json({ series });
  } catch (error) {
    next(error);
  }
});

// Get user's active series
gameModesRouter.get('/series', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const series = await prisma.gameSeries.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: 'IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ series });
  } catch (error) {
    next(error);
  }
});

// Record a game result in series (called after match ends)
gameModesRouter.post('/series/:id/record-result', async (req, res, next) => {
  try {
    const { matchId, winnerId } = req.body;
    const userId = req.user!.id;

    if (!winnerId || typeof winnerId !== 'string') {
      throw new AppError('winnerId is required', 400);
    }

    if (matchId && typeof matchId !== 'string') {
      throw new AppError('matchId must be a string', 400);
    }

    const series = await prisma.gameSeries.findUnique({
      where: { id: req.params.id },
    });

    if (!series) {
      throw new AppError('Series not found', 404);
    }

    if (series.status === 'COMPLETED') {
      throw new AppError('Series is already completed', 400);
    }

    if (series.player1Id !== userId && series.player2Id !== userId) {
      throw new AppError('Not authorized to record results for this series', 403);
    }

    if (winnerId !== series.player1Id && winnerId !== series.player2Id) {
      throw new AppError('Winner must be a series participant', 400);
    }

    if (matchId) {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        select: { id: true, seriesId: true, player1Id: true, player2Id: true },
      });

      if (!match) {
        throw new AppError('Match not found', 404);
      }

      if (match.seriesId && match.seriesId !== series.id) {
        throw new AppError('Match does not belong to this series', 400);
      }

      const matchPlayers = new Set([match.player1Id, match.player2Id]);
      if (!matchPlayers.has(series.player1Id) || !matchPlayers.has(series.player2Id)) {
        throw new AppError('Match players do not match series participants', 400);
      }
    }

    // Update series score
    const isPlayer1Winner = winnerId === series.player1Id;
    const newPlayer1Wins = series.player1Wins + (isPlayer1Winner ? 1 : 0);
    const newPlayer2Wins = series.player2Wins + (isPlayer1Winner ? 0 : 1);

    const winsNeeded = Math.ceil(series.bestOf / 2);
    const isSeriesOver = newPlayer1Wins >= winsNeeded || newPlayer2Wins >= winsNeeded;

    const updatedSeries = await prisma.gameSeries.update({
      where: { id: req.params.id },
      data: {
        player1Wins: newPlayer1Wins,
        player2Wins: newPlayer2Wins,
        status: isSeriesOver ? 'COMPLETED' : 'IN_PROGRESS',
        winnerId: isSeriesOver
          ? newPlayer1Wins >= winsNeeded
            ? series.player1Id
            : series.player2Id
          : null,
      },
    });

    // Link match to series
    if (matchId) {
      await prisma.match.update({
        where: { id: matchId },
        data: { seriesId: series.id },
      });
    }

    res.json({
      series: updatedSeries,
      isSeriesOver,
      seriesWinner: isSeriesOver ? updatedSeries.winnerId : null,
    });
  } catch (error) {
    next(error);
  }
});

// ============== DRAFT MODE ==============

// Create a draft lobby
gameModesRouter.post('/draft', async (req, res, next) => {
  try {
    const { name, maxPlayers, packsPerPlayer, cardsPerPack, pickTimeSeconds, setRestrictions } = req.body;
    const userId = req.user!.id;

    const lobby = await prisma.draftLobby.create({
      data: {
        name: name || `${req.user!.username}'s Draft`,
        hostId: userId,
        maxPlayers: maxPlayers || 8,
        packsPerPlayer: packsPerPlayer || 3,
        cardsPerPack: cardsPerPack || 15,
        pickTimeSeconds: pickTimeSeconds || 45,
        setRestrictions: setRestrictions || [],
        players: {
          create: {
            userId,
            seatPosition: 0,
          },
        },
      },
      include: {
        players: true,
      },
    });

    res.status(201).json({ lobby });
  } catch (error) {
    next(error);
  }
});

// Get draft lobby
gameModesRouter.get('/draft/:id', async (req, res, next) => {
  try {
    const lobby = await prisma.draftLobby.findUnique({
      where: { id: req.params.id },
      include: {
        players: {
          orderBy: { seatPosition: 'asc' },
        },
      },
    });

    if (!lobby) {
      throw new AppError('Draft lobby not found', 404);
    }

    res.json({ lobby });
  } catch (error) {
    next(error);
  }
});

// Join a draft lobby
gameModesRouter.post('/draft/:id/join', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const lobby = await prisma.draftLobby.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });

    if (!lobby) {
      throw new AppError('Draft lobby not found', 404);
    }

    if (lobby.status !== 'WAITING') {
      throw new AppError('Draft has already started', 400);
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      throw new AppError('Draft lobby is full', 400);
    }

    if (lobby.players.some(p => p.userId === userId)) {
      throw new AppError('You are already in this lobby', 400);
    }

    const player = await prisma.draftPlayer.create({
      data: {
        lobbyId: lobby.id,
        userId,
        seatPosition: lobby.players.length,
      },
    });

    res.json({ player });
  } catch (error) {
    next(error);
  }
});

// Leave a draft lobby
gameModesRouter.post('/draft/:id/leave', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const lobby = await prisma.draftLobby.findUnique({
      where: { id: req.params.id },
    });

    if (!lobby) {
      throw new AppError('Draft lobby not found', 404);
    }

    if (lobby.status !== 'WAITING') {
      throw new AppError('Cannot leave after draft has started', 400);
    }

    await prisma.draftPlayer.deleteMany({
      where: {
        lobbyId: lobby.id,
        userId,
      },
    });

    res.json({ message: 'Left the draft lobby' });
  } catch (error) {
    next(error);
  }
});

// Start the draft (host only)
gameModesRouter.post('/draft/:id/start', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const lobby = await prisma.draftLobby.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });

    if (!lobby) {
      throw new AppError('Draft lobby not found', 404);
    }

    if (lobby.hostId !== userId) {
      throw new AppError('Only the host can start the draft', 403);
    }

    if (lobby.status !== 'WAITING') {
      throw new AppError('Draft has already started', 400);
    }

    if (lobby.players.length < 2) {
      throw new AppError('Need at least 2 players to start', 400);
    }

    // Generate packs for each player
    const cards = await prisma.card.findMany({
      where: lobby.setRestrictions.length > 0
        ? { setCode: { in: lobby.setRestrictions } }
        : {},
      select: { id: true },
    });

    if (cards.length < lobby.cardsPerPack * lobby.packsPerPlayer * lobby.players.length) {
      throw new AppError('Not enough cards available for draft', 400);
    }

    // Generate random packs
    const generatePack = () => {
      const shuffled = [...cards].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, lobby.cardsPerPack).map(c => c.id);
    };

    // Give first pack to each player
    for (const player of lobby.players) {
      await prisma.draftPlayer.update({
        where: { id: player.id },
        data: {
          currentPack: generatePack(),
        },
      });
    }

    await prisma.draftLobby.update({
      where: { id: lobby.id },
      data: {
        status: 'DRAFTING',
        currentPack: 1,
        currentPick: 1,
      },
    });

    res.json({ message: 'Draft started' });
  } catch (error) {
    next(error);
  }
});

// Make a draft pick
gameModesRouter.post('/draft/:id/pick', async (req, res, next) => {
  try {
    const { cardId } = req.body;
    const userId = req.user!.id;

    const lobby = await prisma.draftLobby.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });

    if (!lobby) {
      throw new AppError('Draft lobby not found', 404);
    }

    if (lobby.status !== 'DRAFTING') {
      throw new AppError('Draft is not in progress', 400);
    }

    const player = lobby.players.find(p => p.userId === userId);
    if (!player) {
      throw new AppError('You are not in this draft', 403);
    }

    const currentPack = player.currentPack as string[];
    if (!currentPack.includes(cardId)) {
      throw new AppError('Card not in your current pack', 400);
    }

    // Add card to drafted cards, remove from pack
    const draftedCards = player.draftedCards as string[];
    const newPack = currentPack.filter(id => id !== cardId);

    await prisma.draftPlayer.update({
      where: { id: player.id },
      data: {
        draftedCards: [...draftedCards, cardId],
        currentPack: newPack,
      },
    });

    res.json({ message: 'Card picked', draftedCount: draftedCards.length + 1 });
  } catch (error) {
    next(error);
  }
});

// List available draft lobbies
gameModesRouter.get('/draft', async (_req, res, next) => {
  try {
    const lobbies = await prisma.draftLobby.findMany({
      where: { status: 'WAITING' },
      include: {
        players: {
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ lobbies });
  } catch (error) {
    next(error);
  }
});

// ============== SEALED MODE ==============

// Generate a sealed pool
gameModesRouter.post('/sealed', async (req, res, next) => {
  try {
    const { packCount, setRestrictions } = req.body;
    const userId = req.user!.id;

    const numPacks = packCount || 6;
    const cardsPerPack = 12;

    // Get available cards
    const cards = await prisma.card.findMany({
      where: setRestrictions?.length > 0
        ? { setCode: { in: setRestrictions } }
        : {},
      select: { id: true },
    });

    if (cards.length < numPacks * cardsPerPack) {
      throw new AppError('Not enough cards available', 400);
    }

    // Generate random pool
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    const cardPool = shuffled.slice(0, numPacks * cardsPerPack).map(c => c.id);

    const pool = await prisma.sealedPool.create({
      data: {
        userId,
        cardPool,
        packCount: numPacks,
        setRestrictions: setRestrictions || [],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    res.status(201).json({ pool });
  } catch (error) {
    next(error);
  }
});

// Get user's sealed pool
gameModesRouter.get('/sealed/:id', async (req, res, next) => {
  try {
    const pool = await prisma.sealedPool.findUnique({
      where: { id: req.params.id },
    });

    if (!pool) {
      throw new AppError('Sealed pool not found', 404);
    }

    if (pool.userId !== req.user!.id) {
      throw new AppError('This is not your sealed pool', 403);
    }

    // Get card details for the pool
    const cardIds = pool.cardPool as string[];
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
    });

    res.json({ pool, cards });
  } catch (error) {
    next(error);
  }
});

// Get user's active sealed pools
gameModesRouter.get('/sealed', async (req, res, next) => {
  try {
    const pools = await prisma.sealedPool.findMany({
      where: {
        userId: req.user!.id,
        status: { in: ['DECK_BUILDING', 'READY'] },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ pools });
  } catch (error) {
    next(error);
  }
});

// Submit sealed deck
gameModesRouter.post('/sealed/:id/submit-deck', async (req, res, next) => {
  try {
    const { deckId } = req.body;

    const pool = await prisma.sealedPool.findUnique({
      where: { id: req.params.id },
    });

    if (!pool) {
      throw new AppError('Sealed pool not found', 404);
    }

    if (pool.userId !== req.user!.id) {
      throw new AppError('This is not your sealed pool', 403);
    }

    if (pool.status !== 'DECK_BUILDING') {
      throw new AppError('Deck already submitted', 400);
    }

    // Verify deck uses only cards from pool
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    });

    if (!deck || deck.userId !== req.user!.id) {
      throw new AppError('Deck not found', 404);
    }

    const poolCards = pool.cardPool as string[];
    const deckCards = (deck.cards as Array<{ cardId: string }>).map(c => c.cardId);
    const invalidCards = deckCards.filter(c => !poolCards.includes(c));

    if (invalidCards.length > 0) {
      throw new AppError('Deck contains cards not in your sealed pool', 400);
    }

    await prisma.sealedPool.update({
      where: { id: pool.id },
      data: {
        finalDeckId: deckId,
        status: 'READY',
      },
    });

    res.json({ message: 'Deck submitted for sealed play' });
  } catch (error) {
    next(error);
  }
});
