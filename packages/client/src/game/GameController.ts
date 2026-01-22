import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GameStateManager, GameState, GameAction, ActionType } from '@optcgsim/shared';
import { socket } from '../services/socket';

export class GameController {
  private game?: Phaser.Game;
  private gameScene?: GameScene;
  private stateManager?: GameStateManager;
  private gameId?: string;
  private playerId?: string;
  private isAIGame: boolean;

  constructor(isAIGame: boolean = false) {
    this.isAIGame = isAIGame;
    this.setupSocketListeners();
  }

  public initialize(container: HTMLElement, gameId: string, playerId: string) {
    this.gameId = gameId;
    this.playerId = playerId;
    
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      width: 1280,
      height: 720,
      backgroundColor: '#1a1a1a',
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: {
          debug: false
        }
      }
    };

    this.game = new Phaser.Game(config);
    
    // Get scene reference once it's created
    this.game.events.once('ready', () => {
      this.gameScene = this.game?.scene.getScene('GameScene') as GameScene;
      this.setupSceneListeners();

      // Request initial game state using appropriate event for AI or regular games
      const getStateEvent = this.isAIGame ? 'ai:getState' : 'game:getState';
      socket?.emit(getStateEvent, { gameId: this.gameId });
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
  }

  private setupSocketListeners() {
    // Listen for game state updates
    socket?.on('game:state', (data: { gameState: GameState }) => {
      this.handleStateUpdate(data.gameState);
    });

    socket?.on('game:action:result', (data: { success: boolean; error?: string }) => {
      if (!data.success) {
        console.error('Action failed:', data.error);
        // TODO: Show error to user
      }
    });

    socket?.on('game:ended', (data: { winner: string; reason: string }) => {
      this.handleGameEnd(data.winner, data.reason);
    });

    socket?.on('game:error', (data: { error: string }) => {
      console.error('Game error:', data.error);
      // TODO: Show error to user
    });
  }

  private handleStateUpdate(state: GameState) {
    if (!this.stateManager) {
      // Initialize state manager with the received state
      this.stateManager = new GameStateManager(state.id, '', '');
      this.stateManager.setState(state);
    } else {
      this.stateManager.setState(state);
    }
    
    // Update the visual representation
    if (this.gameScene && this.playerId) {
      this.gameScene.updateGameState(state, this.playerId);
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
    socket?.emit(actionEvent, {
      gameId: this.gameId,
      action: action
    });
  }

  private handleGameEnd(winner: string, reason: string) {
    console.log(`Game ended! Winner: ${winner}, Reason: ${reason}`);
    
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
    if (this.game) {
      this.game.destroy(true);
      this.game = undefined;
    }
    
    // Clean up socket listeners
    socket?.off('game:state');
    socket?.off('game:action:result');
    socket?.off('game:ended');
    socket?.off('game:error');
  }
}