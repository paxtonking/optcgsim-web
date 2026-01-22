import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';

import { authRouter } from './api/auth.js';
import { usersRouter } from './api/users.js';
import { decksRouter } from './api/decks.js';
import { cardsRouter } from './api/cards.js';
import { matchesRouter } from './api/matches.js';
import { leaderboardRouter } from './api/leaderboard.js';
import friendsRouter from './api/friends.js';
import { adminRouter } from './api/admin.js';
import { announcementsRouter } from './api/announcements.js';
import { tournamentsRouter } from './api/tournaments.js';
import { reportsRouter } from './api/reports.js';
import { gameModesRouter } from './api/gameModes.js';
import { imagesRouter } from './api/images.js';
import { setupWebSocket } from './websocket/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/decks', decksRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/game-modes', gameModesRouter);
app.use('/api/images', imagesRouter);

// Error handling
app.use(errorHandler);

// WebSocket setup
setupWebSocket(io);

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});

export { app, io };
