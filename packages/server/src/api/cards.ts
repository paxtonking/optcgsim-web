import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const cardsRouter = Router();

// Search cards
cardsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Build filters
    const where: any = {};

    if (req.query.search) {
      where.name = {
        contains: req.query.search as string,
        mode: 'insensitive',
      };
    }

    if (req.query.type) {
      where.type = req.query.type as string;
    }

    if (req.query.setCode) {
      where.setCode = req.query.setCode as string;
    }

    if (req.query.color) {
      where.colors = {
        has: req.query.color as string,
      };
    }

    if (req.query.cost) {
      where.cost = parseInt(req.query.cost as string);
    }

    if (req.query.minCost) {
      where.cost = {
        ...where.cost,
        gte: parseInt(req.query.minCost as string),
      };
    }

    if (req.query.maxCost) {
      where.cost = {
        ...where.cost,
        lte: parseInt(req.query.maxCost as string),
      };
    }

    if (req.query.power) {
      where.power = parseInt(req.query.power as string);
    }

    if (req.query.minPower) {
      where.power = {
        ...where.power,
        gte: parseInt(req.query.minPower as string),
      };
    }

    if (req.query.maxPower) {
      where.power = {
        ...where.power,
        lte: parseInt(req.query.maxPower as string),
      };
    }

    if (req.query.trait) {
      where.traits = {
        has: req.query.trait as string,
      };
    }

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        orderBy: [
          { setCode: 'asc' },
          { cardNumber: 'asc' },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.card.count({ where }),
    ]);

    res.json({ cards, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

// Get card sets
cardsRouter.get('/sets', async (_req, res, next) => {
  try {
    const sets = await prisma.cardSet.findMany({
      where: { isActive: true },
      orderBy: { releaseDate: 'desc' },
    });

    res.json(sets);
  } catch (error) {
    next(error);
  }
});

// Get card by ID
cardsRouter.get('/:id', async (req, res, next) => {
  try {
    const card = await prisma.card.findUnique({
      where: { id: req.params.id },
    });

    if (!card) {
      throw new AppError('Card not found', 404);
    }

    res.json(card);
  } catch (error) {
    next(error);
  }
});

// Get all leaders
cardsRouter.get('/type/leaders', async (_req, res, next) => {
  try {
    const leaders = await prisma.card.findMany({
      where: { type: 'LEADER' },
      orderBy: [
        { setCode: 'asc' },
        { cardNumber: 'asc' },
      ],
    });

    res.json(leaders);
  } catch (error) {
    next(error);
  }
});
