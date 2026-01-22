import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const reportsRouter = Router();

// All report routes require authentication
reportsRouter.use(authenticate);

// Submit a report
reportsRouter.post('/', async (req, res, next) => {
  try {
    const { type, targetId, matchId, description } = req.body;
    const authorId = req.user!.id;

    if (!type || !targetId || !description) {
      throw new AppError('type, targetId, and description are required', 400);
    }

    // Verify target exists
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new AppError('Target user not found', 404);
    }

    // Can't report yourself
    if (targetId === authorId) {
      throw new AppError('Cannot report yourself', 400);
    }

    // Verify match exists if provided
    if (matchId) {
      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) {
        throw new AppError('Match not found', 404);
      }
    }

    // Check for duplicate recent reports
    const recentReport = await prisma.report.findFirst({
      where: {
        authorId,
        targetId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
    });

    if (recentReport) {
      throw new AppError('You have already reported this user recently', 400);
    }

    const report = await prisma.report.create({
      data: {
        type,
        authorId,
        targetId,
        matchId,
        description,
      },
    });

    res.status(201).json({ report, message: 'Report submitted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get user's submitted reports
reportsRouter.get('/my-reports', async (req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      where: { authorId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        description: true,
        createdAt: true,
        target: { select: { id: true, username: true } },
      },
    });

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});
