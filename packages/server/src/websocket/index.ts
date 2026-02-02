import type { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { WS_EVENTS, GamePhase } from '@optcgsim/shared';
import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { LobbyManager } from './LobbyManager.js';
import { GameManager } from './GameManager.js';
import { QueueManager } from './QueueManager.js';
import { AIGameManager } from './AIGameManager.js';
import { PresenceManager } from './PresenceManager.js';
import { LobbyChatManager } from './LobbyChatManager.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  isGuest?: boolean;
}

// Simple in-memory rate limiter for WebSocket events
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if action is allowed under rate limit
   * @param key - Unique identifier (e.g., `${userId}:${action}`)
   * @param limit - Max requests allowed
   * @param windowMs - Time window in milliseconds
   */
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= limit) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => now - t < maxAge);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

const gameIdPayloadSchema = z.object({
  gameId: z.string().min(1),
});

const firstChoiceSchema = z.object({
  gameId: z.string().min(1),
  goFirst: z.boolean(),
});

const rpsChoiceSchema = z.object({
  gameId: z.string().min(1),
  choice: z.enum(['rock', 'paper', 'scissors']),
});

const actionSchema = z.object({
  type: z.string().min(1),
  data: z.unknown().optional(),
}).passthrough();

// Cleanup rate limiter every minute
setInterval(() => rateLimiter.cleanup(), 60000);

// Export presence manager for use in other modules
let presenceManagerInstance: PresenceManager | null = null;

export function getPresenceManager(): PresenceManager | null {
  return presenceManagerInstance;
}

export function setupWebSocket(io: SocketServer) {
  const lobbyManager = new LobbyManager(io);
  const gameManager = new GameManager(io);
  const queueManager = new QueueManager(io, gameManager);
  const aiGameManager = new AIGameManager(io);
  const presenceManager = new PresenceManager(io);
  const lobbyChatManager = new LobbyChatManager(io);

  // Store instance for external access
  presenceManagerInstance = presenceManager;

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
        username?: string;
        isGuest?: boolean;
      };

      // Handle guest users - no database lookup needed
      if (decoded.isGuest) {
        socket.userId = decoded.userId;
        socket.username = decoded.username || 'Guest';
        socket.isGuest = true;
        return next();
      }

      // Regular users - verify in database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user.id;
      socket.username = user.username;
      socket.isGuest = false;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Register socket for challenge notifications
    if (socket.userId) {
      lobbyManager.registerUserSocket(socket.userId, socket.id);
      presenceManager.userConnected(socket);
    }

    // Handle presence request (get online friends)
    socket.on('presence:getOnlineFriends', async (callback) => {
      if (socket.userId) {
        const onlineFriends = await presenceManager.getOnlineFriends(socket.userId);
        callback?.({ success: true, onlineFriends });
      } else {
        callback?.({ success: false, error: 'Not authenticated' });
      }
    });

    // Lobby chat events (rate limited: 1 message per second)
    socket.on(WS_EVENTS.LOBBY_CHAT_SEND, (message: string) => {
      if (!rateLimiter.isAllowed(`${socket.userId}:lobby-chat`, 1, 1000)) {
        return; // Silently drop rate-limited messages
      }
      lobbyChatManager.handleMessage(socket, message);
    });

    socket.on('lobby:chat:join', () => {
      lobbyChatManager.joinLobbyChat(socket);
    });

    socket.on('lobby:chat:leave', () => {
      lobbyChatManager.leaveLobbyChat(socket);
    });

    // Lobby events
    socket.on(WS_EVENTS.LOBBY_CREATE, (data, callback) => {
      const parsed = z.object({ deckId: z.string().min(1) }).passthrough().safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid lobby create payload' });
        return;
      }
      const { deckId, ...settings } = parsed.data;
      lobbyManager.createLobby(socket, settings, deckId, callback);
    });

    // Rate limited: 5 attempts per minute (prevents lobby code brute-forcing)
    socket.on(WS_EVENTS.LOBBY_JOIN, (data, callback) => {
      const parsed = z.object({
        code: z.string().min(1),
        deckId: z.string().min(1),
      }).safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid lobby join payload' });
        return;
      }
      const { code, deckId } = parsed.data;
      if (!rateLimiter.isAllowed(`${socket.userId}:lobby-join`, 5, 60000)) {
        return callback?.({ success: false, error: 'Too many attempts. Please wait.' });
      }
      lobbyManager.joinLobby(socket, code, deckId, callback);
    });

    socket.on(WS_EVENTS.LOBBY_LEAVE, () => {
      lobbyManager.leaveLobby(socket);
    });

    socket.on(WS_EVENTS.LOBBY_READY, () => {
      lobbyManager.setReady(socket);
    });

    socket.on(WS_EVENTS.LOBBY_START, async () => {
      console.log(`[WebSocket] LOBBY_START received from user ${socket.userId}`);
      const lobby = lobbyManager.getLobbyByPlayer(socket.userId!);
      if (lobby) {
        console.log(`[WebSocket] Found lobby ${lobby.id} for user, calling startGame`);
        try {
          await gameManager.startGame(lobby, socket);
        } catch (error) {
          console.error('[WebSocket] Failed to start game from lobby:', error);
          socket.emit('game:error', { error: 'Failed to start game' });
        }
      } else {
        console.log(`[WebSocket] No lobby found for user ${socket.userId}`);
      }
    });

    // Queue events (ranked - requires login)
    socket.on(WS_EVENTS.QUEUE_JOIN, (data, callback) => {
      const parsed = z.union([
        z.string().min(1),
        z.object({ deckId: z.string().min(1) }),
      ]).safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid queue payload' });
        return;
      }
      const deckId = typeof parsed.data === 'string' ? parsed.data : parsed.data.deckId;
      if ((socket as AuthenticatedSocket).isGuest) {
        return callback?.({ success: false, error: 'Ranked queue requires a registered account' });
      }
      queueManager.joinQueue(socket, deckId, callback);
    });

    socket.on(WS_EVENTS.QUEUE_LEAVE, () => {
      queueManager.leaveQueue(socket);
    });

    // Game events
    socket.on('game:action', (data, callback) => {
      const parsed = z.object({ action: actionSchema }).safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid game action payload' });
        return;
      }
      gameManager.handleAction(socket, parsed.data.action as any, callback);
    });
    
    socket.on('game:getState', (data) => {
      const parsed = gameIdPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('game:error', { error: 'Invalid game state request' });
        return;
      }
      const gameId = parsed.data.gameId;
      console.log(`[WebSocket] game:getState called for game ${gameId} by user ${socket.userId} (socket ${socket.id})`);

      // Check for active game first
      const state = gameManager.getGameState(socket, gameId);
      if (state) {
        // Ensure socket is in the game room (for chat, etc.)
        socket.join(`game:${gameId}`);
        console.log(`[WebSocket] Found active game, sending state. Phase: ${state.phase}`);
        socket.emit('game:state', { gameState: state });
        return;
      }

      // Check for RPS pending game (player reconnecting during RPS phase)
      const rpsState = gameManager.getRPSState(socket, gameId);
      if (rpsState) {
        // Socket already joined in getRPSState
        console.log(`[WebSocket] Found RPS pending game, phase: ${rpsState.phase}`);
        // Re-emit the appropriate event based on phase
        if (rpsState.phase === 'FIRST_CHOICE') {
          socket.emit(WS_EVENTS.FIRST_CHOICE, {
            gameId,
            winnerId: rpsState.winnerId,
          });
        } else {
          socket.emit('lobby:start', {
            gameId,
            phase: GamePhase.RPS_PHASE,
            rpsState: rpsState.rpsState,
          });
        }
        return;
      }

      console.log(`[WebSocket] Game ${gameId} not found for user ${socket.userId}`);
      socket.emit('game:error', { error: 'Game not found or access denied' });
    });

    // NOTE: game:action handler is at line ~206, do not duplicate here

    // Rate limited: 1 message per second
    socket.on(WS_EVENTS.GAME_CHAT, (message) => {
      if (!rateLimiter.isAllowed(`${socket.userId}:game-chat`, 1, 1000)) {
        return; // Silently drop rate-limited messages
      }
      gameManager.handleChat(socket, message);
    });

    socket.on(WS_EVENTS.GAME_SURRENDER, () => {
      gameManager.handleSurrender(socket);
    });

    socket.on(WS_EVENTS.GAME_RECONNECT, (gameId, callback) => {
      if (typeof gameId !== 'string' || !gameId.trim()) {
        callback?.({ success: false, error: 'Invalid reconnect request' });
        return;
      }
      gameManager.handleReconnect(socket, gameId, callback);
    });

    // Rock-Paper-Scissors events (first player determination)
    socket.on(WS_EVENTS.RPS_CHOOSE, (data: { gameId: string; choice: 'rock' | 'paper' | 'scissors' }) => {
      const parsed = rpsChoiceSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('game:error', { error: 'Invalid RPS choice payload' });
        return;
      }
      gameManager.handleRPSChoice(socket, parsed.data.gameId, parsed.data.choice);
    });

    socket.on(WS_EVENTS.FIRST_CHOICE, (data: { gameId: string; goFirst: boolean }) => {
      const parsed = firstChoiceSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('game:error', { error: 'Invalid first-choice payload' });
        return;
      }
      gameManager.handleFirstChoice(socket, parsed.data.gameId, parsed.data.goFirst);
    });

    // Spectator functionality removed for security (prevents information leakage)

    // Challenge events (rate limited: 3 per minute)
    socket.on(WS_EVENTS.CHALLENGE_SEND, (data, callback) => {
      if (!rateLimiter.isAllowed(`${socket.userId}:challenge`, 3, 60000)) {
        return callback?.({ success: false, error: 'Too many challenge requests. Please wait.' });
      }
      lobbyManager.sendChallenge(socket, data, callback);
    });

    socket.on(WS_EVENTS.CHALLENGE_ACCEPT, (data, callback) => {
      lobbyManager.acceptChallenge(socket, data, callback);
    });

    socket.on(WS_EVENTS.CHALLENGE_DECLINE, (data, callback) => {
      lobbyManager.declineChallenge(socket, data, callback);
    });

    socket.on('challenge:cancel', (data, callback) => {
      lobbyManager.cancelChallenge(socket, data, callback);
    });

    // AI Game events (requires login)
    socket.on('ai:start', (data, callback) => {
      if ((socket as AuthenticatedSocket).isGuest) {
        return callback?.({ success: false, error: 'AI games require a registered account' });
      }
      const parsed = z.object({
        deckId: z.string().min(1),
        difficulty: z.enum(['basic', 'medium', 'hard']).optional(),
      }).safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid AI start payload' });
        return;
      }
      const { deckId, difficulty = 'basic' } = parsed.data;
      aiGameManager.startAIGame(socket, deckId, difficulty, callback);
    });

    socket.on('ai:action', (data, callback) => {
      const parsed = z.object({ action: actionSchema }).safeParse(data);
      if (!parsed.success) {
        callback?.({ success: false, error: 'Invalid AI action payload' });
        return;
      }
      aiGameManager.handleAction(socket, parsed.data.action as any, callback);
    });

    socket.on('ai:surrender', () => {
      aiGameManager.handleSurrender(socket);
    });

    // AI game first choice (player chooses first/second)
    socket.on('ai:first-choice', (data: { gameId: string; goFirst: boolean }) => {
      const parsed = firstChoiceSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('game:error', { error: 'Invalid AI first-choice payload' });
        return;
      }
      aiGameManager.handleFirstChoice(socket, parsed.data.gameId, parsed.data.goFirst);
    });

    socket.on('ai:getState', (data) => {
      const parsed = gameIdPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('game:error', { error: 'Invalid AI state request' });
        return;
      }
      const gameId = parsed.data.gameId;
      console.log('[WebSocket] ai:getState received. gameId:', gameId, 'userId:', socket.userId);
      const state = aiGameManager.getGameState(socket, gameId);
      if (state) {
        console.log('[WebSocket] Sending game:state. Phase:', state.phase, 'Players:', Object.keys(state.players).length);
        socket.emit('game:state', { gameState: state });
      } else {
        console.log('[WebSocket] Game not found or user not authorized');
        socket.emit('game:error', { error: 'AI game not found' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);
      if (socket.userId) {
        lobbyManager.unregisterUserSocket(socket.userId);
        presenceManager.userDisconnected(socket);
      }
      lobbyManager.handleDisconnect(socket);
      queueManager.leaveQueue(socket);
      gameManager.handleDisconnect(socket);
      aiGameManager.handleDisconnect(socket);
    });
  });
}
