import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { DECK_SIZE, MAX_CARD_COPIES, parseLeaderRestrictions, cardViolatesRestriction } from '@optcgsim/shared';

export const decksRouter = Router();

const deckCardSchema = z.object({
  cardId: z.string(),
  count: z.number().min(1).max(MAX_CARD_COPIES),
});

const createDeckSchema = z.object({
  name: z.string().min(1).max(50),
  leaderId: z.string(),
  cards: z.array(deckCardSchema),
  isPublic: z.boolean().optional().default(false),
});

const updateDeckSchema = createDeckSchema.partial();

// Validate deck
async function validateDeck(leaderId: string, cards: { cardId: string; count: number }[]) {
  // Check leader exists and is a LEADER type
  const leader = await prisma.card.findUnique({
    where: { id: leaderId },
    select: { id: true, type: true, effectText: true, name: true },
  });

  if (!leader) {
    throw new AppError('Leader card not found', 400);
  }

  if (leader.type !== 'LEADER') {
    throw new AppError('Selected card is not a leader', 400);
  }

  // Check total cards
  const totalCards = cards.reduce((sum, c) => sum + c.count, 0);
  if (totalCards !== DECK_SIZE) {
    throw new AppError(`Deck must have exactly ${DECK_SIZE} cards (has ${totalCards})`, 400);
  }

  // Check all cards exist
  const cardIds = cards.map(c => c.cardId);
  const existingCards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, type: true, colors: true, cost: true, name: true },
  });

  const existingCardIds = new Set(existingCards.map((c: any) => c.id));
  const missingCards = cardIds.filter(id => !existingCardIds.has(id));

  if (missingCards.length > 0) {
    throw new AppError(`Cards not found: ${missingCards.join(', ')}`, 400);
  }

  // Check no leaders in deck
  const leadersInDeck = existingCards.filter((c: any) => c.type === 'LEADER');
  if (leadersInDeck.length > 0) {
    throw new AppError('Cannot include leader cards in deck', 400);
  }

  // Check copy limits
  for (const card of cards) {
    if (card.count > MAX_CARD_COPIES) {
      throw new AppError(`Cannot have more than ${MAX_CARD_COPIES} copies of a card`, 400);
    }
  }

  // Check leader deck building restrictions
  if (leader.effectText) {
    const { restrictions } = parseLeaderRestrictions(leader.effectText);
    const cardMap = new Map(existingCards.map((c: any) => [c.id, c]));

    for (const restriction of restrictions) {
      for (const deckCard of cards) {
        const card = cardMap.get(deckCard.cardId);
        if (card && cardViolatesRestriction({ type: card.type, cost: card.cost }, restriction)) {
          throw new AppError(`${card.name} violates leader restriction: ${restriction.description}`, 400);
        }
      }
    }
  }

  return { leader, cards: existingCards };
}

// Get user's decks
decksRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const decks = await prisma.deck.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(decks);
  } catch (error) {
    next(error);
  }
});

// Get public decks
decksRouter.get('/public', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const leaderId = req.query.leaderId as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'updatedAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const where: any = { isPublic: true };
    if (leaderId) {
      where.leaderId = leaderId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: any = {};
    if (sortBy === 'name' || sortBy === 'updatedAt' || sortBy === 'createdAt') {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.updatedAt = 'desc';
    }

    const [decks, total] = await Promise.all([
      prisma.deck.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
      }),
      prisma.deck.count({ where }),
    ]);

    // Get card count for each deck
    const decksWithCount = decks.map((deck: any) => ({
      ...deck,
      cardCount: Array.isArray(deck.cards) ? deck.cards.reduce((sum: number, c: any) => sum + (c.count || 0), 0) : 0,
    }));

    res.json({ decks: decksWithCount, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// Create deck
decksRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const data = createDeckSchema.parse(req.body);

    // Validate deck
    await validateDeck(data.leaderId, data.cards);

    const deck = await prisma.deck.create({
      data: {
        userId: req.user!.id,
        name: data.name,
        leaderId: data.leaderId,
        cards: data.cards,
        isPublic: data.isPublic,
      },
    });

    res.status(201).json(deck);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
});

// Get deck by ID
decksRouter.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    if (!deck) {
      throw new AppError('Deck not found', 404);
    }

    // Check access
    if (!deck.isPublic && deck.userId !== req.user?.id) {
      throw new AppError('Deck not found', 404);
    }

    res.json(deck);
  } catch (error) {
    next(error);
  }
});

// Copy a public deck to user's collection
decksRouter.post('/:id/copy', authenticate, async (req, res, next) => {
  try {
    const sourceDeck = await prisma.deck.findUnique({
      where: { id: req.params.id },
    });

    if (!sourceDeck) {
      throw new AppError('Deck not found', 404);
    }

    // Only allow copying public decks (or user's own decks)
    if (!sourceDeck.isPublic && sourceDeck.userId !== req.user!.id) {
      throw new AppError('Cannot copy private deck', 403);
    }

    // Don't allow copying own deck through this endpoint (use duplicate instead)
    if (sourceDeck.userId === req.user!.id) {
      throw new AppError('Use duplicate to copy your own deck', 400);
    }

    // Create the copy with user's ID
    const newDeck = await prisma.deck.create({
      data: {
        userId: req.user!.id,
        name: `${sourceDeck.name} (Copy)`,
        leaderId: sourceDeck.leaderId,
        cards: sourceDeck.cards as any,
        isPublic: false, // Copied decks are private by default
      },
    });

    res.status(201).json(newDeck);
  } catch (error) {
    next(error);
  }
});

// Update deck
decksRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const data = updateDeckSchema.parse(req.body);

    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
    });

    if (!deck) {
      throw new AppError('Deck not found', 404);
    }

    if (deck.userId !== req.user!.id) {
      throw new AppError('Not authorized', 403);
    }

    // Validate if cards are being updated
    if (data.leaderId || data.cards) {
      await validateDeck(
        data.leaderId || deck.leaderId,
        data.cards || (deck.cards as any[])
      );
    }

    const updated = await prisma.deck.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
});

// Delete deck
decksRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
    });

    if (!deck) {
      throw new AppError('Deck not found', 404);
    }

    if (deck.userId !== req.user!.id) {
      throw new AppError('Not authorized', 403);
    }

    await prisma.deck.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Deck deleted' });
  } catch (error) {
    next(error);
  }
});
