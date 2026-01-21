import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { DECK_SIZE, MAX_CARD_COPIES } from '@optcgsim/shared';

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
    select: { id: true, type: true, colors: true },
  });

  const existingCardIds = new Set(existingCards.map(c => c.id));
  const missingCards = cardIds.filter(id => !existingCardIds.has(id));

  if (missingCards.length > 0) {
    throw new AppError(`Cards not found: ${missingCards.join(', ')}`, 400);
  }

  // Check no leaders in deck
  const leadersInDeck = existingCards.filter(c => c.type === 'LEADER');
  if (leadersInDeck.length > 0) {
    throw new AppError('Cannot include leader cards in deck', 400);
  }

  // Check copy limits
  for (const card of cards) {
    if (card.count > MAX_CARD_COPIES) {
      throw new AppError(`Cannot have more than ${MAX_CARD_COPIES} copies of a card`, 400);
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

    const where: any = { isPublic: true };
    if (leaderId) {
      where.leaderId = leaderId;
    }

    const [decks, total] = await Promise.all([
      prisma.deck.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
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

    res.json({ decks, total, limit, offset });
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
