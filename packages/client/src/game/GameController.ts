import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GameStateManager, GameState, GameAction, ActionType, GamePhase } from '@optcgsim/shared';
import { getSocket } from '../services/socket';
import { useLobbyStore } from '../stores/lobbyStore';

// Global tracking to prevent duplicate Phaser instances (React StrictMode creates double mounts)
const activeGames = new Map<string, Phaser.Game>();

export class GameController {
  private game?: Phaser.Game;
  private gameScene?: GameScene;
  private stateManager?: GameStateManager;
  private gameId?: string;
  private playerId?: string;
  private isAIGame: boolean;
  private isSpectator: boolean;
  private lastStateSignature?: string;
  private socketListenersSetup = false;
  private resizeHandler?: () => void;

  constructor(isAIGame: boolean = false, isSpectator: boolean = false) {
    this.isAIGame = isAIGame;
    this.isSpectator = isSpectator;
    // Don't set up socket listeners here - do it in initialize()
  }

  /**
   * Create a signature/hash of the game state for deduplication
   * During mulligan phase, include card IDs to detect hand changes (same count, different cards)
   */
  private createStateSignature(state: GameState): string {
    const isMulliganPhase = state.phase === GamePhase.START_MULLIGAN;

    const playerSigs = Object.entries(state.players).map(([id, player]) => {
      // During mulligan, include hand card IDs to detect card changes
      const handSig = isMulliganPhase
        ? player.hand.map(c => c.id).sort().join(',')
        : `${player.hand.length}`;
      return `${id}:h${handSig}:f${player.field.length}:l${player.lifeCards.length}:d${player.donField.length}:dd${player.donDeck}`;
    }).join('|');

    return `${state.phase}:${state.turn}:${state.activePlayerId}:${playerSigs}:${state.currentCombat?.attackerId || 'none'}`;
  }

  public initialize(container: HTMLElement, gameId: string, playerId: string) {
    console.log('[GameController] initialize() called. gameId:', gameId, 'playerId:', playerId);
    console.log('[GameController] Container:', container.id || container.className || 'unnamed');

    // Check if a game already exists for this gameId (prevents React StrictMode double-mount issues)
    if (activeGames.has(gameId)) {
      console.warn('[GameController] Game already exists for this gameId, reusing existing instance');
      this.game = activeGames.get(gameId);
      this.gameId = gameId;
      this.playerId = playerId;

      // Get the existing scene
      if (this.game) {
        this.gameScene = this.game.scene.getScene('GameScene') as GameScene;
      }

      // Set up socket listeners if needed
      if (!this.socketListenersSetup) {
        this.setupSocketListeners();
        this.socketListenersSetup = true;
      }
      return;
    }

    // Check if this controller already has a game
    if (this.game) {
      console.warn('[GameController] Already initialized! Destroying previous game instance.');
      this.game.destroy(true);
      this.game = undefined;
    }

    this.gameId = gameId;
    this.playerId = playerId;

    // Set up socket listeners only once
    if (!this.socketListenersSetup) {
      this.setupSocketListeners();
      this.socketListenersSetup = true;
    }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: container,
        width: 1280,
        height: 720,
        backgroundColor: '#1a1a1a',
        scene: [GameScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
      // Limit FPS to reduce CPU usage
      fps: {
        target: 30,
        forceSetTimeOut: true
      }
    };

    this.game = new Phaser.Game(config);

      // Ensure Phaser recalculates scale when the browser window resizes
      if (typeof window !== 'undefined') {
        this.resizeHandler = () => {
          if (this.game) {
            this.game.scale.refresh();
          }
        };
        window.addEventListener('resize', this.resizeHandler);
      }

    // Register in global tracking
    activeGames.set(gameId, this.game);
    console.log('[GameController] Registered new game instance for gameId:', gameId);

    // Get scene reference once it's created
    this.game.events.once('ready', () => {
      this.gameScene = this.game?.scene.getScene('GameScene') as GameScene;

      // Only setup action listeners if not spectating
      if (!this.isSpectator) {
        this.setupSceneListeners();
      }

      // Join as spectator or request game state
      if (this.isSpectator) {
        console.log('[GameController] Joining as spectator...');
        getSocket().emit('spectate:join', this.gameId, (response: { success: boolean; state?: GameState; error?: string }) => {
          if (response.success && response.state) {
            this.handleStateUpdate(response.state);
          } else {
            console.error('Failed to join as spectator:', response.error);
          }
        });
      } else {
        // Request initial game state using appropriate event for AI or regular games
        const getStateEvent = this.isAIGame ? 'ai:getState' : 'game:getState';
        console.log(`[GameController] Requesting game state via ${getStateEvent}, gameId: ${this.gameId}`);
        getSocket().emit(getStateEvent, { gameId: this.gameId });
      }
    });
  }

  private setupSceneListeners() {
    if (!this.gameScene) return;
    
    // Listen to game events from the scene
    this.gameScene.events.on('playCard', (data: { cardId: string; zone: string }) => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.PLAY_CARD,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: data
      });
    });

    this.gameScene.events.on('declareAttack', (data: { attackerId: string }) => {
      // TODO: Show target selection UI
      console.log('Attack declared:', data);
    });

    this.gameScene.events.on('endTurn', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.END_TURN,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: {}
      });
    });

    this.gameScene.events.on('pass', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.PASS_PRIORITY,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: {}
      });
    });

    // Counter step events
    this.gameScene.events.on('useCounter', (data: { cardIds: string[] }) => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.USE_COUNTER,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: { cardIds: data.cardIds }
      });
    });

    this.gameScene.events.on('passCounter', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.PASS_COUNTER,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: {}
      });
    });

    // Trigger step events
    this.gameScene.events.on('activateTrigger', (data: { cardId: string }) => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.TRIGGER_LIFE,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: { cardId: data.cardId, activate: true }
      });
    });

    this.gameScene.events.on('passTrigger', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.TRIGGER_LIFE,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: { activate: false }
      });
    });

    // Mulligan events
    this.gameScene.events.on('keepHand', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.KEEP_HAND,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: {}
      });
    });

    this.gameScene.events.on('mulligan', () => {
      this.sendAction({
        id: this.generateActionId(),
        type: ActionType.MULLIGAN,
        playerId: this.playerId!,
        timestamp: Date.now(),
        data: {}
      });
    });
  }

  private setupSocketListeners() {
    console.log('[GameController] Setting up socket listeners...');
    const socket = getSocket();
    console.log('[GameController] Socket connected:', socket.connected);

    // Listen for game state updates
    socket.on('game:state', (data: { gameState: GameState }) => {
      this.handleStateUpdate(data.gameState);
    });

    socket.on('game:action:result', (data: { success: boolean; error?: string }) => {
      console.log('[GameController] Received game:action:result', data);
      if (!data.success) {
        console.error('Action failed:', data.error);
        // TODO: Show error to user
      }
    });

    socket.on('game:ended', (data: { winner: string; reason: string }) => {
      console.log('[GameController] Received game:ended', data);
      this.handleGameEnd(data.winner, data.reason);
    });

    socket.on('game:error', (data: { error: string }) => {
      console.error('[GameController] Game error:', data.error);
      // TODO: Show error to user
    });
  }

  private handleStateUpdate(state: GameState) {
    // Deduplicate: skip if this state is identical to the last one
    const signature = this.createStateSignature(state);
    if (signature === this.lastStateSignature) {
      console.log('[GameController] Skipping duplicate state update');
      return;
    }
    this.lastStateSignature = signature;

    console.log('[GameController] handleStateUpdate - Phase:', state.phase, 'Turn:', state.turn);

    if (!this.stateManager) {
      // Initialize state manager with the received state
      this.stateManager = new GameStateManager(state.id, '', '');
      this.stateManager.setState(state);
    } else {
      this.stateManager.setState(state);
    }

    // Update the visual representation
    if (this.gameScene) {
      // Spectators view from the first player's perspective
      const playerIds = Object.keys(state.players);
      const viewerId = this.isSpectator ? playerIds[0] : this.playerId;
      console.log('[GameController] Updating game scene for viewer:', viewerId);
      if (viewerId) {
        this.gameScene.updateGameState(state, viewerId);
      }
    } else {
      console.warn('[GameController] gameScene not ready yet');
    }

    // Spectators can never take actions
    if (this.isSpectator) {
      this.disableActions();
      return;
    }

    // Check if it's our turn
    if (state.activePlayerId === this.playerId) {
      this.enableActions();
    } else {
      this.disableActions();
    }
  }

  private sendAction(action: GameAction) {
    if (!this.gameId) return;

    // Use appropriate event for AI or regular games
    const actionEvent = this.isAIGame ? 'ai:action' : 'game:action';
    getSocket().emit(actionEvent, {
      gameId: this.gameId,
      action: action
    });
  }

  private handleGameEnd(winner: string, reason: string) {
    console.log(`Game ended! Winner: ${winner}, Reason: ${reason}`);

    // Reset lobby state so user doesn't get redirected back to game
    useLobbyStore.getState().reset();

    // TODO: Show game over UI
    const isWinner = winner === this.playerId;
    const message = isWinner ? 'Victory!' : 'Defeat';
    
    if (this.gameScene) {
      // Add game over overlay
      const { width, height } = this.gameScene.scale;
      const scene = this.gameScene;
      
      scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
      scene.add.text(width / 2, height / 2 - 50, message, {
        fontSize: '48px',
        color: isWinner ? '#00ff00' : '#ff0000',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      
      scene.add.text(width / 2, height / 2 + 20, reason, {
        fontSize: '24px',
        color: '#ffffff'
      }).setOrigin(0.5);
      
      // Add return to lobby button
      scene.add.rectangle(width / 2, height / 2 + 80, 200, 50, 0x4444ff)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.returnToLobby();
        });
      
      scene.add.text(width / 2, height / 2 + 80, 'Return to Lobby', {
        fontSize: '18px',
        color: '#ffffff'
      }).setOrigin(0.5);
    }
  }

  private enableActions() {
    // Enable player actions during their turn
    console.log('It\'s your turn!');
    // TODO: Highlight available actions
  }

  private disableActions() {
    // Disable player actions during opponent's turn
    console.log('Waiting for opponent...');
  }

  private returnToLobby() {
    this.destroy();
    window.location.href = '/lobby';
  }

  private generateActionId(): string {
    return `${this.playerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public destroy() {
    // Leave spectator mode if applicable
    if (this.isSpectator && this.gameId) {
      getSocket().emit('spectate:leave', this.gameId);
    }

    // Reset lobby state to prevent navigation loop
    useLobbyStore.getState().reset();

    // Remove from global tracking
    if (this.gameId) {
      activeGames.delete(this.gameId);
      console.log('[GameController] Removed game instance for gameId:', this.gameId);
    }

    if (this.game) {
      this.game.destroy(true);
      this.game = undefined;
    }

    // Clean up resize handler
    if (this.resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }

    // Clean up socket listeners
    getSocket().off('game:state');
    getSocket().off('game:action:result');
    getSocket().off('game:ended');
    getSocket().off('game:error');
  }

  public getIsSpectator(): boolean {
    return this.isSpectator;
  }
}
