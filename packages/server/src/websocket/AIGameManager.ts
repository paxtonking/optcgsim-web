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
    callback?: (response: { success: boolean; gameId?: string; error?: string }) => void
  ) {
    if (!socket.userId) {
      callback?.({ success: false, error: 'Not authenticated' });
      return;
    }

    // Check if player is already in a game
    if (this.playerToGame.has(socket.userId)) {
      callback?.({ success: false, error: 'Already in a game' });
      return;
    }

    try {
      console.log('[AIGameManager] Starting AI game for user:', socket.userId, 'with deck:', deckId, 'difficulty:', difficulty);

      // Ensure cards are loaded
      await cardLoaderService.loadAllCards();

      const gameId = uuidv4();
      console.log('[AIGameManager] Created gameId:', gameId);
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

      // Don't skip mulligan - let both players decide

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
      console.log('[AIGameManager] Game stored. Total games:', this.games.size);

      // Join game room
      socket.join(`game:${gameId}`);

      // Send initial state
      const initialState = stateManager.getState();
      console.log('[AIGameManager] Emitting lobby:start with state. Phase:', initialState.phase, 'Turn:', initialState.turn);
      console.log('[AIGameManager] Players:', Object.keys(initialState.players));
      socket.emit(WS_EVENTS.LOBBY_START, {
        gameId,
        state: initialState,
        isAIGame: true,
        aiDifficulty: difficulty,
      });

      callback?.({ success: true, gameId });

      // During mulligan phase, AI should make its decision regardless of who goes first
      // Delay AI mulligan decision to let the UI load first
      console.log('[AIGameManager] Processing AI mulligan decision...');
      setTimeout(() => {
        this.processAIMulliganDecision(gameId);
      }, game.aiThinkDelay);

    } catch (error) {
      console.error('[AIGameManager] Error starting AI game:', error);
      callback?.({ success: false, error: 'Failed to start game' });
      // Emit error to client if callback not provided
      socket.emit('error', { message: 'Failed to start AI game' });
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

    // Get all card IDs including the leader
    const deckCards = deck.cards as any[];
    const cardIds = deckCards.map(c => c.cardId);

    // Add leader ID to the list if it exists and isn't already included
    if (deck.leaderId && !cardIds.includes(deck.leaderId)) {
      cardIds.push(deck.leaderId);
    }

    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } }
    });

    const fullDeck: any[] = [];

    // Add leader card first (required for game setup)
    if (deck.leaderId) {
      const leaderCard = cards.find((c: any) => c.id === deck.leaderId);
      if (leaderCard) {
        fullDeck.push({
          ...leaderCard,
          instanceId: `${leaderCard.id}-leader`
        });
        console.log('[AIGameManager] Added leader card:', deck.leaderId);
      } else {
        console.error('[AIGameManager] Leader card not found:', deck.leaderId);
      }
    }

    // Add the rest of the deck cards
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
    callback?: (response: { success: boolean; error?: string }) => void
  ) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) {
      callback?.({ success: false, error: 'Not in a game' });
      return;
    }

    const game = this.games.get(gameId);
    if (!game) {
      callback?.({ success: false, error: 'Game not found' });
      return;
    }

    const state = game.stateManager.getState();

    // Validate it's the player's turn (not AI's)
    if (state.activePlayerId !== socket.userId) {
      // Allow defensive actions during opponent's turn
      // Allow mulligan actions during mulligan phase (both players decide)
      const isMulliganAction = state.phase === GamePhase.START_MULLIGAN;
      const isDefensivePhase = state.phase === GamePhase.COUNTER_STEP || state.phase === GamePhase.BLOCKER_STEP;

      if (!isMulliganAction && !isDefensivePhase) {
        callback?.({ success: false, error: 'Not your turn' });
        return;
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
      callback?.({ success: false, error: 'Invalid action' });
      return;
    }

    game.actionLog.push(processedAction);
    const updatedState = game.stateManager.getState();

    // Check for game end
    if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
      this.endGame(gameId, updatedState.winner, 'normal');
      callback?.({ success: true });
      return;
    }

    // Broadcast updated state
    socket.emit('game:state', { gameState: updatedState });
    callback?.({ success: true });

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
   * Process AI's mulligan decision
   */
  private processAIMulliganDecision(gameId: string) {
    console.log('[AIGameManager] processAIMulliganDecision called. gameId:', gameId);
    const game = this.games.get(gameId);
    if (!game) {
      console.log('[AIGameManager] Game not found in processAIMulliganDecision');
      return;
    }

    const state = game.stateManager.getState();

    // Only process if we're in mulligan phase
    if (state.phase !== GamePhase.START_MULLIGAN) {
      console.log('[AIGameManager] Not in mulligan phase, skipping AI mulligan decision');
      return;
    }

    // Get AI's mulligan decision
    const decision = game.aiPlayer.getNextAction(state);
    console.log('[AIGameManager] AI mulligan decision:', decision);

    if (decision) {
      const aiAction: GameAction = {
        id: uuidv4(),
        type: decision.action,
        playerId: game.aiPlayer.getPlayerId(),
        timestamp: Date.now(),
        data: decision.data,
      };

      const success = game.stateManager.processAction(aiAction);
      console.log('[AIGameManager] AI mulligan action processed:', success);

      if (success) {
        game.actionLog.push(aiAction);
      }

      const updatedState = game.stateManager.getState();

      // Broadcast state to human player
      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:state', { gameState: updatedState });
      }

      // If mulligan phase is complete (both players decided), process first turn
      if (updatedState.phase !== GamePhase.START_MULLIGAN) {
        console.log('[AIGameManager] Mulligan phase complete, phase is now:', updatedState.phase);
        // If it's AI's turn, start processing AI actions
        if (updatedState.activePlayerId === game.aiPlayer.getPlayerId()) {
          setTimeout(() => {
            this.processAITurn(gameId);
          }, game.aiThinkDelay);
        }
      }
    }
  }

  /**
   * Process AI's turn
   */
  private async processAITurn(gameId: string) {
    console.log('[AIGameManager] processAITurn called. gameId:', gameId);
    const game = this.games.get(gameId);
    if (!game) {
      console.log('[AIGameManager] Game not found in processAITurn');
      return;
    }

    const state = game.stateManager.getState();
    console.log('[AIGameManager] Current state - Phase:', state.phase, 'Turn:', state.turn, 'ActivePlayer:', state.activePlayerId);

    // Check if game is over
    if (state.phase === GamePhase.GAME_OVER) {
      console.log('[AIGameManager] Game is already over');
      return;
    }

    // Get AI decision
    const decision = game.aiPlayer.getNextAction(state);
    console.log('[AIGameManager] AI decision:', decision);

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
    console.log('[AIGameManager] endGame called. gameId:', gameId, 'winner:', winnerId, 'reason:', reason);
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

    // Update player stats (skip match record - AI player ID isn't a real user)
    try {
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
      console.error('[AIGameManager] Error updating player stats:', error);
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
    console.log('[AIGameManager] getGameState called. gameId:', gameId, 'userId:', socket.userId);
    console.log('[AIGameManager] Available games:', Array.from(this.games.keys()));
    const game = this.games.get(gameId);
    if (!game) {
      console.log('[AIGameManager] Game not found in games map');
      return null;
    }

    if (socket.userId !== game.humanPlayerId) {
      console.log('[AIGameManager] User mismatch. Expected:', game.humanPlayerId, 'Got:', socket.userId);
      return null;
    }

    console.log('[AIGameManager] Returning game state');
    return game.stateManager.getState();
  }
}
