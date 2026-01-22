import type { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { WS_EVENTS } from '@optcgsim/shared';
import { prisma } from '../services/prisma.js';
import { LobbyManager } from './LobbyManager.js';
import { GameManager } from './GameManager.js';
import { QueueManager } from './QueueManager.js';
import { AIGameManager } from './AIGameManager.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  isGuest?: boolean;
}

export function setupWebSocket(io: SocketServer) {
  const lobbyManager = new LobbyManager(io);
  const gameManager = new GameManager(io);
  const queueManager = new QueueManager(io, gameManager);
  const aiGameManager = new AIGameManager(io);

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
    }

    // Lobby events
    socket.on(WS_EVENTS.LOBBY_CREATE, (settings, callback) => {
      lobbyManager.createLobby(socket, settings, callback);
    });

    socket.on(WS_EVENTS.LOBBY_JOIN, (code, callback) => {
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

    socket.on(WS_EVENTS.GAME_CHAT, (message) => {
      gameManager.handleChat(socket, message);
    });

    socket.on(WS_EVENTS.GAME_SURRENDER, () => {
      gameManager.handleSurrender(socket);
    });

    socket.on(WS_EVENTS.GAME_RECONNECT, (gameId, callback) => {
      gameManager.handleReconnect(socket, gameId, callback);
    });

    // Spectator events
    socket.on(WS_EVENTS.SPECTATE_JOIN, (gameId, callback) => {
      gameManager.addSpectator(socket, gameId, callback);
    });

    socket.on(WS_EVENTS.SPECTATE_LEAVE, (gameId) => {
      gameManager.removeSpectator(socket, gameId);
    });

    socket.on('spectate:getLiveGames', (callback) => {
      const liveGames = gameManager.getLiveGames();
      callback?.({ success: true, games: liveGames });
    });

    // Challenge events
    socket.on(WS_EVENTS.CHALLENGE_SEND, (data, callback) => {
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

    socket.on('ai:getState', (data) => {
      const gameId = data.gameId;
      const state = aiGameManager.getGameState(socket, gameId);
      if (state) {
        socket.emit('game:state', { gameState: state });
      } else {
        socket.emit('game:error', { error: 'AI game not found' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);
      if (socket.userId) {
        lobbyManager.unregisterUserSocket(socket.userId);
      }
      lobbyManager.handleDisconnect(socket);
      queueManager.leaveQueue(socket);
      gameManager.handleDisconnect(socket);
      aiGameManager.handleDisconnect(socket);
    });
  });
}
