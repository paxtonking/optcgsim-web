/**
 * AIGameManager - Manages games against AI opponents
 *
 * Handles creating games with AI players, processing AI decisions,
 * and coordinating game flow.
 */

import type { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WS_EVENTS,
  GameState,
  GameAction,
  GameStateManager,
  GamePhase,
} from '@optcgsim/shared';
import { prisma } from '../services/prisma.js';
import { cardLoaderService } from '../services/CardLoaderService.js';
import { AIService, createAIPlayer } from '../services/AIService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface AIGameRoom {
  id: string;
  humanPlayerId: string;
  humanSocketId: string;
  humanDeckId: string;
  aiPlayer: AIService;
  aiDeckId: string;
  stateManager: GameStateManager;
  actionLog: GameAction[];
  startedAt: Date;
  aiThinkDelay: number; // Delay in ms to simulate AI thinking
}

// Default AI decks - these are starter deck compositions
const AI_DECKS: Record<string, string[]> = {
  'ai-deck-red': [
    'ST01-001', // Leader: Luffy
    ...Array(4).fill('ST01-004'), // Usopp x4
    ...Array(4).fill('ST01-005'), // Karoo x4
    ...Array(4).fill('ST01-006'), // Sanji x4
    ...Array(4).fill('ST01-007'), // Jinbe x4
    ...Array(4).fill('ST01-008'), // Chopper x4
    ...Array(4).fill('ST01-009'), // Nami x4
    ...Array(4).fill('ST01-010'), // Robin x4
    ...Array(4).fill('ST01-011'), // Franky x4
    ...Array(4).fill('ST01-012'), // Sanji (Rush) x4
    ...Array(4).fill('ST01-013'), // Zoro (Blocker) x4
    ...Array(4).fill('ST01-014'), // Gum-Gum Jet Pistol x4
    ...Array(2).fill('ST01-015'), // Gum-Gum Pistol x2
  ],
  'ai-deck-green': [
    'ST02-001', // Leader: Kid
    ...Array(4).fill('ST02-002'), // Killer x4
    ...Array(4).fill('ST02-003'), // Apoo x4
    ...Array(4).fill('ST02-004'), // Bonney x4
    ...Array(4).fill('ST02-005'), // Law x4
    ...Array(4).fill('ST02-006'), // Hawkins x4
    ...Array(4).fill('ST02-007'), // Heat x4
    ...Array(4).fill('ST02-008'), // Bepo x4
    ...Array(4).fill('ST02-009'), // Bege x4
    ...Array(4).fill('ST02-010'), // Urouge x4
    ...Array(4).fill('ST02-011'), // X Drake x4
    ...Array(4).fill('ST02-013'), // Kid (Character) x4
  ],
};

export class AIGameManager {
  private io: SocketServer;
  private games: Map<string, AIGameRoom> = new Map();
  private playerToGame: Map<string, string> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Start a new game against AI
   */
  async startAIGame(
    socket: AuthenticatedSocket,
    deckId: string,
    difficulty: 'basic' | 'medium' | 'hard' = 'basic',
    callback: (response: { success: boolean; gameId?: string; error?: string }) => void
  ) {
    if (!socket.userId) {
      return callback({ success: false, error: 'Not authenticated' });
    }

    // Check if player is already in a game
    if (this.playerToGame.has(socket.userId)) {
      return callback({ success: false, error: 'Already in a game' });
    }

    try {
      // Ensure cards are loaded
      await cardLoaderService.loadAllCards();

      const gameId = uuidv4();
      const aiPlayer = createAIPlayer(difficulty);

      // Select random AI deck
      const aiDeckKeys = Object.keys(AI_DECKS);
      const aiDeckId = aiDeckKeys[Math.floor(Math.random() * aiDeckKeys.length)];

      // Initialize game state manager
      const stateManager = new GameStateManager(gameId, socket.userId, aiPlayer.getPlayerId());

      // Load card definitions
      const cardDefinitions = cardLoaderService.getAllCards();
      stateManager.loadCardDefinitions(cardDefinitions);

      // Load human player's deck
      const humanDeck = await this.loadPlayerDeck(socket.userId, deckId);

      // Create AI deck from template
      const aiDeck = this.createAIDeck(aiDeckId);

      // Setup players
      stateManager.setupPlayer(socket.userId, socket.username || 'Player', humanDeck);
      stateManager.setupPlayer(aiPlayer.getPlayerId(), `AI (${difficulty})`, aiDeck);

      // Randomly determine first player
      const firstPlayerId = Math.random() < 0.5 ? socket.userId : aiPlayer.getPlayerId();
      stateManager.startGame(firstPlayerId);

      const game: AIGameRoom = {
        id: gameId,
        humanPlayerId: socket.userId,
        humanSocketId: socket.id,
        humanDeckId: deckId,
        aiPlayer,
        aiDeckId,
        stateManager,
        actionLog: [],
        startedAt: new Date(),
        aiThinkDelay: difficulty === 'basic' ? 1000 : difficulty === 'medium' ? 750 : 500,
      };

      this.games.set(gameId, game);
      this.playerToGame.set(socket.userId, gameId);

      // Join game room
      socket.join(`game:${gameId}`);

      // Send initial state
      socket.emit(WS_EVENTS.LOBBY_START, {
        gameId,
        state: stateManager.getState(),
        isAIGame: true,
        aiDifficulty: difficulty,
      });

      callback({ success: true, gameId });

      // If AI goes first, process AI turn
      if (firstPlayerId === aiPlayer.getPlayerId()) {
        this.processAITurn(gameId);
      }

    } catch (error) {
      console.error('[AIGameManager] Error starting AI game:', error);
      callback({ success: false, error: 'Failed to start game' });
    }
  }

  /**
   * Load player deck from database
   */
  private async loadPlayerDeck(playerId: string, deckId: string) {
    const deck = await prisma.deck.findUnique({
      where: { id: deckId, userId: playerId }
    });

    if (!deck) {
      throw new Error('Deck not found');
    }

    const deckCards = deck.cards as any[];
    const cardIds = deckCards.map(c => c.cardId);
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } }
    });

    const fullDeck: any[] = [];
    deckCards.forEach(deckCard => {
      const card = cards.find((c: any) => c.id === deckCard.cardId);
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

  /**
   * Create AI deck from template
   */
  private createAIDeck(deckId: string): any[] {
    const deckTemplate = AI_DECKS[deckId] || AI_DECKS['ai-deck-red'];
    const cards: any[] = [];

    deckTemplate.forEach((cardId, index) => {
      const cardDef = cardLoaderService.getCard(cardId);
      if (cardDef) {
        cards.push({
          id: cardId,
          name: cardDef.name,
          type: cardDef.type,
          colors: cardDef.colors,
          cost: cardDef.cost,
          power: cardDef.power,
          counter: cardDef.counter,
          traits: cardDef.traits,
          instanceId: `ai-${cardId}-${index}`
        });
      }
    });

    return cards;
  }

  /**
   * Handle player action in AI game
   */
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

    // Validate it's the player's turn (not AI's)
    if (state.activePlayerId !== socket.userId) {
      // Allow defensive actions during opponent's turn
      if (state.phase !== GamePhase.COUNTER_STEP && state.phase !== GamePhase.BLOCKER_STEP) {
        return callback({ success: false, error: 'Not your turn' });
      }
    }

    // Process action
    const processedAction: GameAction = {
      ...action,
      playerId: socket.userId!,
      timestamp: Date.now(),
    };

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
    socket.emit('game:state', { gameState: updatedState });
    callback({ success: true });

    // Check if it's now AI's turn OR if AI needs to respond defensively
    if (updatedState.activePlayerId === game.aiPlayer.getPlayerId()) {
      // Delay AI response for better UX
      setTimeout(() => {
        this.processAITurn(gameId);
      }, game.aiThinkDelay);
    } else if (this.needsAIDefensiveAction(updatedState, game)) {
      // AI needs to respond to counter step or blocker step
      setTimeout(() => {
        this.processAIDefensiveAction(gameId);
      }, game.aiThinkDelay);
    }
  }

  /**
   * Check if AI needs to respond with a defensive action
   */
  private needsAIDefensiveAction(state: GameState, game: AIGameRoom): boolean {
    // Check if it's counter or blocker step and AI is the defender
    if (state.phase !== GamePhase.COUNTER_STEP && state.phase !== GamePhase.BLOCKER_STEP) {
      return false;
    }

    // Check if there's active combat
    if (!state.currentCombat) return false;

    // Find attacker owner
    const attackerId = state.currentCombat.attackerId;
    const humanPlayer = state.players[game.humanPlayerId];

    // Check if attacker belongs to human (meaning AI is the defender)
    const attackerInHumanField = humanPlayer?.field.some(c => c.id === attackerId);
    const attackerIsHumanLeader = humanPlayer?.leaderCard?.id === attackerId;

    return attackerInHumanField || attackerIsHumanLeader;
  }

  /**
   * Process AI defensive action (counter/block)
   */
  private processAIDefensiveAction(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) return;

    const state = game.stateManager.getState();

    // Get AI's defensive decision
    const decision = game.aiPlayer.getNextAction(state);

    if (decision) {
      const aiAction: GameAction = {
        id: `ai-def-${Date.now()}`,
        type: decision.action,
        playerId: game.aiPlayer.getPlayerId(),
        timestamp: Date.now(),
        data: decision.data,
      };

      const success = game.stateManager.processAction(aiAction);

      if (success) {
        game.actionLog.push(aiAction);
      }

      const updatedState = game.stateManager.getState();

      // Broadcast state to human player
      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:state', { gameState: updatedState });
      }

      // Check for game end
      if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
        this.endGame(gameId, updatedState.winner, 'normal');
        return;
      }

      // If still in a defensive phase (e.g., moved from counter to blocker), continue
      if (this.needsAIDefensiveAction(updatedState, game)) {
        setTimeout(() => {
          this.processAIDefensiveAction(gameId);
        }, game.aiThinkDelay);
      }
    }
  }

  /**
   * Process AI's turn
   */
  private async processAITurn(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) return;

    const state = game.stateManager.getState();

    // Check if game is over
    if (state.phase === GamePhase.GAME_OVER) return;

    // Get AI decision
    const decision = game.aiPlayer.getNextAction(state);

    if (decision) {
      const aiAction: GameAction = {
        id: uuidv4(),
        type: decision.action,
        playerId: game.aiPlayer.getPlayerId(),
        timestamp: Date.now(),
        data: decision.data,
      };

      const success = game.stateManager.processAction(aiAction);

      if (success) {
        game.actionLog.push(aiAction);
      }

      const updatedState = game.stateManager.getState();

      // Broadcast state to human player
      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:state', { gameState: updatedState });
      }

      // Check for game end
      if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
        this.endGame(gameId, updatedState.winner, 'normal');
        return;
      }

      // Continue AI turn if still AI's turn
      if (updatedState.activePlayerId === game.aiPlayer.getPlayerId()) {
        // Delay next action
        setTimeout(() => {
          this.processAITurn(gameId);
        }, game.aiThinkDelay);
      }
    }
  }

  /**
   * Handle player surrender
   */
  handleSurrender(socket: AuthenticatedSocket) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) return;

    const game = this.games.get(gameId);
    if (!game) return;

    // AI wins by default
    this.endGame(gameId, game.aiPlayer.getPlayerId(), 'surrender');
  }

  /**
   * End the game
   */
  private async endGame(gameId: string, winnerId: string, reason: string) {
    const game = this.games.get(gameId);
    if (!game) return;

    const state = game.stateManager.getState();

    // Notify player
    const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
    if (humanSocket) {
      humanSocket.emit('game:ended', {
        winner: winnerId,
        reason,
        gameState: state,
        isAIGame: true,
      });
    }

    // Save match to database (record AI games separately)
    const duration = Math.floor((Date.now() - game.startedAt.getTime()) / 1000);

    try {
      await prisma.match.create({
        data: {
          id: gameId,
          player1Id: game.humanPlayerId,
          player2Id: game.aiPlayer.getPlayerId(),
          winnerId,
          gameLog: game.actionLog as any,
          ranked: false, // AI games are never ranked
          duration,
        },
      });

      // Update player stats if human won
      if (winnerId === game.humanPlayerId) {
        await prisma.user.update({
          where: { id: game.humanPlayerId },
          data: {
            gamesPlayed: { increment: 1 },
            gamesWon: { increment: 1 },
          },
        });
      } else {
        await prisma.user.update({
          where: { id: game.humanPlayerId },
          data: {
            gamesPlayed: { increment: 1 },
          },
        });
      }
    } catch (error) {
      console.error('[AIGameManager] Error saving match:', error);
    }

    // Clean up
    this.playerToGame.delete(game.humanPlayerId);
    this.games.delete(gameId);
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socket: AuthenticatedSocket) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) return;

    // End game - AI wins by forfeit
    const game = this.games.get(gameId);
    if (game) {
      this.endGame(gameId, game.aiPlayer.getPlayerId(), 'disconnect');
    }
  }

  /**
   * Get game state for reconnection
   */
  getGameState(socket: AuthenticatedSocket, gameId: string): GameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    if (socket.userId !== game.humanPlayerId) {
      return null;
    }

    return game.stateManager.getState();
  }
}
