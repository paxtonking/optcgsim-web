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
import { AIService, createAIPlayer } from '../services/ai/index.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// Timeout for first choice (in ms)
const FIRST_CHOICE_TIMEOUT = 10000; // 10 seconds

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

interface PendingAIGame {
  gameId: string;
  humanPlayerId: string;
  humanSocketId: string;
  humanDeckId: string;
  humanUsername: string;
  aiPlayer: AIService;
  aiDeckId: string;
  difficulty: 'basic' | 'medium' | 'hard';
  firstChoiceTimeoutId?: NodeJS.Timeout;
}

// Default AI decks - these are starter deck compositions (1 leader + 50 main deck = 51 total)
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
    ...Array(4).fill('ST01-015'), // Gum-Gum Pistol x4 (was x2, increased to x4)
    ...Array(2).fill('ST01-016'), // Gomu Gomu no Elephant Gun x2
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
    ...Array(4).fill('ST02-014'), // Repel x4
    ...Array(2).fill('ST02-015'), // Room x2
  ],
};

export class AIGameManager {
  private io: SocketServer;
  private games: Map<string, AIGameRoom> = new Map();
  private pendingGames: Map<string, PendingAIGame> = new Map();
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

      // Create pending game for first choice
      const pending: PendingAIGame = {
        gameId,
        humanPlayerId: socket.userId,
        humanSocketId: socket.id,
        humanDeckId: deckId,
        humanUsername: socket.username || 'Player',
        aiPlayer,
        aiDeckId,
        difficulty,
      };

      this.pendingGames.set(gameId, pending);
      this.playerToGame.set(socket.userId, gameId);

      // Join game room
      socket.join(`game:${gameId}`);

      console.log('[AIGameManager] Emitting first choice phase for AI game');

      // Send first choice phase to player (they choose first/second directly, no RPS)
      socket.emit(WS_EVENTS.LOBBY_START, {
        gameId,
        phase: GamePhase.FIRST_CHOICE,
        isAIGame: true,
        aiDifficulty: difficulty,
        // Player is the "winner" by default in AI games (they get to choose)
        winnerId: socket.userId,
      });

      callback?.({ success: true, gameId });

      // Start first choice timeout
      pending.firstChoiceTimeoutId = setTimeout(() => {
        this.handleFirstChoiceTimeout(gameId);
      }, FIRST_CHOICE_TIMEOUT);

    } catch (error) {
      console.error('[AIGameManager] Error starting AI game:', error);
      callback?.({ success: false, error: 'Failed to start game' });
      socket.emit('error', { message: 'Failed to start AI game' });
    }
  }

  /**
   * Handle first/second choice from player in AI game
   */
  handleFirstChoice(socket: AuthenticatedSocket, gameId: string, goFirst: boolean) {
    const pending = this.pendingGames.get(gameId);
    if (!pending) {
      console.log(`[AIGameManager] First choice received but no pending game found: ${gameId}`);
      return;
    }

    // Verify it's the correct player
    if (socket.userId !== pending.humanPlayerId) {
      console.log(`[AIGameManager] Wrong player tried to make first choice: ${socket.userId}`);
      return;
    }

    // Clear timeout
    if (pending.firstChoiceTimeoutId) {
      clearTimeout(pending.firstChoiceTimeoutId);
      pending.firstChoiceTimeoutId = undefined;
    }

    // Update socket ID in case user navigated (socket may have changed)
    pending.humanSocketId = socket.id;

    console.log(`[AIGameManager] Player chose to go ${goFirst ? 'first' : 'second'}`);

    // Determine who goes first
    const firstPlayerId = goFirst ? pending.humanPlayerId : pending.aiPlayer.getPlayerId();

    this.finalizeAIGameStart(gameId, firstPlayerId);
  }

  /**
   * Handle first choice timeout - random selection
   */
  private handleFirstChoiceTimeout(gameId: string) {
    const pending = this.pendingGames.get(gameId);
    if (!pending) return;

    console.log(`[AIGameManager] First choice timeout for game ${gameId}, selecting randomly`);

    // Random choice
    const goFirst = Math.random() < 0.5;
    const firstPlayerId = goFirst ? pending.humanPlayerId : pending.aiPlayer.getPlayerId();

    this.finalizeAIGameStart(gameId, firstPlayerId);
  }

  /**
   * Finalize AI game start after first choice
   */
  private async finalizeAIGameStart(gameId: string, firstPlayerId: string) {
    const pending = this.pendingGames.get(gameId);
    if (!pending) return;

    console.log(`[AIGameManager] Finalizing AI game start, first player: ${firstPlayerId}`);

    try {
      // Initialize game state manager
      const stateManager = new GameStateManager(gameId, pending.humanPlayerId, pending.aiPlayer.getPlayerId());

      // Load card definitions
      const cardDefinitions = cardLoaderService.getAllCards();
      console.log(`[AIGameManager] Loaded ${cardDefinitions.length} card definitions`);
      stateManager.loadCardDefinitions(cardDefinitions);

      // Load human player's deck
      console.log(`[AIGameManager] Loading human deck: ${pending.humanDeckId}`);
      const humanDeck = await this.loadPlayerDeck(pending.humanPlayerId, pending.humanDeckId);
      console.log(`[AIGameManager] Human deck loaded with ${humanDeck.length} cards`);

      // Create AI deck from template
      const aiDeck = this.createAIDeck(pending.aiDeckId);
      console.log(`[AIGameManager] AI deck created with ${aiDeck.length} cards`);

      // Setup players
      console.log(`[AIGameManager] Setting up players...`);
      stateManager.setupPlayer(pending.humanPlayerId, pending.humanUsername, humanDeck);
      stateManager.setupPlayer(pending.aiPlayer.getPlayerId(), `AI (${pending.difficulty})`, aiDeck);

      // Start game with chosen first player
      console.log(`[AIGameManager] Starting game...`);
      stateManager.startGame(firstPlayerId);
      console.log(`[AIGameManager] Game started, phase: ${stateManager.getState().phase}`);

    const game: AIGameRoom = {
      id: gameId,
      humanPlayerId: pending.humanPlayerId,
      humanSocketId: pending.humanSocketId,
      humanDeckId: pending.humanDeckId,
      aiPlayer: pending.aiPlayer,
      aiDeckId: pending.aiDeckId,
      stateManager,
      actionLog: [],
      startedAt: new Date(),
      aiThinkDelay: pending.aiPlayer.getThinkDelay(),
    };

    // Move from pending to active games
    this.pendingGames.delete(gameId);
    this.games.set(gameId, game);

    console.log('[AIGameManager] Game stored. Total games:', this.games.size);

    // Send sanitized game state to player (anti-cheat consistency)
    const initialState = stateManager.getState();
    console.log('[AIGameManager] Emitting game:state. Phase:', initialState.phase, 'Turn:', initialState.turn);

    // Notify player who goes first
    const humanSocket = this.io.sockets.sockets.get(pending.humanSocketId);
    if (humanSocket) {
      humanSocket.emit(WS_EVENTS.FIRST_DECIDED, {
        gameId,
        firstPlayerId,
        isAIGame: true,
      });

      humanSocket.emit('game:state', {
        gameState: stateManager.sanitizeStateForPlayer(pending.humanPlayerId),
      });
    }

    // Check if there's a pre-game setup phase to handle first
    const currentPhase = stateManager.getState().phase;
    if (currentPhase === GamePhase.PRE_GAME_SETUP) {
      console.log('[AIGameManager] Processing AI pre-game setup...');
      setTimeout(() => {
        this.processAIPreGameSetup(gameId);
      }, game.aiThinkDelay);
    } else {
      // Process AI mulligan decision after a delay
      console.log('[AIGameManager] Processing AI mulligan decision...');
      setTimeout(() => {
        this.processAIMulliganDecision(gameId);
      }, game.aiThinkDelay);
    }
    } catch (error) {
      console.error('[AIGameManager] Error in finalizeAIGameStart:', error);
      // Notify human player of error
      const humanSocket = this.io.sockets.sockets.get(pending.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:error', { error: 'Failed to start game. Please try again.' });
      }
      // Clean up
      this.pendingGames.delete(gameId);
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

    console.log('[AIGameManager] Processing human action:', action.type, 'playerId:', socket.userId, 'data:', JSON.stringify(action.data));
    const success = game.stateManager.processAction(processedAction);
    console.log('[AIGameManager] Human action processed:', success);

    if (!success) {
      callback?.({ success: false, error: 'Invalid action' });
      return;
    }

    game.actionLog.push(processedAction);
    const updatedState = game.stateManager.getState();
    console.log('[AIGameManager] State after human action - Phase:', updatedState.phase, 'Turn:', updatedState.turn);

    // Check for game end
    if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
      this.endGame(gameId, updatedState.winner, 'normal');
      callback?.({ success: true });
      return;
    }

    // Send sanitized state to human player (anti-cheat consistency)
    console.log('[AIGameManager] Emitting game:state to human player');
    socket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
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
    } else if (updatedState.phase === GamePhase.START_MULLIGAN) {
      // Still in mulligan phase - AI may need to make its mulligan decision
      // This handles the case where human goes first and makes their decision
      // before AI's initial timer fires
      const aiConfirmed = game.stateManager.hasConfirmedHand(game.aiPlayer.getPlayerId());
      if (!aiConfirmed) {
        console.log('[AIGameManager] Human made mulligan decision, triggering AI mulligan');
        setTimeout(() => {
          this.processAIMulliganDecision(gameId);
        }, game.aiThinkDelay);
      }
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
        humanSocket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
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
   * Process AI's pre-game setup (e.g., Imu's start-of-game stage play)
   */
  private processAIPreGameSetup(gameId: string) {
    console.log('[AIGameManager] processAIPreGameSetup called. gameId:', gameId);
    const game = this.games.get(gameId);
    if (!game) {
      console.log('[AIGameManager] Game not found in processAIPreGameSetup');
      return;
    }

    const state = game.stateManager.getState();

    // Only process if we're in pre-game setup phase
    if (state.phase !== GamePhase.PRE_GAME_SETUP) {
      console.log('[AIGameManager] Not in pre-game setup phase, moving to mulligan');
      this.processAIMulliganDecision(gameId);
      return;
    }

    // Get AI's pre-game decision
    const decision = game.aiPlayer.getNextAction(state);
    console.log('[AIGameManager] AI pre-game decision:', decision);

    if (decision) {
      const aiAction: GameAction = {
        id: uuidv4(),
        type: decision.action,
        playerId: game.aiPlayer.getPlayerId(),
        timestamp: Date.now(),
        data: decision.data,
      };

      const success = game.stateManager.processAction(aiAction);
      console.log('[AIGameManager] AI pre-game action processed:', success);

      if (success) {
        game.actionLog.push(aiAction);
      }

      const updatedState = game.stateManager.getState();

      // Broadcast state to human player
      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
      }

      // If pre-game setup is complete, proceed to mulligan
      if (updatedState.phase === GamePhase.START_MULLIGAN) {
        console.log('[AIGameManager] Pre-game setup complete, moving to mulligan');
        setTimeout(() => {
          this.processAIMulliganDecision(gameId);
        }, game.aiThinkDelay);
      } else if (updatedState.phase === GamePhase.PRE_GAME_SETUP) {
        // Still in pre-game setup (maybe waiting for human player)
        console.log('[AIGameManager] Still in pre-game setup phase');
      }
    } else {
      // AI has no pre-game effect to resolve, check if human does
      console.log('[AIGameManager] AI has no pre-game effect, waiting for human or proceeding');
      // The phase will change when all pre-game effects are resolved
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

    // Check if AI already confirmed
    const aiConfirmed = game.stateManager.hasConfirmedHand(game.aiPlayer.getPlayerId());
    console.log('[AIGameManager] AI already confirmed:', aiConfirmed);
    if (aiConfirmed) {
      console.log('[AIGameManager] AI already made mulligan decision, skipping');
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
        humanSocket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
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
        humanSocket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
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
    console.log('[AIGameManager] Pending games:', Array.from(this.pendingGames.keys()));

    // First check active games
    const game = this.games.get(gameId);
    if (game) {
      if (socket.userId !== game.humanPlayerId) {
        console.log('[AIGameManager] User mismatch. Expected:', game.humanPlayerId, 'Got:', socket.userId);
        return null;
      }
      console.log('[AIGameManager] Returning game state from active games');
      return game.stateManager.sanitizeStateForPlayer(game.humanPlayerId);
    }

    // Check pending games (first choice phase)
    const pendingGame = this.pendingGames.get(gameId);
    if (pendingGame) {
      if (socket.userId !== pendingGame.humanPlayerId) {
        console.log('[AIGameManager] User mismatch in pending. Expected:', pendingGame.humanPlayerId, 'Got:', socket.userId);
        return null;
      }
      console.log('[AIGameManager] Game is in pending state (first choice phase)');
      // Return a minimal state indicating we're in first choice phase
      // The client should show the FirstChoiceModal based on the LOBBY_START event
      return {
        id: gameId,
        phase: GamePhase.FIRST_CHOICE,
        turn: 0,
        activePlayerId: pendingGame.humanPlayerId,
        players: {},
        currentCombat: undefined,
        stack: [],
        turnHistory: [],
      } as GameState;
    }

    console.log('[AIGameManager] Game not found in games or pending maps');
    return null;
  }
}
