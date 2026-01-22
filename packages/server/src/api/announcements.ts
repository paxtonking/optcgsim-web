import { Router } from 'express';
import { prisma } from '../services/prisma.js';

export const announcementsRouter = Router();

// Get active announcements (public)
announcementsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const now = new Date();

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        publishedAt: { lte: now },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [
        { isPinned: 'desc' },
        { publishedAt: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        isPinned: true,
        publishedAt: true,
      },
    });

    res.json({ announcements });
  } catch (error) {
    next(error);
  }
});

// Get single announcement (public)
announcementsRouter.get('/:id', async (req, res, next) => {
  try {
    const now = new Date();

    const announcement = await prisma.announcement.findFirst({
      where: {
        id: req.params.id,
        isActive: true,
        publishedAt: { lte: now },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        isPinned: true,
        publishedAt: true,
      },
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement });
  } catch (error) {
    next(error);
  }
});
