import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../services/prisma.js';
import { AppError } from './errorHandler.js';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new AppError('JWT secret not configured', 500);
    }

    const decoded = jwt.verify(token, secret) as {
      userId: string;
      isGuest?: boolean;
      username?: string;
    };

    // Handle guest users — create a DB row on first REST API call so that
    // foreign-key constraints (e.g. Deck.userId) work correctly.
    if (decoded.isGuest || decoded.userId?.startsWith('guest_')) {
      let guestUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, username: true, isAdmin: true },
      });

      if (!guestUser) {
        try {
          guestUser = await prisma.user.create({
            data: {
              id: decoded.userId,
              email: `${decoded.userId}@guest.local`,
              username: decoded.username || `Guest_${decoded.userId.slice(-6)}`,
            },
            select: { id: true, email: true, username: true, isAdmin: true },
          });
        } catch {
          // Race condition or duplicate — try finding again
          guestUser = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, username: true, isAdmin: true },
          });
          if (!guestUser) {
            throw new AppError('Failed to create guest user', 500);
          }
        }
      }

      req.user = guestUser;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        isAdmin: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else {
      next(new AppError('Authentication failed', 401));
    }
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.user?.isAdmin) {
    return next(new AppError('Admin access required', 403));
  }
  next();
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  // Swallow auth errors — expired/invalid tokens should just proceed
  // without a user rather than returning 401 on public endpoints.
  authenticate(req, _res, (err?: unknown) => {
    if (err) {
      req.user = undefined;
      return next();
    }
    next();
  });
}
