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
  ActionType,
  CardState,
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
const DISCONNECT_FORFEIT_TIMEOUT = 30000; // 30 seconds

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
  pendingTimeouts: NodeJS.Timeout[]; // Track scheduled timeouts for cleanup
  tutorialAwaitingResume?: boolean; // Pause AI between tutorial attacks until client signals
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

// Tutorial deck templates - fixed card order for scripted tutorial
// Positions 0-4 = Hand, 5-9 = Life (pos 9 damaged first), 10+ = draw pile
const TUTORIAL_PLAYER_DECK: string[] = [
  'ST01-001', // Leader: Luffy
  // Hand (positions 0-4)
  'ST01-007', // Nami (cost 1) - play Turn 1
  'ST01-006', // Chopper (cost 1, Blocker) - play Turn 3
  'ST01-009', // Vivi (cost 2, counter 1000) - defense lesson
  'ST01-011', // Brook (cost 2, counter 2000) - defense lesson
  'ST01-014', // Guard Point (event, Counter +3000) - defense lesson
  // Life (positions 5-9, pos 9 = damaged first)
  'ST01-008', // Robin
  'ST01-010', // Franky
  'ST01-013', // Zoro
  'ST01-004', // Sanji
  'ST01-005', // Jinbe - damaged FIRST, has trigger
  // Draw pile (position 10 = Turn 2 draw, 11 = Turn 3 draw)
  'ST01-003', // Karoo (cost 1) - drawn Turn 2, play Turn 2
  'ST01-012', // Luffy char (cost 5, Rush) - drawn Turn 3
  // Fill remaining to reach 50 main deck cards
  ...Array(3).fill('ST01-012'), // Luffy char x3 (1 above = 4 total)
  ...Array(4).fill('ST01-013'), // Zoro x4 (already 1 in life but these are additional copies)
  ...Array(3).fill('ST01-003'), // Karoo x3 (1 above = 4 total)
  ...Array(3).fill('ST01-004'), // Sanji x3 (1 in life = 4 total)
  ...Array(3).fill('ST01-005'), // Jinbe x3 (1 in life = 4 total)
  ...Array(3).fill('ST01-006'), // Chopper x3 (1 in hand = 4 total)
  ...Array(3).fill('ST01-007'), // Nami x3 (1 in hand = 4 total)
  ...Array(3).fill('ST01-008'), // Robin x3 (1 in life = 4 total)
  ...Array(2).fill('ST01-009'), // Vivi x2 (1 in hand, need total ≤4)
  ...Array(3).fill('ST01-010'), // Franky x3 (1 in life = 4 total)
  ...Array(3).fill('ST01-011'), // Brook x3 (1 in hand = 4 total)
  ...Array(3).fill('ST01-014'), // Guard Point x3 (1 in hand = 4 total)
  ...Array(2).fill('ST01-015'), // Gum-Gum Jet Pistol x2
];

const TUTORIAL_AI_DECK: string[] = [
  'ST02-001', // Leader: Kid
  // Hand (positions 0-4)
  'ST02-012', // Bepo (cost 1) - AI plays Turn 1
  'ST02-011', // Heat (cost 2) - AI plays Turn 2
  'ST02-004', // Bege (cost 1, Blocker) - hand filler
  'ST02-008', // Apoo (cost 2, counter 2000) - hand filler
  'ST02-015', // Scalpel (event, Counter +2000) - hand filler
  // Life (positions 5-9)
  'ST02-002', // Vito
  'ST02-006', // Koby
  'ST02-003', // Urouge
  'ST02-002', // Vito
  'ST02-006', // Koby (no trigger - safe for tutorial Turn 2 attack)
  // Draw pile
  'ST02-011', // Heat - AI Turn 1 draw
  'ST02-008', // Apoo - AI Turn 2 draw
  // Fill remaining to 50
  ...Array(3).fill('ST02-012'), // Bepo x3 (1 in hand = 4 total)
  ...Array(3).fill('ST02-011'), // Heat x3 (1 in hand, 1 in draw = varies)
  ...Array(2).fill('ST02-004'), // Bege x2 (1 in hand)
  ...Array(3).fill('ST02-008'), // Apoo x3 (1 in hand, 1 in draw)
  ...Array(3).fill('ST02-015'), // Scalpel x3 (1 in hand = 4 total)
  ...Array(2).fill('ST02-002'), // Vito x2 (2 in life = 4 total)
  ...Array(4).fill('ST02-003'), // Urouge x4 (already 1 in life)
  ...Array(4).fill('ST02-005'), // Killer x4 (0 in life now)
  ...Array(3).fill('ST02-006'), // Koby x3 (2 in life = 4+1 total needs adjustment)
  ...Array(4).fill('ST02-007'), // Bonney x4
  ...Array(4).fill('ST02-009'), // Law x4
  ...Array(3).fill('ST02-010'), // Hawkins x3
];

export class AIGameManager {
  private io: SocketServer;
  private games: Map<string, AIGameRoom> = new Map();
  private pendingGames: Map<string, PendingAIGame> = new Map();
  private playerToGame: Map<string, string> = new Map();
  private disconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Schedule a timeout that is tracked for cleanup on disconnect
   */
  private scheduleTrackedTimeout(gameId: string, callback: () => void, delay: number): void {
    const game = this.games.get(gameId);
    if (!game) {
      // Game doesn't exist, don't schedule
      return;
    }

    const timeout = setTimeout(() => {
      // Remove from tracking when executed
      if (game.pendingTimeouts) {
        game.pendingTimeouts = game.pendingTimeouts.filter(t => t !== timeout);
      }
      // Only execute if game still exists
      if (this.games.has(gameId)) {
        callback();
      }
    }, delay);

    game.pendingTimeouts.push(timeout);
  }

  /**
   * Cancel all pending AI timeouts for a game (used when pausing for tutorial).
   */
  private clearPendingTimeouts(game: AIGameRoom): void {
    if (game.pendingTimeouts.length > 0) {
      console.log(`[AIGameManager] Clearing ${game.pendingTimeouts.length} pending timeouts for tutorial pause`);
      game.pendingTimeouts.forEach(t => clearTimeout(t));
      game.pendingTimeouts = [];
    }
  }

  private clearDisconnectTimeout(gameId: string): void {
    const timeout = this.disconnectTimeouts.get(gameId);
    if (!timeout) return;

    clearTimeout(timeout);
    this.disconnectTimeouts.delete(gameId);
  }

  private scheduleDisconnectForfeit(gameId: string): void {
    this.clearDisconnectTimeout(gameId);

    const timeout = setTimeout(() => {
      this.disconnectTimeouts.delete(gameId);

      const game = this.games.get(gameId);
      if (!game) return;

      const activeSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (activeSocket?.connected) {
        return;
      }

      void this.endGame(gameId, game.aiPlayer.getPlayerId(), 'disconnect').catch(error => {
        console.error(`[AIGameManager] Failed to end disconnected AI game ${gameId}:`, error);
      });
    }, DISCONNECT_FORFEIT_TIMEOUT);

    this.disconnectTimeouts.set(gameId, timeout);
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

    let gameId: string | undefined;

    try {
      console.log('[AIGameManager] Starting AI game for user:', socket.userId, 'with deck:', deckId, 'difficulty:', difficulty);

      // Ensure cards are loaded
      await cardLoaderService.loadAllCards();

      gameId = uuidv4();
      const createdGameId = gameId;
      console.log('[AIGameManager] Created gameId:', createdGameId);
      const aiPlayer = createAIPlayer(difficulty);

      // Select random AI deck
      const aiDeckKeys = Object.keys(AI_DECKS);
      const aiDeckId = aiDeckKeys[Math.floor(Math.random() * aiDeckKeys.length)];

      // Create pending game for first choice
      const pending: PendingAIGame = {
        gameId: createdGameId,
        humanPlayerId: socket.userId,
        humanSocketId: socket.id,
        humanDeckId: deckId,
        humanUsername: socket.username || 'Player',
        aiPlayer,
        aiDeckId,
        difficulty,
      };

      this.pendingGames.set(createdGameId, pending);
      this.playerToGame.set(socket.userId, createdGameId);

      // Join game room
      socket.join(`game:${createdGameId}`);

      console.log('[AIGameManager] Emitting first choice phase for AI game');

      // Send first choice phase to player (they choose first/second directly, no RPS)
      socket.emit(WS_EVENTS.LOBBY_START, {
        gameId: createdGameId,
        phase: GamePhase.FIRST_CHOICE,
        isAIGame: true,
        aiDifficulty: difficulty,
        // Player is the "winner" by default in AI games (they get to choose)
        winnerId: socket.userId,
      });

      callback?.({ success: true, gameId: createdGameId });

      // Start first choice timeout
      pending.firstChoiceTimeoutId = setTimeout(() => {
        this.handleFirstChoiceTimeout(createdGameId);
      }, FIRST_CHOICE_TIMEOUT);

    } catch (error) {
      console.error('[AIGameManager] Error starting AI game:', error);
      if (gameId) {
        this.pendingGames.delete(gameId);
      }
      this.playerToGame.delete(socket.userId);
      callback?.({ success: false, error: 'Failed to start game' });
      socket.emit('error', { message: 'Failed to start AI game' });
    }
  }

  /**
   * Start a tutorial game - uses fixed decks, skips RPS/first-choice, player always goes first
   */
  async startTutorialGame(
    socket: AuthenticatedSocket,
    callback?: (response: { success: boolean; gameId?: string; error?: string }) => void
  ) {
    if (!socket.userId) {
      callback?.({ success: false, error: 'Not authenticated' });
      return;
    }

    if (this.playerToGame.has(socket.userId)) {
      callback?.({ success: false, error: 'Already in a game' });
      return;
    }

    try {
      console.log('[AIGameManager] Starting tutorial game for user:', socket.userId);

      await cardLoaderService.loadAllCards();

      const gameId = uuidv4();
      const aiPlayer = createAIPlayer('basic');

      const stateManager = new GameStateManager(
        gameId, socket.userId, aiPlayer.getPlayerId(),
        { isTutorial: true }
      );

      const cardDefinitions = cardLoaderService.getAllCards();
      stateManager.loadCardDefinitions(cardDefinitions);

      // Build decks from tutorial templates (fixed order, no DB lookup)
      const humanDeck = this.createDeckFromTemplate(TUTORIAL_PLAYER_DECK);
      const aiDeck = this.createDeckFromTemplate(TUTORIAL_AI_DECK);

      stateManager.setupPlayer(socket.userId, socket.username || 'Player', humanDeck);
      stateManager.setupPlayer(aiPlayer.getPlayerId(), 'Tutorial AI', aiDeck);

      // Player always goes first, skip RPS and first choice
      stateManager.startGame(socket.userId);
      console.log('[AIGameManager] Tutorial game started, phase:', stateManager.getState().phase);

      const game: AIGameRoom = {
        id: gameId,
        humanPlayerId: socket.userId,
        humanSocketId: socket.id,
        humanDeckId: 'tutorial',
        aiPlayer,
        aiDeckId: 'tutorial',
        stateManager,
        actionLog: [],
        startedAt: new Date(),
        aiThinkDelay: 1500,
        pendingTimeouts: [],
      };

      this.playerToGame.set(socket.userId, gameId);
      this.games.set(gameId, game);
      socket.join(`game:${gameId}`);

      // Skip first-choice modal — emit lobby:start with tutorial flag
      socket.emit(WS_EVENTS.LOBBY_START, {
        gameId,
        isAIGame: true,
        isTutorial: true,
      });

      // Emit first:decided immediately (player goes first)
      socket.emit(WS_EVENTS.FIRST_DECIDED, {
        gameId,
        firstPlayerId: socket.userId,
        isAIGame: true,
        isTutorial: true,
      });

      // Send initial game state
      socket.emit('game:state', {
        gameState: stateManager.sanitizeStateForPlayer(socket.userId),
      });

      callback?.({ success: true, gameId });

      // Auto-confirm AI mulligan after a short delay
      this.scheduleTrackedTimeout(gameId, () => {
        this.processAIMulliganDecision(gameId);
      }, 500);

    } catch (error) {
      console.error('[AIGameManager] Error starting tutorial game:', error);
      this.playerToGame.delete(socket.userId);
      callback?.({ success: false, error: 'Failed to start tutorial game' });
    }
  }

  /**
   * Create a deck from a template array of card IDs (reusable for tutorial decks)
   */
  private createDeckFromTemplate(template: string[]): any[] {
    const cards: any[] = [];
    const missingCardIds: string[] = [];
    template.forEach((cardId, index) => {
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
          instanceId: `tut-${cardId}-${index}`
        });
      } else {
        missingCardIds.push(`${cardId}@${index}`);
      }
    });

    if (missingCardIds.length > 0 || cards.length !== template.length) {
      const missingSummary = missingCardIds.slice(0, 10).join(', ');
      throw new Error(
        `[AIGameManager] Tutorial deck template invalid: built ${cards.length}/${template.length} cards. Missing: ${missingSummary}`
      );
    }

    return cards;
  }

  /**
   * Process scripted AI turn for tutorial games
   */
  private processTutorialAITurn(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) return;
    // Prevent stale scheduled timeouts from bypassing the tutorial pause
    if (game.tutorialAwaitingResume) return;

    const state = game.stateManager.getState();
    const aiId = game.aiPlayer.getPlayerId();
    const aiPlayer = state.players[aiId];

    if (state.phase === GamePhase.GAME_OVER) return;
    if (!aiPlayer) return;

    const aiTurnCount = aiPlayer.turnCount || 0;
    let decision: { action: ActionType; data: any } | null = null;

    // Tutorial AI turns 1-2: play a character, then end turn (no attack)
    // Turn 3+: attack player's leader, then use normal AI
    if (aiTurnCount <= 2) {
      if (state.phase === GamePhase.MAIN_PHASE) {
        // Try to play a cheap character from hand
        const playableChar = aiPlayer.hand.find(c => {
          const def = this.getCardDef(c.cardId);
          return def && def.type === 'CHARACTER' && def.cost !== null && def.cost <= aiTurnCount + 1;
        });

        if (playableChar && !this.hasAIPlayedThisTurn(game)) {
          decision = { action: ActionType.PLAY_CARD, data: { cardId: playableChar.id } };
        } else {
          decision = { action: ActionType.END_TURN, data: {} };
        }
      } else {
        // For other phases (REFRESH, DRAW, DON), end turn to advance
        decision = { action: ActionType.END_TURN, data: {} };
      }
    } else {
      // Turn 3+: attack with leader first, then character, then end turn
      if (state.phase === GamePhase.MAIN_PHASE) {
        const aiLeader = aiPlayer.leaderCard;
        const humanLeader = state.players[game.humanPlayerId]?.leaderCard;

        if (aiLeader && humanLeader && aiLeader.state === CardState.ACTIVE) {
          // Leader attacks first
          decision = {
            action: ActionType.DECLARE_ATTACK,
            data: { attackerId: aiLeader.id, targetId: humanLeader.id, targetType: 'leader' }
          };
        } else if (humanLeader) {
          // Leader rested — try character attack
          const activeChar = aiPlayer.field.find(c => c.state === CardState.ACTIVE);
          if (activeChar) {
            decision = {
              action: ActionType.DECLARE_ATTACK,
              data: { attackerId: activeChar.id, targetId: humanLeader.id, targetType: 'leader' }
            };
          } else {
            decision = { action: ActionType.END_TURN, data: {} };
          }
        } else {
          decision = { action: ActionType.END_TURN, data: {} };
        }
      } else {
        // Use normal AI logic for non-main phases after turn 3
        const aiDecision = game.aiPlayer.getNextAction(state);
        decision = aiDecision ? { action: aiDecision.action, data: aiDecision.data } : null;
      }
    }

    if (decision) {
      const aiAction: GameAction = {
        id: `ai-tut-${Date.now()}`,
        type: decision.action,
        playerId: aiId,
        timestamp: Date.now(),
        data: decision.data,
      };

      const success = game.stateManager.processAction(aiAction);
      if (success) game.actionLog.push(aiAction);

      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:state', {
          gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId)
        });

        // Auto-skip effect phases that AI actions might trigger
        this.autoSkipTutorialEffects(game, humanSocket);
      }

      const updatedState = game.stateManager.getState();

      if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
        void this.endGame(gameId, updatedState.winner, 'normal').catch(error => {
          console.error(`[AIGameManager] Failed to end tutorial game ${gameId}:`, error);
        });
        return;
      }

      // Continue if still AI's turn and not waiting for the human to respond
      const waitingForHuman =
        updatedState.phase === GamePhase.BLOCKER_STEP ||
        updatedState.phase === GamePhase.COUNTER_STEP ||
        updatedState.phase === GamePhase.COUNTER_EFFECT_STEP ||
        updatedState.phase === GamePhase.TRIGGER_STEP;
      if (updatedState.activePlayerId === aiId && !waitingForHuman) {
        this.scheduleTrackedTimeout(gameId, () => {
          this.processTutorialAITurn(gameId);
        }, game.aiThinkDelay);
      }
    }
  }

  /**
   * Helper: check if AI already played a card this turn (to avoid playing multiple)
   */
  private hasAIPlayedThisTurn(game: AIGameRoom): boolean {
    const state = game.stateManager.getState();
    const aiPlayer = state.players[game.aiPlayer.getPlayerId()];
    if (!aiPlayer) return false;
    return aiPlayer.field.some(card => card.turnPlayed === state.turn);
  }

  /**
   * Resume the tutorial AI after the client signals the player has read the result step.
   */
  resumeTutorial(socket: AuthenticatedSocket) {
    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) return;
    const game = this.games.get(gameId);
    if (!game || !game.tutorialAwaitingResume) return;

    game.tutorialAwaitingResume = false;
    this.scheduleTrackedTimeout(gameId, () => {
      this.processTutorialAITurn(gameId);
    }, game.aiThinkDelay);
  }

  /**
   * Helper: get card definition by ID
   */
  private getCardDef(cardId: string) {
    return cardLoaderService.getCard(cardId);
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

    void this.finalizeAIGameStart(gameId, firstPlayerId).catch(error => {
      console.error(`[AIGameManager] Failed to finalize game start for ${gameId}:`, error);
    });
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

    void this.finalizeAIGameStart(gameId, firstPlayerId).catch(error => {
      console.error(`[AIGameManager] Failed to finalize timed-out game start for ${gameId}:`, error);
    });
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
      pendingTimeouts: [],
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
        this.scheduleTrackedTimeout(gameId, () => {
          this.processAIPreGameSetup(gameId);
        }, game.aiThinkDelay);
      } else {
        // Process AI mulligan decision after a delay
        console.log('[AIGameManager] Processing AI mulligan decision...');
        this.scheduleTrackedTimeout(gameId, () => {
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
      this.playerToGame.delete(pending.humanPlayerId);
      throw error;
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
    if (!action || !action.type) {
      callback?.({ success: false, error: 'Invalid action: missing type' });
      return;
    }

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

    // Update socket ID in case user reconnected with a new socket
    game.humanSocketId = socket.id;
    this.clearDisconnectTimeout(gameId);

    const state = game.stateManager.getState();

    // Phases where BOTH players can act simultaneously
    const simultaneousPhases = [
      GamePhase.PRE_GAME_SETUP,  // Both players select start-of-game cards
      GamePhase.START_MULLIGAN,  // Both players decide on mulligan
    ];

    // Phases where the NON-ACTIVE (defending) player primarily acts
    const defensivePhases = [
      GamePhase.COUNTER_STEP,    // Defender uses counter cards
      GamePhase.COUNTER_EFFECT_STEP, // Defender resolves event counter targets
      GamePhase.BLOCKER_STEP,    // Defender declares blockers
      GamePhase.TRIGGER_STEP,    // Defender resolves life triggers
    ];

    // Check if action is allowed for this player in this phase
    const isSimultaneousPhase = simultaneousPhases.includes(state.phase as GamePhase);
    const isDefensivePhase = defensivePhases.includes(state.phase as GamePhase);

    if (!isSimultaneousPhase) {
      if (isDefensivePhase) {
        // During defensive phases, the NON-active player (defender) should act
        if (state.activePlayerId === socket.userId) {
          // Active player (attacker) can only pass or resolve combat during defensive phases
          const allowedActiveActions = [
            ActionType.RESOLVE_COMBAT,
            ActionType.PASS_PRIORITY,
          ];
          if (!allowedActiveActions.includes(action.type as ActionType)) {
            callback?.({ success: false, error: 'Waiting for opponent' });
            return;
          }
        }
        // Non-active player (defender) can perform defensive actions - validation done in GameStateManager
      } else {
        // Normal phases - only active player can act
        if (state.activePlayerId !== socket.userId) {
          callback?.({ success: false, error: 'Not your turn' });
          return;
        }
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
      void this.endGame(gameId, updatedState.winner, 'normal').catch(error => {
        console.error(`[AIGameManager] Failed to end game ${gameId}:`, error);
      });
      callback?.({ success: true });
      return;
    }

    // Send sanitized state to human player (anti-cheat consistency)
    console.log('[AIGameManager] Emitting game:state to human player');
    socket.emit('game:state', { gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId) });
    callback?.({ success: true });

    // Auto-skip effect phases during guided tutorial turns
    this.autoSkipTutorialEffects(game, socket);
    // Re-read state after potential auto-skips
    const postSkipState = game.stateManager.getState();

    // Check for game end after effect skips
    if (postSkipState.phase === GamePhase.GAME_OVER && postSkipState.winner) {
      void this.endGame(gameId, postSkipState.winner, 'normal').catch(error => {
        console.error(`[AIGameManager] Failed to end game ${gameId}:`, error);
      });
      return;
    }

    // Check if it's now AI's turn OR if AI needs to respond defensively
    if (postSkipState.activePlayerId === game.aiPlayer.getPlayerId()) {
      // In tutorial Turn 3, pause after combat resolves so player can read results.
      // The client will emit ai:tutorial-resume when the player clicks "Next".
      // Only pause during AI turn 3 (the scripted combat teaching turn), not after.
      const aiTurnCount = postSkipState.players[game.aiPlayer.getPlayerId()]?.turnCount ?? 0;
      // During tutorial combat, don't schedule AI turns when waiting for human
      // response (BLOCKER/COUNTER steps). activePlayerId stays as AI throughout
      // combat, so without this check we'd schedule stale processAITurn timeouts.
      const inCombatPhase =
        postSkipState.phase === GamePhase.BLOCKER_STEP ||
        postSkipState.phase === GamePhase.COUNTER_STEP ||
        postSkipState.phase === GamePhase.COUNTER_EFFECT_STEP ||
        postSkipState.phase === GamePhase.TRIGGER_STEP;
      if (game.stateManager.getIsTutorial() &&
          postSkipState.phase === GamePhase.MAIN_PHASE &&
          aiTurnCount === 3 &&
          processedAction.type !== ActionType.END_TURN) {
        game.tutorialAwaitingResume = true;
        this.clearPendingTimeouts(game);
      } else if (inCombatPhase && game.stateManager.getIsTutorial()) {
        // Don't schedule — human needs to respond to combat first.
        // handleAction will schedule the AI when combat resolves.
      } else {
        // Delay AI response for better UX (tracked for cleanup on disconnect)
        this.scheduleTrackedTimeout(gameId, () => {
          this.processAITurn(gameId);
        }, game.aiThinkDelay);
      }
    } else if (this.needsAIDefensiveAction(postSkipState, game)) {
      // AI needs to respond to counter step or blocker step
      this.scheduleTrackedTimeout(gameId, () => {
        this.processAIDefensiveAction(gameId);
      }, game.aiThinkDelay);
    } else if (postSkipState.phase === GamePhase.START_MULLIGAN) {
      // Still in mulligan phase - AI may need to make its mulligan decision
      // This handles the case where human goes first and makes their decision
      // before AI's initial timer fires
      const aiConfirmed = game.stateManager.hasConfirmedHand(game.aiPlayer.getPlayerId());
      if (!aiConfirmed) {
        console.log('[AIGameManager] Human made mulligan decision, triggering AI mulligan');
        this.scheduleTrackedTimeout(gameId, () => {
          this.processAIMulliganDecision(gameId);
        }, game.aiThinkDelay);
      }
    }
  }

  /**
   * Auto-skip ATTACK_EFFECT_STEP and PLAY_EFFECT_STEP during guided tutorial turns.
   * Returns true if any effects were skipped (state was re-emitted to client).
   */
  private autoSkipTutorialEffects(game: AIGameRoom, socket: Socket): boolean {
    if (!game.stateManager.getIsTutorial()) return false;
    const humanPlayer = game.stateManager.getState().players[game.humanPlayerId];
    if ((humanPlayer?.turnCount ?? 0) > 3) return false;

    let skipped = false;
    let state = game.stateManager.getState();

    while (true) {
      if (state.phase === GamePhase.ATTACK_EFFECT_STEP && state.pendingAttackEffects?.length) {
        console.log('[AIGameManager] Tutorial: auto-skipping ATTACK_EFFECT_STEP');
        game.stateManager.skipAttackEffect(state.pendingAttackEffects[0].id);
        skipped = true;
        state = game.stateManager.getState();
      } else if (state.phase === GamePhase.PLAY_EFFECT_STEP && state.pendingPlayEffects?.length) {
        console.log('[AIGameManager] Tutorial: auto-skipping PLAY_EFFECT_STEP');
        game.stateManager.skipPlayEffect(state.pendingPlayEffects[0].id);
        skipped = true;
        state = game.stateManager.getState();
      } else if (state.phase === GamePhase.TRIGGER_STEP) {
        console.log('[AIGameManager] Tutorial: auto-skipping TRIGGER_STEP');
        game.stateManager.processAction({
          id: `ai-tut-trigger-${Date.now()}`,
          type: ActionType.TRIGGER_LIFE,
          playerId: state.activePlayerId || game.humanPlayerId,
          timestamp: Date.now(),
          data: { activate: false },
        });
        skipped = true;
        state = game.stateManager.getState();
      } else {
        break;
      }
    }

    if (skipped) {
      socket.emit('game:state', {
        gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId)
      });
    }
    return skipped;
  }

  /**
   * Check if AI needs to respond with a defensive action
   */
  private needsAIDefensiveAction(state: GameState, game: AIGameRoom): boolean {
    // Check if it's a defensive step and AI is the defender
    if (
      state.phase !== GamePhase.COUNTER_STEP &&
      state.phase !== GamePhase.COUNTER_EFFECT_STEP &&
      state.phase !== GamePhase.BLOCKER_STEP &&
      state.phase !== GamePhase.TRIGGER_STEP
    ) {
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
    const aiId = game.aiPlayer.getPlayerId();
    const humanPlayer = state.players[game.humanPlayerId];

    // During early guided tutorial turns, force deterministic defensive passes so
    // scripted attack outcomes (life loss + step progression) are guaranteed.
    const shouldForceTutorialPass =
      game.stateManager.getIsTutorial() &&
      (humanPlayer?.turnCount ?? 0) <= 2;

    let decision: { action: ActionType; data: any } | null = null;
    if (shouldForceTutorialPass) {
      if (state.phase === GamePhase.COUNTER_STEP) {
        decision = { action: ActionType.PASS_COUNTER, data: {} };
      } else if (state.phase === GamePhase.BLOCKER_STEP) {
        decision = { action: ActionType.PASS_PRIORITY, data: {} };
      } else if (state.phase === GamePhase.TRIGGER_STEP) {
        decision = { action: ActionType.TRIGGER_LIFE, data: { activate: false } };
      } else if (state.phase === GamePhase.COUNTER_EFFECT_STEP) {
        const pendingCounter = state.pendingCounterEffects?.find(effect => effect.playerId === aiId);
        decision = pendingCounter
          ? { action: ActionType.SKIP_COUNTER_EFFECT, data: { effectId: pendingCounter.id } }
          : { action: ActionType.PASS_COUNTER, data: {} };
      } else {
        decision = game.aiPlayer.getNextAction(state);
      }
    } else {
      // Get AI's defensive decision
      decision = game.aiPlayer.getNextAction(state);
    }

    if (decision) {
      const aiAction: GameAction = {
        id: `ai-def-${Date.now()}`,
        type: decision.action,
        playerId: aiId,
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
        void this.endGame(gameId, updatedState.winner, 'normal').catch(error => {
          console.error(`[AIGameManager] Failed to end defensive game ${gameId}:`, error);
        });
        return;
      }

      // If still in a defensive phase (e.g., moved from counter to blocker), continue
      if (this.needsAIDefensiveAction(updatedState, game)) {
        this.scheduleTrackedTimeout(gameId, () => {
          this.processAIDefensiveAction(gameId);
        }, game.aiThinkDelay);
      } else if (updatedState.activePlayerId === aiId) {
        // Combat resolved and it's still AI's turn — continue or pause for tutorial
        const aiTurnCount = updatedState.players[aiId]?.turnCount ?? 0;
        if (game.stateManager.getIsTutorial() &&
            updatedState.phase === GamePhase.MAIN_PHASE &&
            aiTurnCount === 3) {
          game.tutorialAwaitingResume = true;
          this.clearPendingTimeouts(game);
        } else {
          this.scheduleTrackedTimeout(gameId, () => {
            this.processAITurn(gameId);
          }, game.aiThinkDelay);
        }
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
        this.scheduleTrackedTimeout(gameId, () => {
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

    // Tutorial mulligan must be deterministic to preserve scripted deck order.
    const decision = game.stateManager.getIsTutorial()
      ? { action: ActionType.KEEP_HAND, data: {} }
      : game.aiPlayer.getNextAction(state);
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
          this.scheduleTrackedTimeout(gameId, () => {
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

    // Use scripted AI for tutorial games
    if (game.stateManager.getIsTutorial()) {
      this.processTutorialAITurn(gameId);
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
        void this.endGame(gameId, updatedState.winner, 'normal').catch(error => {
          console.error(`[AIGameManager] Failed to end AI-turn game ${gameId}:`, error);
        });
        return;
      }

      // Continue AI turn if still AI's turn
      if (updatedState.activePlayerId === game.aiPlayer.getPlayerId()) {
        // Delay next action
        this.scheduleTrackedTimeout(gameId, () => {
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

    const reason = game.stateManager.getIsTutorial() ? 'tutorial' : 'surrender';
    void this.endGame(gameId, game.aiPlayer.getPlayerId(), reason).catch(error => {
      console.error(`[AIGameManager] Failed to end surrendered AI game ${gameId}:`, error);
    });
  }

  /**
   * End the game
   */
  private async endGame(gameId: string, winnerId: string, reason: string) {
    console.log('[AIGameManager] endGame called. gameId:', gameId, 'winner:', winnerId, 'reason:', reason);
    const game = this.games.get(gameId);
    if (!game) return;

    try {
      // Notify player
      const humanSocket = this.io.sockets.sockets.get(game.humanSocketId);
      if (humanSocket) {
        humanSocket.emit('game:ended', {
          winner: winnerId,
          reason,
          gameState: game.stateManager.sanitizeStateForPlayer(game.humanPlayerId),
          isAIGame: true,
        });
      }

      // Update player stats (skip for tutorial games and AI player IDs)
      if (game.humanDeckId !== 'tutorial') {
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
      }
    } catch (error) {
      console.error('[AIGameManager] Error updating player stats:', error);
    } finally {
      // Clear any queued AI actions and remove game references even if persistence fails.
      if (game.pendingTimeouts) {
        game.pendingTimeouts.forEach(timeout => clearTimeout(timeout));
        game.pendingTimeouts = [];
      }

      this.clearDisconnectTimeout(gameId);
      this.playerToGame.delete(game.humanPlayerId);
      this.games.delete(gameId);
    }
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socket: AuthenticatedSocket) {
    const userId = socket.userId;
    if (!userId) return;

    // Check for pending games first
    for (const [gameId, pending] of this.pendingGames.entries()) {
      if (pending.humanPlayerId === userId) {
        // Clear any pending timeout
        if (pending.firstChoiceTimeoutId) {
          clearTimeout(pending.firstChoiceTimeoutId);
        }
        this.pendingGames.delete(gameId);
        this.playerToGame.delete(userId);
        console.log(`[AIGameManager] Cleaned up pending game ${gameId} due to disconnect`);
        return;
      }
    }

    // Check for active games
    const gameId = this.playerToGame.get(userId);
    if (!gameId) return;

    const game = this.games.get(gameId);
    if (game) {
      this.scheduleDisconnectForfeit(gameId);
      console.log(`[AIGameManager] Player ${userId} disconnected from AI game ${gameId}, waiting ${DISCONNECT_FORFEIT_TIMEOUT}ms before forfeit`);
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
      // Update socket ID in case user reconnected with a new socket
      game.humanSocketId = socket.id;
      this.clearDisconnectTimeout(gameId);
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
      // Update socket ID in case user reconnected with a new socket
      pendingGame.humanSocketId = socket.id;
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
