import Phaser from 'phaser';
import { GameState, GameCard, CardZone, CardState, PlayerState } from '@optcgsim/shared';

// Card data structure from cards.json
interface CardData {
  id: string;
  name: string;
  setCode: string;
  type: string;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  imageUrl: string;
}

export class GameScene extends Phaser.Scene {
  private gameState?: GameState;
  private playerId?: string;
  private cardSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private zones: Map<string, Phaser.Geom.Rectangle> = new Map();
  private selectedCard?: string;
  private hoverCard?: Phaser.GameObjects.Container;
  private loadedTextures: Set<string> = new Set();
  private cardDataMap: Map<string, CardData> = new Map();
  private cardDataLoaded = false;

  // UI elements
  private turnIndicator?: Phaser.GameObjects.Text;
  private phaseIndicator?: Phaser.GameObjects.Text;
  private turnBanner?: Phaser.GameObjects.Container;
  private zoneHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private actionButtons: Map<string, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();

  // Zone dimensions
  private readonly CARD_WIDTH = 63;
  private readonly CARD_HEIGHT = 88;
  private readonly CARD_SCALE = 1.2;
  
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    // Load card back images
    this.load.image('card-back', '/assets/cardbacks/CardBackRegular.png');
    this.load.image('don-back', '/assets/cardbacks/CardBackDon.png');

    // Load playmat/background (create placeholder if doesn't exist)
    this.load.image('playmat', '/assets/playmats/playmat.png');

    // Load card data
    this.load.json('cardData', '/data/cards.json');
  }

  /**
   * Load card data from JSON into the cardDataMap
   */
  private loadCardData() {
    if (this.cardDataLoaded) return;

    const cardData = this.cache.json.get('cardData') as CardData[];
    if (cardData && Array.isArray(cardData)) {
      cardData.forEach(card => {
        this.cardDataMap.set(card.id, card);
      });
      this.cardDataLoaded = true;
      console.log(`[GameScene] Loaded ${this.cardDataMap.size} card definitions`);
    }
  }

  /**
   * Get card data by ID
   */
  private getCardData(cardId: string): CardData | undefined {
    return this.cardDataMap.get(cardId);
  }

  /**
   * Dynamically load a card image if not already loaded
   */
  private loadCardImage(cardId: string): string {
    const textureKey = `card-${cardId}`;

    // Return if already loaded
    if (this.loadedTextures.has(textureKey)) {
      return textureKey;
    }

    // Check if card data exists
    const cardData = this.getCardData(cardId);
    if (!cardData) {
      return 'card-back';
    }

    // Try to load the image
    const imageUrl = cardData.imageUrl;

    if (!this.textures.exists(textureKey) && !this.loadedTextures.has(`loading-${textureKey}`)) {
      // Mark as loading to prevent duplicate requests
      this.loadedTextures.add(`loading-${textureKey}`);

      // For external URLs, use setCORS to handle cross-origin requests
      if (imageUrl.startsWith('http')) {
        this.load.setCORS('anonymous');
      }

      // Add to loader and start loading
      this.load.image(textureKey, imageUrl);
      this.load.once('complete', () => {
        this.loadedTextures.delete(`loading-${textureKey}`);
        this.loadedTextures.add(textureKey);
        // Re-render to show the loaded image
        this.renderGameState();
      });
      this.load.once('loaderror', () => {
        console.warn(`[GameScene] Failed to load card image: ${imageUrl}`);
        this.loadedTextures.delete(`loading-${textureKey}`);
        // Mark as failed to prevent retries
        this.loadedTextures.add(`failed-${textureKey}`);
      });
      this.load.start();
    }

    // Return card-back while loading or if failed
    return this.textures.exists(textureKey) ? textureKey : 'card-back';
  }

  create() {
    const { width, height } = this.scale;

    // Load card data from JSON
    this.loadCardData();

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
    this.turnIndicator = this.add.text(width / 2, 20, 'TURN 1', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Phase indicator
    this.phaseIndicator = this.add.text(width / 2, 45, 'WAITING...', {
      fontSize: '16px',
      color: '#ffd700'
    }).setOrigin(0.5);

    // Player info
    this.add.text(50, height - 50, 'You', {
      fontSize: '18px',
      color: '#00ff00'
    });

    // Opponent info
    this.add.text(50, 50, 'Opponent', {
      fontSize: '18px',
      color: '#ff6666'
    });

    // Create zone highlights (initially invisible)
    this.createZoneHighlights();

    // Action buttons
    this.createActionButton(width - 150, height / 2 - 60, 'ATTACK', 'attack', () => this.onAttackClick());
    this.createActionButton(width - 150, height / 2, 'END TURN', 'endTurn', () => this.onEndTurnClick());
    this.createActionButton(width - 150, height / 2 + 60, 'PASS', 'pass', () => this.onPassClick());

    // Turn banner (shown when turn changes)
    this.createTurnBanner();
  }

  private createZoneHighlights() {
    // Create highlight rectangles for droppable zones
    const highlightZones = ['player-field', 'player-leader'];

    highlightZones.forEach(zoneName => {
      const zone = this.zones.get(zoneName);
      if (zone) {
        const highlight = this.add.rectangle(
          zone.x + zone.width / 2,
          zone.y + zone.height / 2,
          zone.width,
          zone.height,
          0x00ff00,
          0
        ).setStrokeStyle(3, 0x00ff00, 0);
        this.zoneHighlights.set(zoneName, highlight);
      }
    });
  }

  private createTurnBanner() {
    const { width, height } = this.scale;

    this.turnBanner = this.add.container(width / 2, height / 2);
    this.turnBanner.setDepth(3000);
    this.turnBanner.setAlpha(0);

    const bg = this.add.rectangle(0, 0, 400, 80, 0x000000, 0.9)
      .setStrokeStyle(3, 0xffd700);
    const text = this.add.text(0, 0, 'YOUR TURN', {
      fontSize: '36px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.turnBanner.add([bg, text]);
  }

  private showTurnBanner(isYourTurn: boolean) {
    if (!this.turnBanner) return;

    const text = this.turnBanner.getAt(1) as Phaser.GameObjects.Text;
    text.setText(isYourTurn ? 'YOUR TURN' : "OPPONENT'S TURN");
    text.setColor(isYourTurn ? '#ffd700' : '#ff6666');

    const bg = this.turnBanner.getAt(0) as Phaser.GameObjects.Rectangle;
    bg.setStrokeStyle(3, isYourTurn ? 0xffd700 : 0xff6666);

    // Animate the banner
    this.tweens.add({
      targets: this.turnBanner,
      alpha: { from: 0, to: 1 },
      y: { from: this.scale.height / 2 - 50, to: this.scale.height / 2 },
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: this.turnBanner,
            alpha: 0,
            duration: 300
          });
        });
      }
    });
  }

  private showZoneHighlights(show: boolean) {
    this.zoneHighlights.forEach(highlight => {
      if (show) {
        highlight.setFillStyle(0x00ff00, 0.2);
        highlight.setStrokeStyle(3, 0x00ff00, 1);
      } else {
        highlight.setFillStyle(0x00ff00, 0);
        highlight.setStrokeStyle(3, 0x00ff00, 0);
      }
    });
  }

  private createActionButton(x: number, y: number, label: string, id: string, callback: () => void) {
    const button = this.add.rectangle(x, y, 120, 40, 0x2d2d2d)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callback)
      .on('pointerover', () => button.setFillStyle(0x3d3d3d))
      .on('pointerout', () => button.setFillStyle(0x2d2d2d));

    const text = this.add.text(x, y, label, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.actionButtons.set(id, { bg: button, text });
  }

  private updateActionButtons(isYourTurn: boolean) {
    this.actionButtons.forEach(({ bg, text }) => {
      if (isYourTurn) {
        bg.setFillStyle(0x2d2d2d);
        bg.setAlpha(1);
        text.setAlpha(1);
        bg.setInteractive({ useHandCursor: true });
      } else {
        bg.setFillStyle(0x1a1a1a);
        bg.setAlpha(0.5);
        text.setAlpha(0.5);
        bg.disableInteractive();
      }
    });
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
        gameObject.setAlpha(0.8);
        // Show zone highlights
        this.showZoneHighlights(true);
      }
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      if (gameObject instanceof Phaser.GameObjects.Image) {
        gameObject.x = dragX;
        gameObject.y = dragY;

        // Highlight zone under cursor
        this.updateZoneHighlightUnderCursor(dragX, dragY);
      }
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image) {
        gameObject.setAlpha(1);
        // Hide zone highlights
        this.showZoneHighlights(false);
        this.onCardDragEnd(gameObject, pointer);
      }
    });
  }

  private updateZoneHighlightUnderCursor(x: number, y: number) {
    this.zoneHighlights.forEach((highlight, zoneName) => {
      const zone = this.zones.get(zoneName);
      if (zone && zone.contains(x, y)) {
        highlight.setFillStyle(0x00ff00, 0.4);
        highlight.setStrokeStyle(4, 0x00ff00, 1);
      } else {
        highlight.setFillStyle(0x00ff00, 0.2);
        highlight.setStrokeStyle(3, 0x00ff00, 0.5);
      }
    });
  }

  public updateGameState(state: GameState, playerId: string) {
    const previousActivePlayer = this.gameState?.activePlayerId;

    this.gameState = state;
    this.playerId = playerId;

    // Update UI indicators
    this.updateUIIndicators();

    // Show turn banner if turn changed
    if (previousActivePlayer !== undefined && previousActivePlayer !== state.activePlayerId) {
      const isYourTurn = state.activePlayerId === playerId;
      this.showTurnBanner(isYourTurn);
    }

    // Update action buttons based on whose turn it is
    this.updateActionButtons(state.activePlayerId === playerId);

    this.renderGameState();
  }

  private updateUIIndicators() {
    if (!this.gameState || !this.playerId) return;

    // Update turn indicator
    if (this.turnIndicator) {
      this.turnIndicator.setText(`TURN ${this.gameState.turn}`);
    }

    // Update phase indicator
    if (this.phaseIndicator) {
      const isYourTurn = this.gameState.activePlayerId === this.playerId;
      const phaseNames: Record<string, string> = {
        'refresh': 'REFRESH PHASE',
        'draw': 'DRAW PHASE',
        'don': 'DON!! PHASE',
        'main': 'MAIN PHASE',
        'battle': 'BATTLE PHASE',
        'counter': 'COUNTER STEP',
        'damage': 'DAMAGE STEP',
        'end': 'END PHASE',
        'game_over': 'GAME OVER',
      };

      const phaseName = phaseNames[this.gameState.phase] || this.gameState.phase.toUpperCase();
      const turnText = isYourTurn ? '' : " (Opponent's Turn)";

      this.phaseIndicator.setText(phaseName + turnText);
      this.phaseIndicator.setColor(isYourTurn ? '#ffd700' : '#ff6666');
    }
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
    // Determine which texture to use
    let texture = 'card-back';
    const showPlaceholder = faceUp && card.cardId !== 'DON';

    if (showPlaceholder) {
      texture = this.loadCardImage(card.cardId);
    }

    const sprite = this.add.image(x, y, texture)
      .setScale(this.CARD_SCALE)
      .setInteractive({ useHandCursor: true })
      .setData('cardId', card.id)
      .setData('cardDefId', card.cardId);

    // Make player hand cards draggable
    if (card.zone === CardZone.HAND && card.owner === this.playerId) {
      this.input.setDraggable(sprite);
    }

    this.cardSprites.set(card.id, sprite);

    // Add power/cost overlay for face-up cards
    if (showPlaceholder) {
      const cardData = this.getCardData(card.cardId);

      // If image failed to load, show detailed placeholder
      if (texture === 'card-back' && cardData) {
        this.createCardPlaceholder(x, y, card, cardData);
      } else if (cardData) {
        // Show power for characters/leaders (overlay on actual image)
        if (card.power !== undefined || cardData.power !== null) {
          const power = card.power || cardData.power || 0;
          this.add.text(x - 25, y + 35, `${power}`, {
            fontSize: '12px',
            color: '#ff4444',
            fontStyle: 'bold',
            backgroundColor: '#000000'
          }).setOrigin(0.5);
        }

        // Show cost for non-leaders
        if (cardData.cost !== null && cardData.type !== 'LEADER') {
          this.add.text(x - 25, y - 35, `${cardData.cost}`, {
            fontSize: '12px',
            color: '#ffff00',
            fontStyle: 'bold',
            backgroundColor: '#000000'
          }).setOrigin(0.5);
        }
      }
    }

    return sprite;
  }

  /**
   * Create a detailed placeholder for cards without loaded images
   */
  private createCardPlaceholder(x: number, y: number, card: GameCard, cardData: CardData) {
    const color = this.getColorHex(cardData.colors[0] || 'BLACK');
    const cardWidth = this.CARD_WIDTH * this.CARD_SCALE;
    const cardHeight = this.CARD_HEIGHT * this.CARD_SCALE;

    // Background with color border
    this.add.rectangle(x, y, cardWidth, cardHeight, color, 0.8)
      .setStrokeStyle(3, color);

    // Inner background
    this.add.rectangle(x, y, cardWidth - 6, cardHeight - 6, 0x1a1a1a, 0.95);

    // Card type indicator at top
    const typeColors: Record<string, number> = {
      'LEADER': 0xffd700,
      'CHARACTER': 0x00aaff,
      'EVENT': 0xff6600,
      'STAGE': 0x00ff66,
    };
    const typeColor = typeColors[cardData.type] || 0xffffff;

    this.add.text(x, y - cardHeight / 2 + 12, cardData.type, {
      fontSize: '8px',
      color: `#${typeColor.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Card name (wrapped)
    const name = cardData.name.length > 12 ? cardData.name.substring(0, 11) + '...' : cardData.name;
    this.add.text(x, y - 15, name, {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
      wordWrap: { width: cardWidth - 10 },
      align: 'center'
    }).setOrigin(0.5);

    // Card ID
    this.add.text(x, y + 5, card.cardId, {
      fontSize: '8px',
      color: '#888888'
    }).setOrigin(0.5);

    // Stats at bottom
    let statsText = '';
    if (cardData.cost !== null) {
      statsText += `C:${cardData.cost} `;
    }
    const power = card.power || cardData.power;
    if (power !== null) {
      statsText += `P:${power}`;
    }

    if (statsText) {
      this.add.text(x, y + cardHeight / 2 - 15, statsText.trim(), {
        fontSize: '10px',
        color: '#ffff00',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // Counter value if exists
    if (cardData.counter !== null) {
      this.add.text(x, y + cardHeight / 2 - 28, `+${cardData.counter}`, {
        fontSize: '9px',
        color: '#00ff00'
      }).setOrigin(0.5);
    }
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

    const { width, height } = this.scale;
    const cardDefId = gameObject.getData('cardDefId');
    const cardData = this.getCardData(cardDefId);

    // Create preview container
    this.hoverCard = this.add.container(width - 150, height / 2);
    this.hoverCard.setDepth(2000);

    // Card image (larger)
    const texture = this.loadCardImage(cardDefId);
    const cardImage = this.add.image(0, -50, texture).setScale(2.5);
    this.hoverCard.add(cardImage);

    // Card info panel
    if (cardData) {
      const panelBg = this.add.rectangle(0, 150, 200, 180, 0x1a1a1a, 0.95)
        .setStrokeStyle(2, this.getColorHex(cardData.colors[0] || 'BLACK'));
      this.hoverCard.add(panelBg);

      // Card name
      const nameText = this.add.text(0, 80, cardData.name, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: 180 },
        align: 'center'
      }).setOrigin(0.5);
      this.hoverCard.add(nameText);

      // Card type and colors
      const typeText = this.add.text(0, 105, `${cardData.type} - ${cardData.colors.join('/')}`, {
        fontSize: '11px',
        color: '#aaaaaa'
      }).setOrigin(0.5);
      this.hoverCard.add(typeText);

      // Stats
      let statsY = 125;
      if (cardData.cost !== null) {
        const costText = this.add.text(-80, statsY, `Cost: ${cardData.cost}`, {
          fontSize: '12px',
          color: '#ffff00'
        });
        this.hoverCard.add(costText);
      }

      if (cardData.power !== null) {
        const powerText = this.add.text(20, statsY, `Power: ${cardData.power}`, {
          fontSize: '12px',
          color: '#ff4444'
        });
        this.hoverCard.add(powerText);
      }

      if (cardData.counter !== null) {
        statsY += 18;
        const counterText = this.add.text(-80, statsY, `Counter: +${cardData.counter}`, {
          fontSize: '12px',
          color: '#44ff44'
        });
        this.hoverCard.add(counterText);
      }

      // Card ID
      const idText = this.add.text(0, 220, cardData.id, {
        fontSize: '10px',
        color: '#666666'
      }).setOrigin(0.5);
      this.hoverCard.add(idText);
    }
  }

  private onCardHoverEnd(gameObject: Phaser.GameObjects.Image) {
    gameObject.setScale(this.CARD_SCALE);

    if (this.hoverCard) {
      this.hoverCard.destroy();
      this.hoverCard = undefined;
    }
  }

  /**
   * Get hex color for card color
   */
  private getColorHex(color: string): number {
    const colors: Record<string, number> = {
      'RED': 0xDC2626,
      'GREEN': 0x16A34A,
      'BLUE': 0x2563EB,
      'PURPLE': 0x9333EA,
      'BLACK': 0x1F2937,
      'YELLOW': 0xEAB308,
    };
    return colors[color.toUpperCase()] || 0x666666;
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