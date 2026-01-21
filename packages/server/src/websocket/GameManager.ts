import type { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { 
  WS_EVENTS, 
  GameState, 
  GameAction, 
  GameStateManager,
  GamePhase 
} from '@optcgsim/shared';
import { prisma } from '../services/prisma.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface GameRoom {
  id: string;
  lobbyId?: string;
  player1Id: string;
  player2Id: string;
  player1SocketId: string;
  player2SocketId: string;
  player1DeckId: string;
  player2DeckId: string;
  stateManager: GameStateManager;
  actionLog: GameAction[];
  ranked: boolean;
  startedAt: Date;
  spectators: Set<string>;
}

export class GameManager {
  private io: SocketServer;
  private games: Map<string, GameRoom> = new Map();
  private playerToGame: Map<string, string> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
  }

  async startGame(lobby: any, socket: AuthenticatedSocket) {
    if (lobby.players.length !== 2) return;
    if (lobby.hostId !== socket.userId) return;

    const gameId = uuidv4();
    const player1 = lobby.players[0];
    const player2 = lobby.players[1];

    // Initialize game state manager
    const stateManager = new GameStateManager(gameId, player1.id, player2.id);

    // Load player decks from database
    const [deck1, deck2] = await Promise.all([
      this.loadPlayerDeck(player1.id, player1.deckId),
      this.loadPlayerDeck(player2.id, player2.deckId)
    ]);

    // Setup players with their decks
    stateManager.setupPlayer(player1.id, player1.username, deck1);
    stateManager.setupPlayer(player2.id, player2.username, deck2);

    // Randomly determine first player
    const firstPlayerId = Math.random() < 0.5 ? player1.id : player2.id;
    stateManager.startGame(firstPlayerId);

    const game: GameRoom = {
      id: gameId,
      lobbyId: lobby.id,
      player1Id: player1.id,
      player2Id: player2.id,
      player1SocketId: player1.socketId,
      player2SocketId: player2.socketId,
      player1DeckId: player1.deckId,
      player2DeckId: player2.deckId,
      stateManager,
      actionLog: [],
      ranked: lobby.settings.isRanked,
      startedAt: new Date(),
      spectators: new Set(),
    };

    this.games.set(gameId, game);
    this.playerToGame.set(player1.id, gameId);
    this.playerToGame.set(player2.id, gameId);

    // Join game room
    const player1Socket = this.io.sockets.sockets.get(player1.socketId);
    const player2Socket = this.io.sockets.sockets.get(player2.socketId);

    player1Socket?.join(`game:${gameId}`);
    player2Socket?.join(`game:${gameId}`);

    // Send game start to both players
    this.io.to(`game:${gameId}`).emit(WS_EVENTS.LOBBY_START, {
      gameId,
      state: stateManager.getState(),
    });
  }

  private async loadPlayerDeck(playerId: string, deckId: string) {
    const deck = await prisma.deck.findUnique({
      where: { id: deckId, userId: playerId }
    });

    if (!deck) {
      throw new Error('Deck not found');
    }

    const deckCards = deck.cards as any[];
    
    // Load actual card data
    const cardIds = deckCards.map(c => c.cardId);
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } }
    });

    // Map cards with quantities
    const fullDeck: any[] = [];
    deckCards.forEach(deckCard => {
      const card = cards.find(c => c.id === deckCard.cardId);
      if (card) {
        for (let i = 0; i < deckCard.count; i++) {
          fullDeck.push({
            ...card,
            instanceId: `${card.id}-${i}`
          });
        }
      }
    });

    return fullDeck;
  }


  handleAction(
    socket: AuthenticatedSocket,
    action: GameAction,
    callback: (response: { success: boolean; error?: string }) => void
  ) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) {
      return callback({ success: false, error: 'Not in a game' });
    }

    const game = this.games.get(gameId);
    if (!game) {
      return callback({ success: false, error: 'Game not found' });
    }

    const state = game.stateManager.getState();

    // Validate it's the player's turn
    if (state.activePlayerId !== socket.userId) {
      return callback({ success: false, error: 'Not your turn' });
    }

    // Process action
    const processedAction: GameAction = {
      ...action,
      playerId: socket.userId!,
      timestamp: Date.now(),
    };

    // Apply action using GameStateManager
    const success = game.stateManager.processAction(processedAction);
    
    if (!success) {
      return callback({ success: false, error: 'Invalid action' });
    }

    game.actionLog.push(processedAction);

    const updatedState = game.stateManager.getState();

    // Check for game end
    if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
      this.endGame(gameId, updatedState.winner, 'normal');
      return callback({ success: true });
    }

    // Broadcast updated state
    this.io.to(`game:${gameId}`).emit('game:state', {
      gameState: updatedState
    });

    callback({ success: true });
  }

  handleChat(socket: AuthenticatedSocket, message: string) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) return;

    this.io.to(`game:${gameId}`).emit(WS_EVENTS.GAME_CHAT, {
      senderId: socket.userId,
      senderUsername: socket.username,
      message: message.slice(0, 200), // Limit message length
      timestamp: Date.now(),
    });
  }

  handleSurrender(socket: AuthenticatedSocket) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) return;

    const game = this.games.get(gameId);
    if (!game) return;

    // Determine winner
    const winnerId = socket.userId === game.player1Id
      ? game.player2Id
      : game.player1Id;

    this.endGame(gameId, winnerId, 'surrender');
  }

  handleReconnect(
    socket: AuthenticatedSocket,
    gameId: string,
    callback: (response: { success: boolean; state?: GameState; error?: string }) => void
  ) {
    const game = this.games.get(gameId);
    if (!game) {
      return callback({ success: false, error: 'Game not found' });
    }

    if (socket.userId !== game.player1Id && socket.userId !== game.player2Id) {
      return callback({ success: false, error: 'Not a player in this game' });
    }

    // Update socket ID
    if (socket.userId === game.player1Id) {
      game.player1SocketId = socket.id;
    } else {
      game.player2SocketId = socket.id;
    }

    this.playerToGame.set(socket.userId!, gameId);
    socket.join(`game:${gameId}`);

    callback({ success: true, state: game.stateManager.getState() });
  }

  addSpectator(
    socket: AuthenticatedSocket,
    gameId: string,
    callback: (response: { success: boolean; state?: GameState; error?: string }) => void
  ) {
    const game = this.games.get(gameId);
    if (!game) {
      return callback({ success: false, error: 'Game not found' });
    }

    game.spectators.add(socket.id);
    socket.join(`game:${gameId}`);

    callback({ success: true, state: game.stateManager.getState() });
  }

  removeSpectator(socket: AuthenticatedSocket, gameId: string) {
    const game = this.games.get(gameId);
    if (game) {
      game.spectators.delete(socket.id);
      socket.leave(`game:${gameId}`);
    }
  }

  getGameState(socket: AuthenticatedSocket, gameId: string): GameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    // Check if the socket is a player or spectator in this game
    if (socket.userId !== game.player1Id && 
        socket.userId !== game.player2Id && 
        !game.spectators.has(socket.id)) {
      return null;
    }

    return game.stateManager.getState();
  }

  handleDisconnect(_socket: AuthenticatedSocket) {
    // Handle player disconnect - give them time to reconnect
    // In production, start a reconnection timer
  }

  private async endGame(gameId: string, winnerId: string, reason: string) {
    const game = this.games.get(gameId);
    if (!game) return;

    const state = game.stateManager.getState();

    // Notify players
    this.io.to(`game:${gameId}`).emit('game:ended', {
      winner: winnerId,
      reason,
      gameState: state,
    });

    // Save match to database
    const duration = Math.floor(
      (Date.now() - game.startedAt.getTime()) / 1000
    );

    await prisma.match.create({
      data: {
        id: gameId,
        player1Id: game.player1Id,
        player2Id: game.player2Id,
        winnerId,
        gameLog: game.actionLog as any,
        ranked: game.ranked,
        duration,
      },
    });

    // Update player stats
    await Promise.all([
      prisma.user.update({
        where: { id: winnerId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: 1 },
        },
      }),
      prisma.user.update({
        where: { id: winnerId === game.player1Id ? game.player2Id : game.player1Id },
        data: {
          gamesPlayed: { increment: 1 },
        },
      }),
    ]);

    // Clean up
    this.playerToGame.delete(game.player1Id);
    this.playerToGame.delete(game.player2Id);
    this.games.delete(gameId);
  }
}
