import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../services/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

export const authRouter = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Helper functions
function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, tokenId: uuidv4() },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

// Routes
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, username, password } = registerSchema.parse(req.body);

    // Normalize username to lowercase to prevent case-sensitive duplicates (e.g., "Jeremy1" vs "jeremy1")
    const normalizedUsername = username.toLowerCase();

    // Check if user exists (case-insensitive for username)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: normalizedUsername }],
      },
    });

    if (existingUser) {
      // Generic error message to prevent user enumeration
      throw new AppError('Email or username already in use', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with normalized (lowercase) username
    const user = await prisma.user.create({
      data: {
        email,
        username: normalizedUsername,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        eloRating: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid credentials', 401);
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        eloRating: user.eloRating,
        isAdmin: user.isAdmin,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET!
    ) as { userId: string };

    // Check if session exists
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Generate new tokens
    const tokens = generateTokens(decoded.userId);

    // Update session with new refresh token
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Delete all sessions for this user (logs out from all devices)
    await prisma.session.deleteMany({
      where: { userId: req.user!.id },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Guest session - allows playing casual matches without account
authRouter.post('/guest', async (req, res, next) => {
  try {
    const { username } = req.body;

    // Generate a guest username if not provided
    const guestUsername = username
      ? `Guest_${username.substring(0, 12)}`
      : `Guest_${Math.random().toString(36).substring(2, 8)}`;

    // Generate a temporary guest ID
    const guestId = `guest_${uuidv4()}`;

    // Generate a guest token (longer expiry since no refresh)
    const accessToken = jwt.sign(
      {
        userId: guestId,
        username: guestUsername,
        isGuest: true,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' } // Guest sessions last 24 hours
    );

    res.json({
      user: {
        id: guestId,
        username: guestUsername,
        isGuest: true,
      },
      accessToken,
      // No refresh token for guests
    });
  } catch (error) {
    next(error);
  }
});

// Password reset - request reset email
authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token expiry to 1 hour from now
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Store hashed token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpiry: resetExpiry,
      },
    });

    // Send reset email (with unhashed token)
    await sendPasswordResetEmail(user.email, user.username, resetToken);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    next(error);
  }
});

// Password reset - reset password with token
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError('Token and password are required', 400);
    }

    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    // Invalidate all existing sessions for security
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    res.json({ message: 'Password has been reset successfully. Please log in with your new password.' });
  } catch (error) {
    next(error);
  }
});
