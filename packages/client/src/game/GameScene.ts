import Phaser from 'phaser';
import { GameState, GameCard, CardZone, CardState, PlayerState } from '@optcgsim/shared';

export class GameScene extends Phaser.Scene {
  private gameState?: GameState;
  private playerId?: string;
  private cardSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private zones: Map<string, Phaser.Geom.Rectangle> = new Map();
  private selectedCard?: string;
  private hoverCard?: Phaser.GameObjects.Image;
  
  // Zone dimensions
  private readonly CARD_WIDTH = 63;
  private readonly CARD_HEIGHT = 88;
  private readonly CARD_SCALE = 1.2;
  
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    // Load card back image
    this.load.image('card-back', '/assets/card-back.png');
    
    // Load playmat/background
    this.load.image('playmat', '/assets/playmat.png');
    
    // Load UI elements
    this.load.image('don-token', '/assets/don-token.png');
    this.load.image('life-shield', '/assets/life-shield.png');
  }

  create() {
    const { width, height } = this.scale;
    
    // Add background
    this.add.rectangle(0, 0, width, height, 0x1a1a1a).setOrigin(0);
    
    // Define zones
    this.setupZones(width, height);
    
    // Draw zone boundaries (for development)
    this.drawZones();
    
    // Add UI text
    this.setupUI();
    
    // Setup input handlers
    this.setupInputHandlers();
  }

  private setupZones(width: number, height: number) {
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Opponent zones (top)
    this.zones.set('opp-leader', new Phaser.Geom.Rectangle(50, 100, this.CARD_WIDTH * this.CARD_SCALE, this.CARD_HEIGHT * this.CARD_SCALE));
    this.zones.set('opp-life', new Phaser.Geom.Rectangle(150, 50, 400, 80));
    this.zones.set('opp-don', new Phaser.Geom.Rectangle(width - 200, 100, 150, 100));
    this.zones.set('opp-field', new Phaser.Geom.Rectangle(150, 180, width - 400, 120));
    this.zones.set('opp-hand', new Phaser.Geom.Rectangle(150, 20, width - 400, 80));
    this.zones.set('opp-deck', new Phaser.Geom.Rectangle(width - 150, 50, this.CARD_WIDTH, this.CARD_HEIGHT));
    this.zones.set('opp-trash', new Phaser.Geom.Rectangle(width - 150, 160, this.CARD_WIDTH, this.CARD_HEIGHT));
    
    // Battle zone (center)
    this.zones.set('battle', new Phaser.Geom.Rectangle(centerX - 200, centerY - 60, 400, 120));
    
    // Player zones (bottom)
    this.zones.set('player-field', new Phaser.Geom.Rectangle(150, height - 300, width - 400, 120));
    this.zones.set('player-leader', new Phaser.Geom.Rectangle(50, height - 200, this.CARD_WIDTH * this.CARD_SCALE, this.CARD_HEIGHT * this.CARD_SCALE));
    this.zones.set('player-life', new Phaser.Geom.Rectangle(150, height - 130, 400, 80));
    this.zones.set('player-don', new Phaser.Geom.Rectangle(width - 200, height - 200, 150, 100));
    this.zones.set('player-hand', new Phaser.Geom.Rectangle(150, height - 100, width - 400, 100));
    this.zones.set('player-deck', new Phaser.Geom.Rectangle(width - 150, height - 150, this.CARD_WIDTH, this.CARD_HEIGHT));
    this.zones.set('player-trash', new Phaser.Geom.Rectangle(width - 150, height - 260, this.CARD_WIDTH, this.CARD_HEIGHT));
  }

  private drawZones() {
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x444444, 0.3);
    
    this.zones.forEach((zone, name) => {
      graphics.strokeRectShape(zone);
      
      // Add zone labels
      this.add.text(zone.x + zone.width / 2, zone.y - 5, name.replace('-', ' ').toUpperCase(), {
        fontSize: '10px',
        color: '#666666'
      }).setOrigin(0.5, 1);
    });
  }

  private setupUI() {
    const { width, height } = this.scale;
    
    // Turn indicator
    this.add.text(width / 2, 20, 'TURN 1', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Phase indicator
    this.add.text(width / 2, 45, 'MAIN PHASE', {
      fontSize: '16px',
      color: '#ffd700'
    }).setOrigin(0.5);
    
    // Player info
    this.add.text(50, height - 50, 'Player 1', {
      fontSize: '18px',
      color: '#ffffff'
    });
    
    // Opponent info
    this.add.text(50, 50, 'Player 2', {
      fontSize: '18px',
      color: '#ffffff'
    });
    
    // Action buttons
    this.createActionButton(width - 150, height / 2 - 60, 'ATTACK', () => this.onAttackClick());
    this.createActionButton(width - 150, height / 2, 'END TURN', () => this.onEndTurnClick());
    this.createActionButton(width - 150, height / 2 + 60, 'PASS', () => this.onPassClick());
  }

  private createActionButton(x: number, y: number, text: string, callback: () => void) {
    const button = this.add.rectangle(x, y, 120, 40, 0x2d2d2d)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callback)
      .on('pointerover', () => button.setFillStyle(0x3d3d3d))
      .on('pointerout', () => button.setFillStyle(0x2d2d2d));
    
    this.add.text(x, y, text, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  private setupInputHandlers() {
    // Card click handling
    this.input.on('gameobjectdown', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image && gameObject.getData('cardId')) {
        this.onCardClick(gameObject.getData('cardId'));
      }
    });
    
    // Card hover handling
    this.input.on('gameobjectover', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image && gameObject.getData('cardId')) {
        this.onCardHover(gameObject);
      }
    });
    
    this.input.on('gameobjectout', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image && gameObject.getData('cardId')) {
        this.onCardHoverEnd(gameObject);
      }
    });
    
    // Drag and drop
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image) {
        gameObject.setDepth(1000);
      }
    });
    
    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      if (gameObject instanceof Phaser.GameObjects.Image) {
        gameObject.x = dragX;
        gameObject.y = dragY;
      }
    });
    
    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image) {
        this.onCardDragEnd(gameObject, pointer);
      }
    });
  }

  public updateGameState(state: GameState, playerId: string) {
    this.gameState = state;
    this.playerId = playerId;
    this.renderGameState();
  }

  private renderGameState() {
    if (!this.gameState || !this.playerId) return;
    
    // Clear existing sprites
    this.cardSprites.forEach(sprite => sprite.destroy());
    this.cardSprites.clear();
    
    const player = this.gameState.players[this.playerId];
    const opponent = Object.values(this.gameState.players).find(p => p.id !== this.playerId);
    
    if (player) {
      this.renderPlayerCards(player, 'player');
    }
    
    if (opponent) {
      this.renderPlayerCards(opponent, 'opp');
    }
  }

  private renderPlayerCards(player: PlayerState, prefix: string) {
    // Render leader
    if (player.leaderCard) {
      this.renderCard(player.leaderCard, `${prefix}-leader`);
    }
    
    // Render life cards
    const lifeZone = this.zones.get(`${prefix}-life`);
    if (lifeZone) {
      player.lifeCards.forEach((card, index) => {
        const x = lifeZone.x + 50 + (index * 70);
        const y = lifeZone.y + lifeZone.height / 2;
        this.createCardSprite(card, x, y, card.faceUp || false);
      });
    }
    
    // Render field cards
    const fieldZone = this.zones.get(`${prefix}-field`);
    if (fieldZone) {
      player.field.forEach((card, index) => {
        const x = fieldZone.x + 50 + (index * 80);
        const y = fieldZone.y + fieldZone.height / 2;
        const sprite = this.createCardSprite(card, x, y, true);
        
        // Rotate if rested
        if (card.state === CardState.RESTED) {
          sprite.setRotation(Phaser.Math.DegToRad(90));
        }
      });
    }
    
    // Render hand cards
    const handZone = this.zones.get(`${prefix}-hand`);
    if (handZone) {
      const isMyHand = prefix === 'player';
      player.hand.forEach((card, index) => {
        const x = handZone.x + 50 + (index * 60);
        const y = handZone.y + handZone.height / 2;
        this.createCardSprite(card, x, y, isMyHand);
      });
    }
    
    // Render DON! cards
    const donZone = this.zones.get(`${prefix}-don`);
    if (donZone) {
      const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;
      const restedDon = player.donField.filter(d => d.state === CardState.RESTED).length;
      
      // Display DON! counts
      this.add.text(donZone.x + 10, donZone.y + 20, `Active: ${activeDon}`, {
        fontSize: '14px',
        color: '#00ff00'
      });
      
      this.add.text(donZone.x + 10, donZone.y + 40, `Rested: ${restedDon}`, {
        fontSize: '14px',
        color: '#ff0000'
      });
      
      this.add.text(donZone.x + 10, donZone.y + 60, `Deck: ${player.donDeck}`, {
        fontSize: '14px',
        color: '#ffffff'
      });
    }
  }

  private renderCard(card: GameCard, zoneName: string) {
    const zone = this.zones.get(zoneName);
    if (!zone) return;
    
    const x = zone.x + zone.width / 2;
    const y = zone.y + zone.height / 2;
    
    return this.createCardSprite(card, x, y, true);
  }

  private createCardSprite(card: GameCard, x: number, y: number, faceUp: boolean): Phaser.GameObjects.Image {
    const texture = faceUp ? 'card-back' : 'card-back'; // TODO: Load actual card images
    const sprite = this.add.image(x, y, texture)
      .setScale(this.CARD_SCALE)
      .setInteractive({ useHandCursor: true })
      .setData('cardId', card.id);
    
    // Make player hand cards draggable
    if (card.zone === CardZone.HAND && card.owner === this.playerId) {
      this.input.setDraggable(sprite);
    }
    
    this.cardSprites.set(card.id, sprite);
    
    // Add card info text overlay
    if (faceUp && card.cardId !== 'DON') {
      this.add.text(x, y - 30, card.cardId, {
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#000000'
      }).setOrigin(0.5);
    }
    
    return sprite;
  }

  private onCardClick(cardId: string) {
    console.log('Card clicked:', cardId);
    this.selectedCard = cardId;
    
    // Highlight selected card
    const sprite = this.cardSprites.get(cardId);
    if (sprite) {
      sprite.setTint(0x00ff00);
    }
  }

  private onCardHover(gameObject: Phaser.GameObjects.Image) {
    gameObject.setScale(this.CARD_SCALE * 1.1);
    
    // Show card preview
    if (this.hoverCard) {
      this.hoverCard.destroy();
    }
    
    const { width } = this.scale;
    this.hoverCard = this.add.image(width - 200, 300, 'card-back')
      .setScale(2)
      .setDepth(2000);
  }

  private onCardHoverEnd(gameObject: Phaser.GameObjects.Image) {
    gameObject.setScale(this.CARD_SCALE);
    
    if (this.hoverCard) {
      this.hoverCard.destroy();
      this.hoverCard = undefined;
    }
  }

  private onCardDragEnd(gameObject: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer) {
    const cardId = gameObject.getData('cardId');
    
    // Check which zone the card was dropped in
    this.zones.forEach((zone, name) => {
      if (zone.contains(pointer.x, pointer.y)) {
        console.log(`Card ${cardId} dropped in ${name}`);
        
        // Emit play card event if dropped in field
        if (name === 'player-field') {
          this.events.emit('playCard', { cardId, zone: CardZone.FIELD });
        }
      }
    });
    
    // Reset card position if not played
    this.renderGameState();
  }

  private onAttackClick() {
    if (this.selectedCard) {
      this.events.emit('declareAttack', { attackerId: this.selectedCard });
    }
  }

  private onEndTurnClick() {
    this.events.emit('endTurn');
  }

  private onPassClick() {
    this.events.emit('pass');
  }
}