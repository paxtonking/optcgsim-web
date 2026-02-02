import type { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WS_EVENTS,
  GameState,
  GameAction,
  GameStateManager,
  GamePhase,
  RPSChoice,
  RPSState
} from '@optcgsim/shared';
import { prisma } from '../services/prisma.js';
import { cardLoaderService } from '../services/CardLoaderService.js';
import { calculateEloChange, getCurrentSeason, getPlayerRankInfo } from '../services/EloService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// RPS timeout constants (in ms)
const RPS_TIMEOUT = 10000;          // 10 seconds to choose RPS
const RPS_RESULT_DISPLAY = 3500;    // 3.5 seconds to display result
const FIRST_CHOICE_TIMEOUT = 10000; // 10 seconds to choose first/second

interface RPSPendingGame {
  gameId: string;
  player1Id: string;
  player2Id: string;
  player1SocketId: string;
  player2SocketId: string;
  player1Choice?: RPSChoice;
  player2Choice?: RPSChoice;
  roundNumber: number;
  rpsTimeoutId?: NodeJS.Timeout;
  firstChoiceTimeoutId?: NodeJS.Timeout;
  rpsWinnerId?: string;
  // Store lobby/deck info for later game creation
  lobbyId?: string;
  player1DeckId: string;
  player2DeckId: string;
  player1EloRating: number;
  player2EloRating: number;
  player1GamesPlayed: number;
  player2GamesPlayed: number;
  player1Username: string;
  player2Username: string;
  ranked: boolean;
}

// HTML escape function for chat message sanitization
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
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
  player1EloRating: number;
  player2EloRating: number;
  player1GamesPlayed: number;
  player2GamesPlayed: number;
  stateManager: GameStateManager;
  actionLog: GameAction[];
  initialState?: GameState;  // For replay (no longer exposed to clients)
  ranked: boolean;
  startedAt: Date;
}

export class GameManager {
  private io: SocketServer;
  private games: Map<string, GameRoom> = new Map();
  private playerToGame: Map<string, string> = new Map();
  private rpsPendingGames: Map<string, RPSPendingGame> = new Map();
  private cardsLoaded = false;

  constructor(io: SocketServer) {
    this.io = io;
    this.initializeCardData();
  }

  private async initializeCardData() {
    try {
      console.log('[GameManager] Loading card definitions...');
      await cardLoaderService.loadAllCards();
      this.cardsLoaded = true;
      console.log('[GameManager] Card definitions loaded successfully');
    } catch (error) {
      console.error('[GameManager] Failed to load card definitions:', error);
    }
  }

  async startGame(lobby: any, socket: AuthenticatedSocket) {
    if (lobby.players.length !== 2) return;
    if (lobby.hostId !== socket.userId) return;

    // Ensure cards are loaded
    if (!this.cardsLoaded) {
      await cardLoaderService.loadAllCards();
      this.cardsLoaded = true;
    }

    const gameId = uuidv4();
    const player1 = lobby.players[0];
    const player2 = lobby.players[1];

    // Load ELO ratings from database
    const [user1, user2] = await Promise.all([
      prisma.user.findUnique({
        where: { id: player1.id },
        select: { eloRating: true, gamesPlayed: true },
      }),
      prisma.user.findUnique({
        where: { id: player2.id },
        select: { eloRating: true, gamesPlayed: true },
      }),
    ]);

    // Create RPS pending game instead of starting immediately
    const rpsPending: RPSPendingGame = {
      gameId,
      player1Id: player1.id,
      player2Id: player2.id,
      player1SocketId: player1.socketId,
      player2SocketId: player2.socketId,
      roundNumber: 1,
      lobbyId: lobby.id,
      player1DeckId: player1.deckId,
      player2DeckId: player2.deckId,
      player1EloRating: user1?.eloRating ?? 1000,
      player2EloRating: user2?.eloRating ?? 1000,
      player1GamesPlayed: user1?.gamesPlayed ?? 0,
      player2GamesPlayed: user2?.gamesPlayed ?? 0,
      player1Username: player1.username,
      player2Username: player2.username,
      ranked: lobby.settings.isRanked ?? false,
    };

    this.rpsPendingGames.set(gameId, rpsPending);
    this.playerToGame.set(player1.id, gameId);
    this.playerToGame.set(player2.id, gameId);

    console.log(`[GameManager] Created RPS pending game: ${gameId}`);
    console.log(`[GameManager] Player1: ${player1.id} (socket: ${player1.socketId})`);
    console.log(`[GameManager] Player2: ${player2.id} (socket: ${player2.socketId})`);
    console.log(`[GameManager] rpsPendingGames count after add: ${this.rpsPendingGames.size}`);

    // Join game room
    const player1Socket = this.io.sockets.sockets.get(player1.socketId);
    const player2Socket = this.io.sockets.sockets.get(player2.socketId);

    console.log(`[GameManager] Player sockets found: P1=${!!player1Socket}, P2=${!!player2Socket}`);

    player1Socket?.join(`game:${gameId}`);
    player2Socket?.join(`game:${gameId}`);

    console.log(`[GameManager] Starting RPS phase for game ${gameId}`);

    // Send RPS phase start to both players
    const rpsState: RPSState = {
      player1Id: player1.id,
      player2Id: player2.id,
      roundNumber: 1,
    };

    this.io.to(`game:${gameId}`).emit(WS_EVENTS.LOBBY_START, {
      gameId,
      phase: GamePhase.RPS_PHASE,
      rpsState,
    });

    // Start RPS timeout
    rpsPending.rpsTimeoutId = setTimeout(() => {
      this.handleRPSTimeout(gameId);
    }, RPS_TIMEOUT);
  }

  /**
   * Handle RPS choice from a player
   */
  handleRPSChoice(socket: AuthenticatedSocket, gameId: string, choice: RPSChoice) {
    console.log(`[GameManager] handleRPSChoice called - gameId: ${gameId}, userId: ${socket.userId}, choice: ${choice}`);
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending) {
      console.log(`[GameManager] RPS choice received but no pending game found: ${gameId}`);
      console.log(`[GameManager] Current rpsPendingGames count: ${this.rpsPendingGames.size}`);
      console.log(`[GameManager] Current games count: ${this.games.size}`);
      // Check if game moved to active games (RPS already completed)
      const activeGame = this.games.get(gameId);
      if (activeGame) {
        console.log(`[GameManager] Game ${gameId} already in active games - RPS phase completed`);
        socket.emit('game:error', { error: 'RPS phase already completed. Please refresh.' });
      } else {
        console.log(`[GameManager] Game ${gameId} not found anywhere - server may have restarted`);
        // Notify the client that the game was not found (likely server restart)
        socket.emit('game:error', { error: 'Game not found. The game may have ended or the server was restarted.' });
      }
      return;
    }

    const playerId = socket.userId;
    if (!playerId) return;

    // Record the choice
    if (playerId === pending.player1Id) {
      pending.player1Choice = choice;
      console.log(`[GameManager] Player 1 (${playerId}) chose ${choice}`);
    } else if (playerId === pending.player2Id) {
      pending.player2Choice = choice;
      console.log(`[GameManager] Player 2 (${playerId}) chose ${choice}`);
    } else {
      console.log(`[GameManager] Unknown player ${playerId} tried to make RPS choice`);
      return;
    }

    // Check if both players have chosen
    if (pending.player1Choice && pending.player2Choice) {
      // Clear the timeout since both players chose
      if (pending.rpsTimeoutId) {
        clearTimeout(pending.rpsTimeoutId);
        pending.rpsTimeoutId = undefined;
      }

      this.resolveRPS(gameId);
    }
  }

  /**
   * Handle RPS timeout - assign random choice to players who didn't choose
   */
  private handleRPSTimeout(gameId: string) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending) return;

    console.log(`[GameManager] RPS timeout for game ${gameId}`);

    const choices: RPSChoice[] = ['rock', 'paper', 'scissors'];

    // Assign random choices to players who didn't choose
    if (!pending.player1Choice) {
      pending.player1Choice = choices[Math.floor(Math.random() * 3)];
      console.log(`[GameManager] Player 1 timed out, assigned random: ${pending.player1Choice}`);
    }
    if (!pending.player2Choice) {
      pending.player2Choice = choices[Math.floor(Math.random() * 3)];
      console.log(`[GameManager] Player 2 timed out, assigned random: ${pending.player2Choice}`);
    }

    this.resolveRPS(gameId);
  }

  /**
   * Resolve RPS round and determine winner
   */
  private resolveRPS(gameId: string) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending || !pending.player1Choice || !pending.player2Choice) return;

    const p1 = pending.player1Choice;
    const p2 = pending.player2Choice;

    // Determine winner
    let winnerId: string | undefined;
    let isTie = false;

    if (p1 === p2) {
      isTie = true;
      console.log(`[GameManager] RPS tie: both chose ${p1}`);
    } else if (
      (p1 === 'rock' && p2 === 'scissors') ||
      (p1 === 'paper' && p2 === 'rock') ||
      (p1 === 'scissors' && p2 === 'paper')
    ) {
      winnerId = pending.player1Id;
      console.log(`[GameManager] Player 1 wins RPS: ${p1} beats ${p2}`);
    } else {
      winnerId = pending.player2Id;
      console.log(`[GameManager] Player 2 wins RPS: ${p2} beats ${p1}`);
    }

    // Broadcast RPS result
    const rpsState: RPSState = {
      player1Id: pending.player1Id,
      player2Id: pending.player2Id,
      player1Choice: pending.player1Choice,
      player2Choice: pending.player2Choice,
      winnerId,
      isTie,
      roundNumber: pending.roundNumber,
    };

    this.io.to(`game:${gameId}`).emit(WS_EVENTS.RPS_RESULT, {
      gameId,
      rpsState,
    });

    if (isTie) {
      // Reset for next round after display delay
      setTimeout(() => {
        pending.player1Choice = undefined;
        pending.player2Choice = undefined;
        pending.roundNumber++;

        // Notify players of new round
        const newRpsState: RPSState = {
          player1Id: pending.player1Id,
          player2Id: pending.player2Id,
          roundNumber: pending.roundNumber,
        };

        this.io.to(`game:${gameId}`).emit(WS_EVENTS.RPS_CHOOSE, {
          gameId,
          rpsState: newRpsState,
          message: "It's a tie! Choose again.",
        });

        // Start new timeout
        pending.rpsTimeoutId = setTimeout(() => {
          this.handleRPSTimeout(gameId);
        }, RPS_TIMEOUT);
      }, RPS_RESULT_DISPLAY);
    } else {
      // Winner determined - move to first choice phase after display delay
      pending.rpsWinnerId = winnerId;

      setTimeout(() => {
        this.startFirstChoicePhase(gameId);
      }, RPS_RESULT_DISPLAY);
    }
  }

  /**
   * Start the first/second choice phase for RPS winner
   */
  private startFirstChoicePhase(gameId: string) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending || !pending.rpsWinnerId) return;

    console.log(`[GameManager] Starting first choice phase, winner: ${pending.rpsWinnerId}`);

    this.io.to(`game:${gameId}`).emit(WS_EVENTS.FIRST_CHOICE, {
      gameId,
      winnerId: pending.rpsWinnerId,
      phase: GamePhase.FIRST_CHOICE,
    });

    // Start first choice timeout
    pending.firstChoiceTimeoutId = setTimeout(() => {
      this.handleFirstChoiceTimeout(gameId);
    }, FIRST_CHOICE_TIMEOUT);
  }

  /**
   * Handle first/second choice from RPS winner
   */
  handleFirstChoice(socket: AuthenticatedSocket, gameId: string, goFirst: boolean) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending) {
      console.log(`[GameManager] First choice received but no pending game found: ${gameId}`);
      return;
    }

    // Only the winner can make this choice
    if (socket.userId !== pending.rpsWinnerId) {
      console.log(`[GameManager] Non-winner tried to make first choice: ${socket.userId}`);
      return;
    }

    // Clear timeout
    if (pending.firstChoiceTimeoutId) {
      clearTimeout(pending.firstChoiceTimeoutId);
      pending.firstChoiceTimeoutId = undefined;
    }

    console.log(`[GameManager] Winner chose to go ${goFirst ? 'first' : 'second'}`);

    // Determine who goes first (rpsWinnerId is guaranteed to exist from check above)
    const winnerId = pending.rpsWinnerId!;
    const firstPlayerId = goFirst ? winnerId :
      (winnerId === pending.player1Id ? pending.player2Id : pending.player1Id);

    this.finalizeGameStart(gameId, firstPlayerId);
  }

  /**
   * Handle first choice timeout - random selection
   */
  private handleFirstChoiceTimeout(gameId: string) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending || !pending.rpsWinnerId) return;

    console.log(`[GameManager] First choice timeout for game ${gameId}, selecting randomly`);

    // Random choice
    const goFirst = Math.random() < 0.5;
    const firstPlayerId = goFirst ? pending.rpsWinnerId :
      (pending.rpsWinnerId === pending.player1Id ? pending.player2Id : pending.player1Id);

    this.finalizeGameStart(gameId, firstPlayerId);
  }

  /**
   * Finalize game start after RPS and first choice are complete
   */
  private async finalizeGameStart(gameId: string, firstPlayerId: string) {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending) return;

    console.log(`[GameManager] Finalizing game start, first player: ${firstPlayerId}`);

    // Initialize game state manager
    const stateManager = new GameStateManager(gameId, pending.player1Id, pending.player2Id);

    // Load card definitions into the effect engine
    const cardDefinitions = cardLoaderService.getAllCards();
    stateManager.loadCardDefinitions(cardDefinitions);
    console.log(`[GameManager] Loaded ${cardDefinitions.length} card definitions for game ${gameId}`);

    // Load player decks
    const [deck1, deck2] = await Promise.all([
      this.loadPlayerDeck(pending.player1Id, pending.player1DeckId),
      this.loadPlayerDeck(pending.player2Id, pending.player2DeckId),
    ]);

    // Setup players with their decks
    stateManager.setupPlayer(pending.player1Id, pending.player1Username, deck1);
    stateManager.setupPlayer(pending.player2Id, pending.player2Username, deck2);

    // Start the game with determined first player
    stateManager.startGame(firstPlayerId);

    // Capture initial state for replay
    const initialState = JSON.parse(JSON.stringify(stateManager.getState()));

    const game: GameRoom = {
      id: gameId,
      lobbyId: pending.lobbyId,
      player1Id: pending.player1Id,
      player2Id: pending.player2Id,
      player1SocketId: pending.player1SocketId,
      player2SocketId: pending.player2SocketId,
      player1DeckId: pending.player1DeckId,
      player2DeckId: pending.player2DeckId,
      player1EloRating: pending.player1EloRating,
      player2EloRating: pending.player2EloRating,
      player1GamesPlayed: pending.player1GamesPlayed,
      player2GamesPlayed: pending.player2GamesPlayed,
      stateManager,
      actionLog: [],
      initialState,
      ranked: pending.ranked,
      startedAt: new Date(),
    };

    // Move from pending to active games
    this.rpsPendingGames.delete(gameId);
    this.games.set(gameId, game);

    // Determine loser for banner notification
    const loserId = pending.rpsWinnerId === pending.player1Id ? pending.player2Id : pending.player1Id;
    const loserGoesFirst = firstPlayerId === loserId;

    // Broadcast final game start with first player info
    console.log(`[GameManager] Emitting first:decided to room game:${gameId}`);
    this.io.to(`game:${gameId}`).emit(WS_EVENTS.FIRST_DECIDED, {
      gameId,
      firstPlayerId,
      loserId,
      loserGoesFirst,
    });

    // Send sanitized game state to each player individually (anti-cheat)
    console.log(`[GameManager] Looking for sockets - P1: ${game.player1SocketId}, P2: ${game.player2SocketId}`);
    const player1Socket = this.io.sockets.sockets.get(game.player1SocketId);
    const player2Socket = this.io.sockets.sockets.get(game.player2SocketId);
    console.log(`[GameManager] Found sockets - P1: ${!!player1Socket}, P2: ${!!player2Socket}`);

    if (player1Socket) {
      console.log(`[GameManager] Sending game:state to player 1`);
      player1Socket.emit('game:state', {
        gameState: stateManager.sanitizeStateForPlayer(game.player1Id),
      });
    }
    if (player2Socket) {
      console.log(`[GameManager] Sending game:state to player 2`);
      player2Socket.emit('game:state', {
        gameState: stateManager.sanitizeStateForPlayer(game.player2Id),
      });
    }
  }

  private async loadPlayerDeck(playerId: string, deckId: string) {
    const deck = await prisma.deck.findUnique({
      where: { id: deckId, userId: playerId }
    });

    if (!deck) {
      throw new Error('Deck not found');
    }

    const deckCards = deck.cards as any[];

    // Load actual card data (including leader)
    const cardIds = deckCards.map(c => c.cardId);
    // Add leader to the card IDs to load
    if (deck.leaderId && !cardIds.includes(deck.leaderId)) {
      cardIds.push(deck.leaderId);
    }

    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } }
    });

    // Start with the leader card
    const fullDeck: any[] = [];
    const leaderCard = cards.find((c: any) => c.id === deck.leaderId);
    if (leaderCard) {
      fullDeck.push({
        ...leaderCard,
        instanceId: `${leaderCard.id}-leader`
      });
    }

    // Map deck cards with quantities
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


  handleAction(
    socket: AuthenticatedSocket,
    action: GameAction,
    callback?: (response: { success: boolean; error?: string }) => void
  ) {
    // Validate action object
    if (!action || !action.type) {
      console.log(`[GameManager] handleAction: Invalid action received - type: ${action?.type}`);
      if (callback) callback({ success: false, error: 'Invalid action: missing type' });
      return;
    }

    const gameId = this.playerToGame.get(socket.userId!);
    if (!gameId) {
      console.log(`[GameManager] handleAction: User ${socket.userId} not in a game`);
      if (callback) callback({ success: false, error: 'Not in a game' });
      return;
    }

    const game = this.games.get(gameId);
    if (!game) {
      console.log(`[GameManager] handleAction: Game ${gameId} not found`);
      if (callback) callback({ success: false, error: 'Game not found' });
      return;
    }

    // Update socket ID in case user reconnected with a new socket
    if (socket.userId === game.player1Id) {
      game.player1SocketId = socket.id;
    } else if (socket.userId === game.player2Id) {
      game.player2SocketId = socket.id;
    }

    const state = game.stateManager.getState();

    // Phases where both players can act (not just the active player)
    const simultaneousPhases = [
      GamePhase.START_MULLIGAN,  // Both players decide on mulligan
      GamePhase.COUNTER_STEP,    // Defender uses counter cards
      GamePhase.BLOCKER_STEP,    // Defender declares blockers
      GamePhase.TRIGGER_STEP,    // Defender resolves life triggers
    ];

    // Validate it's the player's turn (skip for simultaneous phases)
    const isSimultaneousPhase = simultaneousPhases.includes(state.phase as GamePhase);
    if (!isSimultaneousPhase && state.activePlayerId !== socket.userId) {
      if (callback) callback({ success: false, error: 'Not your turn' });
      return;
    }

    // Process action
    const processedAction: GameAction = {
      ...action,
      playerId: socket.userId!,
      timestamp: Date.now(),
    };

    console.log('[DEBUG ATTACK SERVER] Processing action:', {
      type: processedAction.type,
      playerId: processedAction.playerId,
      data: processedAction.data,
      currentPhase: state.phase,
      activePlayerId: state.activePlayerId
    });

    // Apply action using GameStateManager
    const success = game.stateManager.processAction(processedAction);

    console.log('[DEBUG ATTACK SERVER] Action result:', {
      success,
      type: processedAction.type,
      newPhase: game.stateManager.getState().phase
    });

    if (!success) {
      if (callback) callback({ success: false, error: 'Invalid action' });
      return;
    }

    game.actionLog.push(processedAction);

    const updatedState = game.stateManager.getState();

    // Check for game end
    if (updatedState.phase === GamePhase.GAME_OVER && updatedState.winner) {
      this.endGame(gameId, updatedState.winner, 'normal');
      if (callback) callback({ success: true });
      return;
    }

    // Send sanitized state to each player individually (anti-cheat)
    const player1Socket = this.io.sockets.sockets.get(game.player1SocketId);
    const player2Socket = this.io.sockets.sockets.get(game.player2SocketId);

    if (player1Socket) {
      player1Socket.emit('game:state', {
        gameState: game.stateManager.sanitizeStateForPlayer(game.player1Id),
      });
    }
    if (player2Socket) {
      player2Socket.emit('game:state', {
        gameState: game.stateManager.sanitizeStateForPlayer(game.player2Id),
      });
    }

    if (callback) callback({ success: true });
  }

  handleChat(socket: AuthenticatedSocket, message: string) {
    const gameId = this.playerToGame.get(socket.userId!);
    console.log(`[GameManager] handleChat from user ${socket.userId}, gameId: ${gameId || 'NOT FOUND'}`);
    if (!gameId) {
      console.log(`[GameManager] User ${socket.userId} not in playerToGame map`);
      return;
    }

    console.log(`[GameManager] Broadcasting chat to room game:${gameId}`);
    this.io.to(`game:${gameId}`).emit(WS_EVENTS.GAME_CHAT, {
      senderId: socket.userId,
      senderUsername: socket.username,
      message: escapeHtml(message.slice(0, 200)), // XSS sanitization + length limit
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
    callback?: (response: { success: boolean; state?: GameState; error?: string }) => void
  ) {
    const game = this.games.get(gameId);
    if (!game) {
      if (callback) callback({ success: false, error: 'Game not found' });
      return;
    }

    if (socket.userId !== game.player1Id && socket.userId !== game.player2Id) {
      if (callback) callback({ success: false, error: 'Not a player in this game' });
      return;
    }

    // Update socket ID
    if (socket.userId === game.player1Id) {
      game.player1SocketId = socket.id;
    } else {
      game.player2SocketId = socket.id;
    }

    this.playerToGame.set(socket.userId!, gameId);
    socket.join(`game:${gameId}`);

    if (callback) callback({ success: true, state: game.stateManager.sanitizeStateForPlayer(socket.userId!) });
  }

  // Spectator functionality removed for security (prevents information leakage)

  /**
   * Get game state for a player (used for reconnection/state refresh)
   * Only allows players in the game to get state, returns sanitized version
   */
  getGameState(socket: AuthenticatedSocket, gameId: string): GameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    // Only players can get game state (no spectators)
    if (socket.userId !== game.player1Id && socket.userId !== game.player2Id) {
      return null;
    }

    // Update socket ID in case user reconnected with a new socket
    if (socket.userId === game.player1Id) {
      game.player1SocketId = socket.id;
    } else if (socket.userId === game.player2Id) {
      game.player2SocketId = socket.id;
    }

    // Return sanitized state to prevent cheating
    return game.stateManager.sanitizeStateForPlayer(socket.userId!);
  }

  /**
   * Get RPS pending game state for a player (used for reconnection during RPS phase)
   * Returns sanitized RPS state - only shows player's own choice, not opponent's
   */
  getRPSState(socket: AuthenticatedSocket, gameId: string): {
    gameId: string;
    phase: 'RPS_PHASE' | 'FIRST_CHOICE';
    rpsState?: RPSState;
    winnerId?: string;
  } | null {
    const pending = this.rpsPendingGames.get(gameId);
    if (!pending) return null;

    // Only players can get RPS state
    if (socket.userId !== pending.player1Id && socket.userId !== pending.player2Id) {
      return null;
    }

    // Update socket ID in case user reconnected with a new socket
    if (socket.userId === pending.player1Id) {
      console.log(`[GameManager] getRPSState: Updating P1 socket from ${pending.player1SocketId} to ${socket.id}`);
      pending.player1SocketId = socket.id;
    } else if (socket.userId === pending.player2Id) {
      console.log(`[GameManager] getRPSState: Updating P2 socket from ${pending.player2SocketId} to ${socket.id}`);
      pending.player2SocketId = socket.id;
    }

    // Ensure socket joins game room
    console.log(`[GameManager] getRPSState: Socket ${socket.id} joining room game:${gameId}`);
    socket.join(`game:${gameId}`);

    // Check if we're in first choice phase (RPS winner has been determined)
    if (pending.rpsWinnerId) {
      return {
        gameId,
        phase: 'FIRST_CHOICE',
        winnerId: pending.rpsWinnerId,
      };
    }

    // Still in RPS choosing phase - return sanitized state (only player's own choice)
    const isPlayer1 = socket.userId === pending.player1Id;
    return {
      gameId,
      phase: 'RPS_PHASE',
      rpsState: {
        player1Id: pending.player1Id,
        player2Id: pending.player2Id,
        roundNumber: pending.roundNumber,
        player1Choice: isPlayer1 ? pending.player1Choice : undefined,
        player2Choice: isPlayer1 ? undefined : pending.player2Choice,
      },
    };
  }

  handleDisconnect(_socket: AuthenticatedSocket) {
    // Handle player disconnect - give them time to reconnect
    // In production, start a reconnection timer
  }

  private async endGame(gameId: string, winnerId: string, reason: string) {
    const game = this.games.get(gameId);
    if (!game) return;

    const state = game.stateManager.getState();
    const loserId = winnerId === game.player1Id ? game.player2Id : game.player1Id;

    // Calculate ELO changes for ranked games
    let eloResult: { player1NewRating: number; player2NewRating: number; player1Change: number; player2Change: number } | null = null;

    if (game.ranked) {
      const winner = winnerId === game.player1Id ? 1 : 2;
      eloResult = calculateEloChange(
        game.player1EloRating,
        game.player2EloRating,
        game.player1GamesPlayed,
        game.player2GamesPlayed,
        winner as 1 | 2
      );
    }

    // Send sanitized final state to each player individually (anti-cheat)
    const player1Socket = this.io.sockets.sockets.get(game.player1SocketId);
    const player2Socket = this.io.sockets.sockets.get(game.player2SocketId);

    const eloChanges = game.ranked && eloResult ? {
      [game.player1Id]: {
        oldRating: game.player1EloRating,
        newRating: eloResult.player1NewRating,
        change: eloResult.player1Change,
        rankInfo: getPlayerRankInfo(eloResult.player1NewRating, game.player1GamesPlayed + 1),
      },
      [game.player2Id]: {
        oldRating: game.player2EloRating,
        newRating: eloResult.player2NewRating,
        change: eloResult.player2Change,
        rankInfo: getPlayerRankInfo(eloResult.player2NewRating, game.player2GamesPlayed + 1),
      },
    } : undefined;

    if (player1Socket) {
      player1Socket.emit('game:ended', {
        winner: winnerId,
        reason,
        gameState: game.stateManager.sanitizeStateForPlayer(game.player1Id),
        eloChanges,
      });
    }
    if (player2Socket) {
      player2Socket.emit('game:ended', {
        winner: winnerId,
        reason,
        gameState: game.stateManager.sanitizeStateForPlayer(game.player2Id),
        eloChanges,
      });
    }

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
        gameLog: [],  // Empty array for security (prevents replay cheating)
        // initialState omitted (null) for security
        player1DeckId: game.player1DeckId,
        player2DeckId: game.player2DeckId,
        ranked: game.ranked,
        duration,
        player1EloBefore: game.ranked ? game.player1EloRating : null,
        player2EloBefore: game.ranked ? game.player2EloRating : null,
        player1EloChange: eloResult?.player1Change ?? null,
        player2EloChange: eloResult?.player2Change ?? null,
      },
    });

    // Update player stats and ELO ratings
    await Promise.all([
      prisma.user.update({
        where: { id: winnerId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: 1 },
          ...(game.ranked && eloResult ? {
            eloRating: winnerId === game.player1Id
              ? eloResult.player1NewRating
              : eloResult.player2NewRating,
          } : {}),
        },
      }),
      prisma.user.update({
        where: { id: loserId },
        data: {
          gamesPlayed: { increment: 1 },
          ...(game.ranked && eloResult ? {
            eloRating: loserId === game.player1Id
              ? eloResult.player1NewRating
              : eloResult.player2NewRating,
          } : {}),
        },
      }),
    ]);

    // Update seasonal leaderboard for ranked games
    if (game.ranked && eloResult) {
      const season = getCurrentSeason();

      await Promise.all([
        prisma.leaderboard.upsert({
          where: { season_userId: { season, userId: game.player1Id } },
          create: {
            season,
            userId: game.player1Id,
            username: state.players[game.player1Id]?.username || 'Unknown',
            eloRating: eloResult.player1NewRating,
            rank: 0, // Will be recalculated
            gamesWon: winnerId === game.player1Id ? 1 : 0,
            gamesLost: winnerId === game.player1Id ? 0 : 1,
          },
          update: {
            eloRating: eloResult.player1NewRating,
            gamesWon: winnerId === game.player1Id ? { increment: 1 } : undefined,
            gamesLost: winnerId !== game.player1Id ? { increment: 1 } : undefined,
          },
        }),
        prisma.leaderboard.upsert({
          where: { season_userId: { season, userId: game.player2Id } },
          create: {
            season,
            userId: game.player2Id,
            username: state.players[game.player2Id]?.username || 'Unknown',
            eloRating: eloResult.player2NewRating,
            rank: 0, // Will be recalculated
            gamesWon: winnerId === game.player2Id ? 1 : 0,
            gamesLost: winnerId === game.player2Id ? 0 : 1,
          },
          update: {
            eloRating: eloResult.player2NewRating,
            gamesWon: winnerId === game.player2Id ? { increment: 1 } : undefined,
            gamesLost: winnerId !== game.player2Id ? { increment: 1 } : undefined,
          },
        }),
      ]);
    }

    // Clean up
    this.playerToGame.delete(game.player1Id);
    this.playerToGame.delete(game.player2Id);
    this.games.delete(gameId);
  }
}
