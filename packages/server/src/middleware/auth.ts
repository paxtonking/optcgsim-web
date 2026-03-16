import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../services/prisma.js';
import { AppError } from './errorHandler.js';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  isGuest: boolean;
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

    const decoded = jwt.verify(token, secret) as { userId: string; isGuest?: boolean; username?: string };

    // Guest users created before the DB-backed guest flow may still have
    // tokens without a corresponding DB row. Handle them with a synthetic
    // req.user so existing sessions are not broken.
    if (decoded.isGuest) {
      // Try to find the guest in the DB first (new flow creates a real row).
      const guestUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, username: true, isAdmin: true, isGuest: true },
      });

      if (guestUser) {
        req.user = guestUser;
      } else {
        // Legacy guest token without a DB row – build a synthetic user.
        req.user = {
          id: decoded.userId,
          email: '',
          username: decoded.username || 'Guest',
          isAdmin: false,
          isGuest: true,
        };
      }
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        isAdmin: true,
        isGuest: true,
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

  authenticate(req, _res, next);
}
