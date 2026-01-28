import type { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { WS_EVENTS } from '@optcgsim/shared';
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
    socket.on(WS_EVENTS.LOBBY_CREATE, (settings, callback) => {
      lobbyManager.createLobby(socket, settings, callback);
    });

    // Rate limited: 5 attempts per minute (prevents lobby code brute-forcing)
    socket.on(WS_EVENTS.LOBBY_JOIN, (code, callback) => {
      if (!rateLimiter.isAllowed(`${socket.userId}:lobby-join`, 5, 60000)) {
        return callback?.({ success: false, error: 'Too many attempts. Please wait.' });
      }
      lobbyManager.joinLobby(socket, code, callback);
    });

    socket.on(WS_EVENTS.LOBBY_LEAVE, () => {
      lobbyManager.leaveLobby(socket);
    });

    socket.on(WS_EVENTS.LOBBY_READY, () => {
      lobbyManager.setReady(socket);
    });

    socket.on(WS_EVENTS.LOBBY_START, () => {
      const lobby = lobbyManager.getLobbyByPlayer(socket.userId!);
      if (lobby) {
        gameManager.startGame(lobby, socket);
      }
    });

    // Queue events (ranked - requires login)
    socket.on(WS_EVENTS.QUEUE_JOIN, (deckId, callback) => {
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
      gameManager.handleAction(socket, data.action, callback);
    });
    
    socket.on('game:getState', (data) => {
      const gameId = data.gameId;
      const state = gameManager.getGameState(socket, gameId);
      if (state) {
        socket.emit('game:state', { gameState: state });
      } else {
        socket.emit('game:error', { error: 'Game not found or access denied' });
      }
    });

    socket.on(WS_EVENTS.GAME_ACTION, (action, callback) => {
      gameManager.handleAction(socket, action, callback);
    });

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
      gameManager.handleReconnect(socket, gameId, callback);
    });

    // Rock-Paper-Scissors events (first player determination)
    socket.on(WS_EVENTS.RPS_CHOOSE, (data: { gameId: string; choice: 'rock' | 'paper' | 'scissors' }) => {
      gameManager.handleRPSChoice(socket, data.gameId, data.choice);
    });

    socket.on(WS_EVENTS.FIRST_CHOICE, (data: { gameId: string; goFirst: boolean }) => {
      gameManager.handleFirstChoice(socket, data.gameId, data.goFirst);
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
      const { deckId, difficulty = 'basic' } = data;
      aiGameManager.startAIGame(socket, deckId, difficulty, callback);
    });

    socket.on('ai:action', (data, callback) => {
      aiGameManager.handleAction(socket, data.action, callback);
    });

    socket.on('ai:surrender', () => {
      aiGameManager.handleSurrender(socket);
    });

    // AI game first choice (player chooses first/second)
    socket.on('ai:first-choice', (data: { gameId: string; goFirst: boolean }) => {
      aiGameManager.handleFirstChoice(socket, data.gameId, data.goFirst);
    });

    socket.on('ai:getState', (data) => {
      console.log('[WebSocket] ai:getState received. gameId:', data.gameId, 'userId:', socket.userId);
      const gameId = data.gameId;
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
