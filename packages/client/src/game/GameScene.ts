import Phaser from 'phaser';
import { GameState, GameCard, CardZone, CardState, PlayerState, GamePhase } from '@optcgsim/shared';

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
  private renderDebounceTimer?: number;
  private pendingImageLoads = 0;
  private sceneReady = false;
  private pendingStateUpdate?: { state: GameState; playerId: string };

  // UI elements
  private turnIndicator?: Phaser.GameObjects.Text;
  private phaseIndicator?: Phaser.GameObjects.Text;
  private turnBanner?: Phaser.GameObjects.Container;
  private zoneHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private actionButtons: Map<string, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();

  // Counter Step UI
  private counterPanel?: Phaser.GameObjects.Container;
  private selectedCounterCards: Set<string> = new Set();
  private counterCardSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  // Trigger Step UI
  private triggerPanel?: Phaser.GameObjects.Container;

  // Mulligan UI
  private mulliganPanel?: Phaser.GameObjects.Container;
  private mulliganDecisionMade = false; // Track if player has already made mulligan decision
  private mulliganPreview?: Phaser.GameObjects.Container; // Card preview during mulligan

  // Sound effects
  private soundEnabled = true;

  // Animation tracking
  private previousCardPositions: Map<string, { x: number; y: number; zone: string }> = new Map();
  private animatingCards: Set<string> = new Set();
  private attackArrow?: Phaser.GameObjects.Graphics;

  // Board visuals
  private backgroundRect?: Phaser.GameObjects.Rectangle;
  private zoneGraphics?: Phaser.GameObjects.Graphics;

  // Zone dimensions
  private readonly CARD_WIDTH = 63;
  private readonly CARD_HEIGHT = 88;
  private readonly CARD_SCALE = 1.2;
  
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    console.log('[GameScene] preload() called');

    // Load card back images
    this.load.image('card-back', '/assets/cardbacks/CardBackRegular.png');
    this.load.image('don-back', '/assets/cardbacks/CardBackDon.png');

    // Load playmat/background
    this.load.image('playmat', '/assets/playmats/Red.png');

    // Load card data
    this.load.json('cardData', '/data/cards.json');

    // Log when loading completes
    this.load.on('complete', () => {
      console.log('[GameScene] All assets loaded');
    });

    this.load.on('loaderror', (file: any) => {
      console.error('[GameScene] Failed to load:', file.key, file.url);
    });
  }

  /**
   * Load card data from JSON into the cardDataMap
   */
  private loadCardData() {
    if (this.cardDataLoaded) return;

    const cardData = this.cache.json.get('cardData') as CardData[];
    console.log('[GameScene] loadCardData called, cardData:', cardData ? `${cardData.length} items` : 'null');
    if (cardData && Array.isArray(cardData)) {
      cardData.forEach(card => {
        this.cardDataMap.set(card.id, card);
      });
      this.cardDataLoaded = true;
      console.log(`[GameScene] Loaded ${this.cardDataMap.size} card definitions`);
      // Log a sample card to verify format
      const sampleCard = this.cardDataMap.get('ST01-001');
      console.log('[GameScene] Sample card ST01-001:', sampleCard);
    } else {
      console.error('[GameScene] Failed to load card data from JSON!');
    }
  }

  /**
   * Get card data by ID
   */
  private getCardData(cardId: string): CardData | undefined {
    return this.cardDataMap.get(cardId);
  }

  /**
   * Schedule a debounced render to avoid cascading re-renders when loading images
   */
  private scheduleRender() {
    // Clear any existing timer
    if (this.renderDebounceTimer) {
      clearTimeout(this.renderDebounceTimer);
    }

    // Wait for a short delay to batch multiple image loads
    this.renderDebounceTimer = window.setTimeout(() => {
      this.renderDebounceTimer = undefined;
      // Only render if no more images are pending
      if (this.pendingImageLoads === 0) {
        this.renderGameState();

        // Update mulligan panel textures in-place (don't destroy and recreate)
        if (this.mulliganPanel && this.gameState?.phase === GamePhase.START_MULLIGAN) {
          this.updateMulliganPanelTextures();
        }
      } else {
        // If still loading, schedule another check
        this.scheduleRender();
      }
    }, 100) as unknown as number;
  }

  /**
   * Update textures of cards in the mulligan panel without recreating it
   */
  private updateMulliganPanelTextures() {
    if (!this.mulliganPanel) return;

    // Iterate through panel children and update card textures
    this.mulliganPanel.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Image) {
        const cardDefId = child.getData('cardDefId');
        if (cardDefId) {
          const textureKey = `card-${cardDefId}`;
          // Only update if texture is now loaded and sprite is using card-back
          if (this.loadedTextures.has(textureKey) && child.texture.key === 'card-back') {
            child.setTexture(textureKey);
            console.log(`[GameScene] Updated mulligan card texture: ${textureKey}`);
          }
        }
      }
    });
  }

  /**
   * Dynamically load a card image if not already loaded
   * Returns texture key or 'card-back-failed' if image failed to load
   */
  private loadCardImage(cardId: string): string {
    const textureKey = `card-${cardId}`;

    // Return if already loaded successfully
    if (this.loadedTextures.has(textureKey)) {
      return textureKey;
    }

    // Return special marker if image failed to load (for CORS or other errors)
    if (this.loadedTextures.has(`failed-${textureKey}`)) {
      return 'card-back-failed';
    }

    // Check if card data exists
    const cardData = this.getCardData(cardId);
    if (!cardData) {
      console.warn(`[GameScene] loadCardImage: No card data found for ${cardId}`);
      return 'card-back';
    }

    // Try to load the image
    let imageUrl = cardData.imageUrl;

    // Use backend proxy for external images to avoid CORS issues
    if (imageUrl) {
      if (imageUrl.includes('optcgapi.com/media/static/Card_Images/')) {
        const filename = imageUrl.split('/').pop();
        imageUrl = `/api/images/cards/${filename}`;
      } else if (imageUrl.includes('en.onepiece-cardgame.com/images/cardlist/card/')) {
        const filename = imageUrl.split('/').pop();
        imageUrl = `/api/images/official/${filename}`;
      }
    }

    if (!this.textures.exists(textureKey) && !this.loadedTextures.has(`loading-${textureKey}`)) {
      // Mark as loading to prevent duplicate requests
      this.loadedTextures.add(`loading-${textureKey}`);
      this.pendingImageLoads++;

      // For external URLs, use setCORS to handle cross-origin requests
      if (imageUrl.startsWith('http')) {
        this.load.setCORS('anonymous');
      }

      // Add to loader with file-specific event listeners
      this.load.image(textureKey, imageUrl);

      // Use file-specific completion event (not global 'complete')
      this.load.once(`filecomplete-image-${textureKey}`, () => {
        console.log(`[GameScene] Image loaded successfully: ${textureKey}`);
        this.loadedTextures.delete(`loading-${textureKey}`);
        this.loadedTextures.add(textureKey);
        this.pendingImageLoads--;
        // Debounced re-render to avoid cascading renders
        this.scheduleRender();
      });

      // Use file-specific error event
      this.load.once(`loaderror-image-${textureKey}`, () => {
        console.warn(`[GameScene] Failed to load card image: ${imageUrl}`);
        this.loadedTextures.delete(`loading-${textureKey}`);
        // Mark as failed to prevent retries
        this.loadedTextures.add(`failed-${textureKey}`);
        this.pendingImageLoads--;
        // Re-render to show placeholder for failed images
        this.scheduleRender();
      });

      this.load.start();
    }

    // Return card-back while loading or if failed (use our tracking, not Phaser's async texture manager)
    return this.loadedTextures.has(textureKey) ? textureKey : 'card-back';
  }

  create() {
    const { width, height } = this.scale;
    console.log('[GameScene] create() called. Canvas size:', width, 'x', height);

    // Check card-back texture dimensions
    if (this.textures.exists('card-back')) {
      const frame = this.textures.getFrame('card-back');
      console.log('[GameScene] card-back texture size:', frame.width, 'x', frame.height);
    } else {
      console.error('[GameScene] card-back texture NOT loaded!');
    }

    // Load card data from JSON
    this.loadCardData();

    // Initialize sound system
    this.initializeSounds();

    // Add background
    this.backgroundRect = this.add.rectangle(0, 0, width, height, 0x1a1a1a).setOrigin(0);

    // Define zones
    this.setupZones(width, height);

    // Draw zone boundaries (for development)
    this.drawZones();

    // Add UI text
    this.setupUI();

    // Setup input handlers
    this.setupInputHandlers();

    // Mark scene as ready
    this.sceneReady = true;
    console.log('[GameScene] Scene is now ready');

    // Process any pending state update that came in before create() finished
    if (this.pendingStateUpdate) {
      console.log('[GameScene] Processing pending state update');
      this.updateGameState(this.pendingStateUpdate.state, this.pendingStateUpdate.playerId);
      this.pendingStateUpdate = undefined;
    }
  }

  /**
   * Initialize procedural sound effects using Web Audio
   */
  private initializeSounds() {
    // We'll use procedural audio for now since we don't have sound files
    // This creates simple beeps and tones for feedback
    this.soundEnabled = true;
  }

  /**
   * Play a procedural sound effect
   */
  private playSound(soundType: 'cardPlay' | 'attack' | 'damage' | 'turnStart' | 'victory' | 'defeat' | 'click' | 'counter') {
    if (!this.soundEnabled) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure sound based on type
      switch (soundType) {
        case 'cardPlay':
          oscillator.frequency.value = 440; // A4
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
          break;

        case 'attack':
          oscillator.frequency.value = 220; // A3
          oscillator.type = 'sawtooth';
          gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.2);
          break;

        case 'damage':
          oscillator.frequency.value = 150;
          oscillator.type = 'square';
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
          break;

        case 'turnStart':
          // Two-tone chime
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
          oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.25);
          break;

        case 'victory':
          // Ascending triumphant chord
          oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
          oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
          oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
          break;

        case 'defeat':
          // Descending sad tone
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
          oscillator.frequency.linearRampToValueAtTime(220, audioContext.currentTime + 0.4); // A3
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;

        case 'click':
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.05);
          break;

        case 'counter':
          // Quick shield-like sound
          oscillator.frequency.value = 600;
          oscillator.type = 'triangle';
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.12);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.12);
          break;
      }
    } catch (e) {
      // Web Audio not supported or blocked
      console.warn('Sound playback failed:', e);
    }
  }

  /**
   * Toggle sound on/off
   */
  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  // ==================== ANIMATION SYSTEM ====================

  /**
   * Animate a card moving from one position to another
   */
  private animateCardMove(
    cardSprite: Phaser.GameObjects.Image,
    toX: number,
    toY: number,
    duration: number = 250,
    onComplete?: () => void
  ) {
    const cardId = cardSprite.getData('cardId');
    this.animatingCards.add(cardId);

    // Bring card to front during animation
    cardSprite.setDepth(1000);

    this.tweens.add({
      targets: cardSprite,
      x: toX,
      y: toY,
      duration: duration,
      ease: 'Power2.easeOut',
      onComplete: () => {
        cardSprite.setDepth(1);
        this.animatingCards.delete(cardId);
        onComplete?.();
      }
    });
  }

  /**
   * Animate a card flip (face-down to face-up or vice versa)
   */
  private animateCardFlip(
    cardSprite: Phaser.GameObjects.Image,
    newTexture: string,
    duration: number = 200
  ) {
    const originalWidth = cardSprite.displayWidth;

    this.tweens.add({
      targets: cardSprite,
      scaleX: 0,
      duration: duration / 2,
      ease: 'Power2.easeIn',
      onComplete: () => {
        cardSprite.setTexture(newTexture);
        this.tweens.add({
          targets: cardSprite,
          scaleX: originalWidth / cardSprite.width,
          duration: duration / 2,
          ease: 'Power2.easeOut'
        });
      }
    });
  }

  /**
   * Animate a card being played (hand to field with scale effect)
   */
  private animateCardPlay(
    cardSprite: Phaser.GameObjects.Image,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) {
    cardSprite.setPosition(fromX, fromY);
    cardSprite.setDepth(1000);
    cardSprite.setAlpha(0.8);

    // Scale up slightly then settle
    this.tweens.add({
      targets: cardSprite,
      x: toX,
      y: toY,
      scaleX: this.CARD_SCALE * 1.2,
      scaleY: this.CARD_SCALE * 1.2,
      alpha: 1,
      duration: 200,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: cardSprite,
          scaleX: this.CARD_SCALE,
          scaleY: this.CARD_SCALE,
          duration: 100,
          ease: 'Power2.easeIn',
          onComplete: () => {
            cardSprite.setDepth(1);
            this.playSound('cardPlay');
          }
        });
      }
    });
  }

  /**
   * Animate attack - card slides forward and back
   */
  private animateAttack(attackerSprite: Phaser.GameObjects.Image, targetX: number, targetY: number) {
    const originalX = attackerSprite.x;
    const originalY = attackerSprite.y;

    // Calculate midpoint (don't go all the way to target)
    const midX = originalX + (targetX - originalX) * 0.4;
    const midY = originalY + (targetY - originalY) * 0.4;

    attackerSprite.setDepth(1000);

    // Show attack arrow
    this.showAttackArrow(originalX, originalY, targetX, targetY);

    this.tweens.add({
      targets: attackerSprite,
      x: midX,
      y: midY,
      duration: 150,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.playSound('attack');
        this.tweens.add({
          targets: attackerSprite,
          x: originalX,
          y: originalY,
          duration: 200,
          ease: 'Power2.easeIn',
          onComplete: () => {
            attackerSprite.setDepth(1);
            this.hideAttackArrow();
          }
        });
      }
    });
  }

  /**
   * Show attack arrow from attacker to target
   */
  private showAttackArrow(fromX: number, fromY: number, toX: number, toY: number) {
    this.hideAttackArrow();

    this.attackArrow = this.add.graphics();
    this.attackArrow.setDepth(999);

    // Draw arrow line
    this.attackArrow.lineStyle(4, 0xff4444, 0.8);
    this.attackArrow.beginPath();
    this.attackArrow.moveTo(fromX, fromY);
    this.attackArrow.lineTo(toX, toY);
    this.attackArrow.stroke();

    // Draw arrowhead
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowSize = 15;
    this.attackArrow.fillStyle(0xff4444, 0.8);
    this.attackArrow.beginPath();
    this.attackArrow.moveTo(toX, toY);
    this.attackArrow.lineTo(
      toX - arrowSize * Math.cos(angle - Math.PI / 6),
      toY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    this.attackArrow.lineTo(
      toX - arrowSize * Math.cos(angle + Math.PI / 6),
      toY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    this.attackArrow.closePath();
    this.attackArrow.fill();

    // Pulse animation
    this.tweens.add({
      targets: this.attackArrow,
      alpha: { from: 0.8, to: 0.4 },
      yoyo: true,
      repeat: 3,
      duration: 150
    });
  }

  /**
   * Hide attack arrow
   */
  private hideAttackArrow() {
    if (this.attackArrow) {
      this.attackArrow.destroy();
      this.attackArrow = undefined;
    }
  }

  /**
   * Animate damage - card shakes and flashes red
   */
  private animateDamage(cardSprite: Phaser.GameObjects.Image) {
    const originalX = cardSprite.x;

    this.playSound('damage');

    // Flash red
    cardSprite.setTint(0xff0000);

    // Shake
    this.tweens.add({
      targets: cardSprite,
      x: originalX - 5,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        cardSprite.setPosition(originalX, cardSprite.y);
        cardSprite.clearTint();
      }
    });
  }

  /**
   * Animate card being sent to trash
   */
  private animateToTrash(cardSprite: Phaser.GameObjects.Image, trashX: number, trashY: number) {
    cardSprite.setDepth(1000);

    this.tweens.add({
      targets: cardSprite,
      x: trashX,
      y: trashY,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0.5,
      duration: 300,
      ease: 'Power2.easeIn',
      onComplete: () => {
        cardSprite.destroy();
      }
    });
  }

  /**
   * Animate drawing a card
   */
  private animateDrawCard(cardSprite: Phaser.GameObjects.Image, deckX: number, deckY: number, handX: number, handY: number) {
    cardSprite.setPosition(deckX, deckY);
    cardSprite.setDepth(1000);
    cardSprite.setTexture('card-back');

    this.tweens.add({
      targets: cardSprite,
      x: handX,
      y: handY,
      duration: 300,
      ease: 'Power2.easeOut',
      onComplete: () => {
        cardSprite.setDepth(1);
        // Flip to reveal
        const cardDefId = cardSprite.getData('cardDefId');
        const texture = this.loadCardImage(cardDefId);
        if (texture !== 'card-back') {
          this.animateCardFlip(cardSprite, texture);
        }
      }
    });
  }

  // ==================== END ANIMATION SYSTEM ====================

  // ==================== VISUAL EFFECTS ====================

  /**
   * Highlight a card as playable (green glow)
   */
  private highlightPlayable(cardSprite: Phaser.GameObjects.Image) {
    cardSprite.setData('highlighted', true);
    cardSprite.preFX?.clear();
    cardSprite.preFX?.addGlow(0x00ff00, 4, 0, false, 0.1, 8);
  }

  /**
   * Highlight a card as a valid attack target (red glow)
   */
  private highlightTarget(cardSprite: Phaser.GameObjects.Image) {
    cardSprite.setData('highlighted', true);
    cardSprite.preFX?.clear();
    cardSprite.preFX?.addGlow(0xff4444, 4, 0, false, 0.1, 8);
  }

  /**
   * Highlight a card needing attention (yellow glow)
   */
  private highlightAttention(cardSprite: Phaser.GameObjects.Image) {
    cardSprite.setData('highlighted', true);
    cardSprite.preFX?.clear();
    cardSprite.preFX?.addGlow(0xffff00, 4, 0, false, 0.1, 8);
  }

  /**
   * Clear highlight from a card
   */
  private clearHighlight(cardSprite: Phaser.GameObjects.Image) {
    cardSprite.setData('highlighted', false);
    cardSprite.preFX?.clear();
  }

  /**
   * Clear all card highlights
   */
  private clearAllHighlights() {
    this.cardSprites.forEach(sprite => {
      if (sprite.getData('highlighted')) {
        this.clearHighlight(sprite);
      }
    });
  }

  /**
   * Highlight playable cards in hand based on available DON
   */
  private updatePlayableHighlights() {
    if (!this.gameState || !this.playerId) return;

    const player = this.gameState.players[this.playerId];
    if (!player) return;

    // Only highlight during your turn in main phase
    const isYourTurn = this.gameState.activePlayerId === this.playerId;
    const isMainPhase = this.gameState.phase === GamePhase.MAIN_PHASE ||
                        this.gameState.phase === 'main';

    if (!isYourTurn || !isMainPhase) {
      this.clearAllHighlights();
      return;
    }

    // Count active DON
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;

    // Highlight playable hand cards
    player.hand.forEach(card => {
      const sprite = this.cardSprites.get(card.id);
      if (!sprite) return;

      const cardData = this.getCardData(card.cardId);
      if (cardData && cardData.cost !== null && cardData.cost <= activeDon) {
        this.highlightPlayable(sprite);
      } else {
        this.clearHighlight(sprite);
      }
    });

    // Highlight characters that can attack (active, not rested)
    player.field.forEach(card => {
      const sprite = this.cardSprites.get(card.id);
      if (!sprite) return;

      if (card.state === CardState.ACTIVE) {
        this.highlightPlayable(sprite);
      }
    });

    // Highlight leader if active
    if (player.leaderCard) {
      const leaderSprite = this.cardSprites.get(player.leaderCard.id);
      if (leaderSprite && player.leaderCard.state === CardState.ACTIVE) {
        this.highlightPlayable(leaderSprite);
      }
    }
  }

  /**
   * Show valid attack targets when selecting an attacker
   */
  private showAttackTargets(attackerId: string) {
    if (!this.gameState || !this.playerId) return;

    const opponent = Object.values(this.gameState.players).find(p => p.id !== this.playerId);
    if (!opponent) return;

    // Highlight opponent's leader
    if (opponent.leaderCard) {
      const leaderSprite = this.cardSprites.get(opponent.leaderCard.id);
      if (leaderSprite) {
        this.highlightTarget(leaderSprite);
      }
    }

    // Highlight opponent's rested characters
    opponent.field.forEach(card => {
      if (card.state === CardState.RESTED) {
        const sprite = this.cardSprites.get(card.id);
        if (sprite) {
          this.highlightTarget(sprite);
        }
      }
    });
  }

  // ==================== END VISUAL EFFECTS ====================

  private setupZones(width: number, height: number) {
    // Card dimensions (76 x 106 at 1.2 scale)
    const cardW = this.CARD_WIDTH * this.CARD_SCALE;
    const cardH = this.CARD_HEIGHT * this.CARD_SCALE;
    const gap = 4; // Small gap between cards

    // === DUELING NEXUS-INSPIRED LAYOUT ===
    // Canvas: 1280 x 720
    //
    // ┌─────────────────────────────────────────────────────────────────┐
    // │                    OPPONENT HAND (small indicator)              │ Y=5
    // │ [Life x5]    [DON][Leader]  [Characters x5]      [Deck][Trash] │ Y=40
    // │                                                   [Stage]       │
    // ├──────────────────────── CENTER LINE ───────────────────────────┤ Y=290
    // │ [Life x5]    [DON][Leader]  [Characters x5]      [Stage]       │ Y=320
    // │                                                   [Deck][Trash] │
    // │                      PLAYER HAND                                │ Y=590
    // └─────────────────────────────────────────────────────────────────┘

    // Right sidebar for deck/trash
    const sidebarX = width - 100;

    // === VERTICAL POSITIONS ===
    const oppHandY = 5;           // Opponent hand indicator
    const oppMainY = 45;          // Opponent main row (life, don, leader, chars)
    const oppSecondY = 160;       // Opponent second row (for overlapping stage area)
    const centerY = 290;          // Center divider
    const playerMainY = 330;      // Player main row
    const playerSecondY = 445;    // Player second row
    const playerHandY = 590;      // Player hand

    // === HORIZONTAL POSITIONS ===
    const lifeX = 15;                           // Life cards start
    const lifeWidth = (cardW + gap) * 5;        // 5 life cards
    const donX = lifeX + lifeWidth + 15;        // DON area after life
    const leaderX = donX + 65;                  // Leader after DON
    const fieldX = leaderX + cardW + 10;        // Characters after leader

    // === OPPONENT ZONES (top half) ===
    this.zones.set('opp-hand', new Phaser.Geom.Rectangle(fieldX, oppHandY, (cardW + gap) * 5, 35));
    this.zones.set('opp-life', new Phaser.Geom.Rectangle(lifeX, oppMainY, lifeWidth, cardH));
    this.zones.set('opp-don', new Phaser.Geom.Rectangle(donX, oppMainY, 55, cardH));
    this.zones.set('opp-leader', new Phaser.Geom.Rectangle(leaderX, oppMainY, cardW, cardH));
    this.zones.set('opp-field', new Phaser.Geom.Rectangle(fieldX, oppMainY, (cardW + gap) * 5, cardH));

    // Opponent sidebar (deck on top, trash below, stage to the left)
    this.zones.set('opp-deck', new Phaser.Geom.Rectangle(sidebarX, oppMainY, cardW, cardH));
    this.zones.set('opp-trash', new Phaser.Geom.Rectangle(sidebarX, oppSecondY, cardW, cardH));
    this.zones.set('opp-stage', new Phaser.Geom.Rectangle(sidebarX - cardW - 15, oppMainY + 50, cardW, cardH));

    // === PLAYER ZONES (bottom half - mirrored) ===
    this.zones.set('player-life', new Phaser.Geom.Rectangle(lifeX, playerMainY, lifeWidth, cardH));
    this.zones.set('player-don', new Phaser.Geom.Rectangle(donX, playerMainY, 55, cardH));
    this.zones.set('player-leader', new Phaser.Geom.Rectangle(leaderX, playerMainY, cardW, cardH));
    this.zones.set('player-field', new Phaser.Geom.Rectangle(fieldX, playerMainY, (cardW + gap) * 5, cardH));

    // Player sidebar (stage on top, deck, then trash)
    this.zones.set('player-stage', new Phaser.Geom.Rectangle(sidebarX - cardW - 15, playerMainY + 50, cardW, cardH));
    this.zones.set('player-deck', new Phaser.Geom.Rectangle(sidebarX, playerSecondY, cardW, cardH));
    this.zones.set('player-trash', new Phaser.Geom.Rectangle(sidebarX, playerSecondY + cardH + 10, cardW, cardH));

    // Player hand (full width at bottom)
    this.zones.set('player-hand', new Phaser.Geom.Rectangle(lifeX, playerHandY, sidebarX - lifeX - 20, cardH + 20));

    // Battle zone (center, for attack animations)
    this.zones.set('battle', new Phaser.Geom.Rectangle(width / 2 - 150, centerY - 20, 300, 40));
  }

  private drawZones() {
    if (!this.zoneGraphics) {
      this.zoneGraphics = this.add.graphics();
    }
    const graphics = this.zoneGraphics;
    graphics.clear();

    // Zone visual configs with colors and labels
    const zoneConfigs: Record<string, { label: string; color: number }> = {
      'player-field': { label: 'CHARACTER', color: 0x2244aa },
      'player-leader': { label: 'LEADER', color: 0xaa4422 },
      'player-life': { label: 'LIFE', color: 0x22aa44 },
      'player-deck': { label: 'DECK', color: 0x444466 },
      'player-trash': { label: 'TRASH', color: 0x664444 },
      'player-don': { label: 'DON!!', color: 0xaa8822 },
      'player-stage': { label: 'STAGE', color: 0x446644 },
      'opp-field': { label: 'CHARACTER', color: 0x2244aa },
      'opp-leader': { label: 'LEADER', color: 0xaa4422 },
      'opp-life': { label: 'LIFE', color: 0x22aa44 },
      'opp-deck': { label: 'DECK', color: 0x444466 },
      'opp-trash': { label: 'TRASH', color: 0x664444 },
      'opp-don': { label: 'DON!!', color: 0xaa8822 },
      'opp-stage': { label: 'STAGE', color: 0x446644 },
    };

    // Draw zone backgrounds
    this.zones.forEach((zone, name) => {
      const config = zoneConfigs[name];
      if (config) {
        // Subtle filled background
        graphics.fillStyle(config.color, 0.12);
        graphics.fillRoundedRect(zone.x - 4, zone.y - 4, zone.width + 8, zone.height + 8, 6);

        // Border
        graphics.lineStyle(1, config.color, 0.35);
        graphics.strokeRoundedRect(zone.x - 4, zone.y - 4, zone.width + 8, zone.height + 8, 6);

        // Zone label (small, above the zone)
        this.add.text(zone.x + zone.width / 2, zone.y - 10, config.label, {
          fontSize: '9px',
          color: '#555555'
        }).setOrigin(0.5, 1);
      }
    });

    // Draw center divider line at Y=290 (between opponent and player zones)
    const centerLineY = 290;
    graphics.lineStyle(2, 0x444444, 0.6);
    graphics.beginPath();
    graphics.moveTo(15, centerLineY);
    graphics.lineTo(this.scale.width - 110, centerLineY);
    graphics.stroke();
  }

  private setupUI() {
    const { width, height } = this.scale;

    // Turn/Phase indicator - top-left corner badge style
    const turnBadge = this.add.container(10, 10);
    turnBadge.setDepth(100);

    const badgeBg = this.add.rectangle(75, 28, 150, 56, 0x000000, 0.75)
      .setStrokeStyle(2, 0x444444)
      .setOrigin(0.5);
    turnBadge.add(badgeBg);

    this.turnIndicator = this.add.text(75, 18, 'TURN 1', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    turnBadge.add(this.turnIndicator);

    this.phaseIndicator = this.add.text(75, 38, 'WAITING...', {
      fontSize: '12px',
      color: '#ffd700'
    }).setOrigin(0.5);
    turnBadge.add(this.phaseIndicator);

    // Create zone highlights (initially invisible)
    this.createZoneHighlights();

    // Action buttons - vertical stack on far right (in center gap Y=250-320)
    const buttonX = width - 60;
    const buttonStartY = 250;

    this.createActionButton(buttonX, buttonStartY, 'END', 'endTurn', () => this.onEndTurnClick());
    this.createActionButton(buttonX, buttonStartY + 40, 'ATK', 'attack', () => this.onAttackClick());
    this.createActionButton(buttonX, buttonStartY + 80, 'PASS', 'pass', () => this.onPassClick());

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

  // Note: the board uses a fixed virtual resolution and relies on Phaser's
  // scale manager (FIT mode) to resize the entire canvas. Zones and cards
  // are laid out once in create() based on that virtual size and then
  // scaled uniformly with the rest of the board.

  private showTurnBanner(isYourTurn: boolean) {
    if (!this.turnBanner) return;

    // Play turn start sound
    if (isYourTurn) {
      this.playSound('turnStart');
    }

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
    const button = this.add.rectangle(x, y, 70, 32, 0x2d2d2d)
      .setStrokeStyle(1, 0x555555)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callback)
      .on('pointerover', () => button.setFillStyle(0x4d4d4d))
      .on('pointerout', () => button.setFillStyle(0x2d2d2d));

    const text = this.add.text(x, y, label, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold'
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
    this.input.on('gameobjectover', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject instanceof Phaser.GameObjects.Image && gameObject.getData('cardId')) {
        this.onCardHover(gameObject, pointer.x, pointer.y);
      }
    });

    // Update hover preview position as mouse moves
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.hoverCard) {
        this.updateHoverPreviewPosition(pointer.x, pointer.y);
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
    console.log('[GameScene] updateGameState called. sceneReady:', this.sceneReady);
    console.log('[GameScene] playerId:', playerId);
    console.log('[GameScene] state.players:', Object.keys(state.players));
    console.log('[GameScene] state.phase:', state.phase);
    console.log('[GameScene] state.turn:', state.turn);

    // If scene is not ready yet, store the state for later
    if (!this.sceneReady) {
      console.log('[GameScene] Scene not ready, storing state for later');
      this.pendingStateUpdate = { state, playerId };
      return;
    }

    const previousActivePlayer = this.gameState?.activePlayerId;
    const previousPhase = this.gameState?.phase;

    this.gameState = state;
    this.playerId = playerId;

    // If we transitioned OUT of mulligan phase, ensure mulligan UI is cleaned up first
    if (previousPhase === GamePhase.START_MULLIGAN && state.phase !== GamePhase.START_MULLIGAN) {
      console.log('[GameScene] Transitioning out of mulligan phase, cleaning up mulligan UI');
      this.hideMulliganUI();
    }

    // Update UI indicators
    this.updateUIIndicators();

    // Show turn banner if turn changed
    if (previousActivePlayer !== undefined && previousActivePlayer !== state.activePlayerId) {
      const isYourTurn = state.activePlayerId === playerId;
      this.showTurnBanner(isYourTurn);
    }

    // Update action buttons based on whose turn it is
    this.updateActionButtons(state.activePlayerId === playerId);

    // Check if we need to show/hide mulligan UI
    this.checkMulliganUI();

    // Check if we need to show/hide counter step UI
    this.checkCounterStepUI();

    this.renderGameState();

    // Update card highlights for playable cards
    this.updatePlayableHighlights();
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
        'START_MULLIGAN': 'MULLIGAN PHASE',
        'refresh': 'REFRESH PHASE',
        'draw': 'DRAW PHASE',
        'don': 'DON!! PHASE',
        'main': 'MAIN PHASE',
        'MAIN_PHASE': 'MAIN PHASE',
        'battle': 'BATTLE PHASE',
        'counter': 'COUNTER STEP',
        'COUNTER_STEP': 'COUNTER STEP',
        'damage': 'DAMAGE STEP',
        'end': 'END PHASE',
        'game_over': 'GAME OVER',
        'GAME_OVER': 'GAME OVER',
      };

      const phaseName = phaseNames[this.gameState.phase] || this.gameState.phase.toUpperCase();
      const turnText = isYourTurn ? '' : " (Opponent's Turn)";

      this.phaseIndicator.setText(phaseName + turnText);
      this.phaseIndicator.setColor(isYourTurn ? '#ffd700' : '#ff6666');
    }
  }

  private renderGameState() {
    if (!this.gameState || !this.playerId) {
      console.log('[GameScene] renderGameState: No gameState or playerId');
      return;
    }

    console.log('[GameScene] renderGameState called. Clearing', this.cardSprites.size, 'existing sprites');

    // Clear existing sprites
    this.cardSprites.forEach(sprite => sprite.destroy());
    this.cardSprites.clear();

    // During mulligan, only render if panel is NOT visible (e.g., after clicking Keep Hand)
    // This ensures the board isn't blank while waiting for server response
    // Note: Hand cards are already skipped during mulligan in renderPlayerCards()
    // The interactive overlay on the mulligan panel blocks hover events

    const player = this.gameState.players[this.playerId];
    const opponent = Object.values(this.gameState.players).find(p => p.id !== this.playerId);

    console.log('[GameScene] Player:', player ? {
      leader: player.leaderCard?.cardId,
      hand: player.hand.length,
      field: player.field.length,
      life: player.lifeCards.length
    } : 'null');

    console.log('[GameScene] Opponent:', opponent ? {
      leader: opponent.leaderCard?.cardId,
      hand: opponent.hand.length,
      field: opponent.field.length,
      life: opponent.lifeCards.length
    } : 'null');

    if (player) {
      this.renderPlayerCards(player, 'player');
    }

    if (opponent) {
      this.renderPlayerCards(opponent, 'opp');
    }

    console.log('[GameScene] renderGameState complete. Total sprites:', this.cardSprites.size);
  }

  private renderPlayerCards(player: PlayerState, prefix: string) {
    const cardW = this.CARD_WIDTH * this.CARD_SCALE;
    const cardH = this.CARD_HEIGHT * this.CARD_SCALE;
    const gap = 4; // Match zone gap

    // Render leader
    if (player.leaderCard) {
      this.renderCard(player.leaderCard, `${prefix}-leader`);
    }

    // Render life cards (stacked slightly, face-down by default)
    const lifeZone = this.zones.get(`${prefix}-life`);
    if (lifeZone) {
      player.lifeCards.forEach((card, index) => {
        const x = lifeZone.x + cardW / 2 + (index * (cardW + gap));
        const y = lifeZone.y + cardH / 2;
        this.createCardSprite(card, x, y, card.faceUp || false);
      });
    }

    // Render field cards (characters) - 5 slots max
    const fieldZone = this.zones.get(`${prefix}-field`);
    if (fieldZone) {
      player.field.forEach((card, index) => {
        const x = fieldZone.x + cardW / 2 + (index * (cardW + gap));
        const y = fieldZone.y + cardH / 2;
        const sprite = this.createCardSprite(card, x, y, true);

        // Rotate if rested (90 degrees clockwise)
        if (card.state === CardState.RESTED) {
          sprite.setRotation(Phaser.Math.DegToRad(90));
        }
      });
    }

    // Render hand cards (skip during mulligan if panel is visible)
    const handZone = this.zones.get(`${prefix}-hand`);
    const isMulliganPhase = this.gameState?.phase === GamePhase.START_MULLIGAN;
    const mulliganPanelVisible = this.mulliganPanel !== undefined;

    if (handZone && !(isMulliganPhase && mulliganPanelVisible)) {
      const isMyHand = prefix === 'player';
      const handCount = player.hand.length;

      // Center hand cards in the zone
      const totalHandWidth = handCount * (cardW * 0.7); // Overlap cards slightly
      const startX = handZone.x + (handZone.width - totalHandWidth) / 2 + cardW / 2;

      player.hand.forEach((card, index) => {
        const x = startX + (index * cardW * 0.7);
        const y = handZone.y + cardH / 2;
        this.createCardSprite(card, x, y, isMyHand);
      });
    }

    // Render DON!! area with visual stack
    const donZone = this.zones.get(`${prefix}-don`);
    if (donZone) {
      const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;
      const restedDon = player.donField.filter(d => d.state === CardState.RESTED).length;
      const totalDon = activeDon + restedDon;
      const donDeckCount = player.donDeck;

      // Visual DON stack (show up to 3 stacked cards)
      const stackCount = Math.min(totalDon, 3);
      for (let i = 0; i < stackCount; i++) {
        const donSprite = this.add.image(
          donZone.x + donZone.width / 2 + i * 3,
          donZone.y + cardH / 2 + i * 3,
          'don-back'
        ).setDisplaySize(cardW * 0.6, cardH * 0.6);
      }

      // DON count badge
      const badgeX = donZone.x + donZone.width / 2 + 25;
      const badgeY = donZone.y + 15;

      this.add.circle(badgeX, badgeY, 16, 0x000000, 0.85);
      this.add.text(badgeX, badgeY, `${activeDon}`, {
        fontSize: '14px',
        color: '#00ff00',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Small label showing rested/deck
      this.add.text(donZone.x + donZone.width / 2, donZone.y + cardH + 8,
        `${restedDon} rested | ${donDeckCount} deck`, {
        fontSize: '9px',
        color: '#888888'
      }).setOrigin(0.5, 0);
    }

    // Render deck (show stack with count)
    const deckZone = this.zones.get(`${prefix}-deck`);
    if (deckZone && player.deck > 0) {
      // Stack visual
      for (let i = 0; i < Math.min(player.deck, 3); i++) {
        this.add.image(
          deckZone.x + cardW / 2 + i * 2,
          deckZone.y + cardH / 2 + i * 2,
          'card-back'
        ).setDisplaySize(cardW, cardH);
      }

      // Count badge
      this.add.circle(deckZone.x + cardW - 5, deckZone.y + 15, 14, 0x000000, 0.85);
      this.add.text(deckZone.x + cardW - 5, deckZone.y + 15, `${player.deck}`, {
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // Render trash (show top card if exists)
    const trashZone = this.zones.get(`${prefix}-trash`);
    if (trashZone && player.trash && player.trash.length > 0) {
      const topCard = player.trash[player.trash.length - 1];
      this.createCardSprite(topCard, trashZone.x + cardW / 2, trashZone.y + cardH / 2, true);

      // Trash count badge
      this.add.circle(trashZone.x + cardW - 5, trashZone.y + 15, 14, 0x000000, 0.85);
      this.add.text(trashZone.x + cardW - 5, trashZone.y + 15, `${player.trash.length}`, {
        fontSize: '12px',
        color: '#ff6666',
        fontStyle: 'bold'
      }).setOrigin(0.5);
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
    let imageFailed = false;

    if (showPlaceholder) {
      const loadedTexture = this.loadCardImage(card.cardId);
      if (loadedTexture === 'card-back-failed') {
        // Image failed to load (CORS, 404, etc) - use card-back but show placeholder
        texture = 'card-back';
        imageFailed = true;
      } else {
        texture = loadedTexture;
      }
    }

    console.log('[GameScene] createCardSprite:', {
      cardId: card.cardId,
      position: { x, y },
      faceUp,
      texture,
      imageFailed,
      showPlaceholder
    });

    // Calculate the target display size (use explicit dimensions instead of scale)
    const displayWidth = this.CARD_WIDTH * this.CARD_SCALE;
    const displayHeight = this.CARD_HEIGHT * this.CARD_SCALE;

    const sprite = this.add.image(x, y, texture)
      .setDisplaySize(displayWidth, displayHeight)
      .setInteractive({ useHandCursor: true })
      .setData('cardId', card.id)
      .setData('cardDefId', card.cardId)
      .setData('ownerId', card.owner)
      .setData('zone', card.zone)
      .setData('faceUp', faceUp);

    // Make player hand cards draggable
    if (card.zone === CardZone.HAND && card.owner === this.playerId) {
      this.input.setDraggable(sprite);
    }

    this.cardSprites.set(card.id, sprite);

    // Add power/cost overlay for face-up cards
    if (showPlaceholder) {
      const cardData = this.getCardData(card.cardId);

      // If image failed to load, show detailed placeholder and hide the card-back
      if (imageFailed && cardData) {
        sprite.setAlpha(0); // Hide the card-back sprite
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
    console.log('[GameScene] createCardPlaceholder called:', {
      cardId: card.cardId,
      cardName: cardData.name,
      position: { x, y },
      colors: cardData.colors
    });

    const color = this.getColorHex(cardData.colors[0] || 'BLACK');
    const cardWidth = this.CARD_WIDTH * this.CARD_SCALE;
    const cardHeight = this.CARD_HEIGHT * this.CARD_SCALE;

    console.log('[GameScene] Placeholder dimensions:', cardWidth, 'x', cardHeight);

    // Background with color border - fully opaque to cover card-back
    this.add.rectangle(x, y, cardWidth, cardHeight, color, 1)
      .setStrokeStyle(3, color)
      .setDepth(10);

    // Inner background - fully opaque
    this.add.rectangle(x, y, cardWidth - 6, cardHeight - 6, 0x1a1a1a, 1)
      .setDepth(11);

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
    }).setOrigin(0.5).setDepth(12);

    // Card name (wrapped)
    const name = cardData.name.length > 12 ? cardData.name.substring(0, 11) + '...' : cardData.name;
    this.add.text(x, y - 15, name, {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
      wordWrap: { width: cardWidth - 10 },
      align: 'center'
    }).setOrigin(0.5).setDepth(12);

    // Card ID
    this.add.text(x, y + 5, card.cardId, {
      fontSize: '8px',
      color: '#888888'
    }).setOrigin(0.5).setDepth(12);

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
      }).setOrigin(0.5).setDepth(12);
    }

    // Counter value if exists
    if (cardData.counter !== null) {
      this.add.text(x, y + cardHeight / 2 - 28, `+${cardData.counter}`, {
        fontSize: '9px',
        color: '#00ff00'
      }).setOrigin(0.5).setDepth(12);
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

  private onCardHover(gameObject: Phaser.GameObjects.Image, mouseX?: number, mouseY?: number) {
    // Don't show hover effects if mulligan panel is visible
    if (this.mulliganPanel && this.gameState?.phase === GamePhase.START_MULLIGAN) {
      return;
    }

    // Slightly enlarge on hover (1.1x normal size)
    const hoverWidth = this.CARD_WIDTH * this.CARD_SCALE * 1.1;
    const hoverHeight = this.CARD_HEIGHT * this.CARD_SCALE * 1.1;
    gameObject.setDisplaySize(hoverWidth, hoverHeight);

    // Show card preview
    if (this.hoverCard) {
      this.hoverCard.destroy();
    }

    // Check if card is visible to the player
    const ownerId = gameObject.getData('ownerId');
    const faceUp = gameObject.getData('faceUp');
    const zone = gameObject.getData('zone');

    // Card visibility rules:
    // - Life cards: NEVER visible (even to owner) unless explicitly faceUp
    // - Hand cards: Only visible to owner
    // - Field/Leader: Always visible
    // - Other zones: Visible if faceUp
    const isMyCard = ownerId === this.playerId;
    const isLifeCard = zone === CardZone.LIFE;
    const isOnField = zone === CardZone.FIELD || zone === CardZone.LEADER;
    const isInHand = zone === CardZone.HAND;

    // Life cards are hidden from everyone until revealed
    const isCardVisible = isLifeCard ? faceUp : (isMyCard || faceUp || isOnField || (isInHand && isMyCard));

    // Show hidden card preview for opponent's hidden cards
    if (!isCardVisible) {
      this.showHiddenCardPreview(mouseX, mouseY);
      return;
    }

    const { width, height } = this.scale;
    const cardDefId = gameObject.getData('cardDefId');
    const cardData = this.getCardData(cardDefId);

    // Preview dimensions
    const previewWidth = 320;
    const previewHeight = 480;
    const offset = 25;

    // Calculate position near cursor
    let posX = (mouseX || width / 2) + offset;
    let posY = mouseY || height / 2;

    // Keep preview on screen - if it would go off right edge, show on left of cursor
    if (posX + previewWidth / 2 > width) {
      posX = (mouseX || width / 2) - previewWidth / 2 - offset;
    }

    // Keep within vertical bounds
    if (posY - previewHeight / 2 < 10) {
      posY = previewHeight / 2 + 10;
    }
    if (posY + previewHeight / 2 > height - 10) {
      posY = height - previewHeight / 2 - 10;
    }

    // Create preview container near cursor
    this.hoverCard = this.add.container(posX, posY);
    this.hoverCard.setDepth(2000);

    // Background panel
    const bgPanel = this.add.rectangle(0, 0, previewWidth, previewHeight, 0x111122, 0.98)
      .setStrokeStyle(3, cardData ? this.getColorHex(cardData.colors[0] || 'BLACK') : 0x4444ff);
    this.hoverCard.add(bgPanel);

    // Card image (larger preview)
    const texture = this.loadCardImage(cardDefId);
    const cardDisplayWidth = 240;
    const cardDisplayHeight = 336;
    const cardImage = this.add.image(0, -55, texture).setDisplaySize(cardDisplayWidth, cardDisplayHeight);
    this.hoverCard.add(cardImage);

    // Card info below the image
    if (cardData) {
      // Card name
      const nameText = this.add.text(0, 130, cardData.name, {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: previewWidth - 20 },
        align: 'center'
      }).setOrigin(0.5);
      this.hoverCard.add(nameText);

      // Card type and colors
      const typeText = this.add.text(0, 165, `${cardData.type} - ${cardData.colors.join('/')}`, {
        fontSize: '13px',
        color: '#aaaaaa'
      }).setOrigin(0.5);
      this.hoverCard.add(typeText);

      // Stats on one line
      const stats: string[] = [];
      if (cardData.cost !== null) stats.push(`Cost: ${cardData.cost}`);
      if (cardData.power !== null) stats.push(`Power: ${cardData.power}`);
      if (cardData.counter !== null) stats.push(`+${cardData.counter}`);

      const statsText = this.add.text(0, 195, stats.join('  |  '), {
        fontSize: '15px',
        color: '#ffdd44',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.hoverCard.add(statsText);

      // Set code
      const setText = this.add.text(0, 220, cardData.setCode || cardData.id, {
        fontSize: '12px',
        color: '#666666'
      }).setOrigin(0.5);
      this.hoverCard.add(setText);
    }
  }

  /**
   * Update hover preview position as mouse moves
   */
  private updateHoverPreviewPosition(mouseX: number, mouseY: number) {
    if (!this.hoverCard) return;

    const { width, height } = this.scale;
    const previewWidth = 320;
    const previewHeight = 480;
    const offset = 25;

    let posX = mouseX + offset;
    let posY = mouseY;

    // Keep preview on screen
    if (posX + previewWidth / 2 > width) {
      posX = mouseX - previewWidth / 2 - offset;
    }

    if (posY - previewHeight / 2 < 10) {
      posY = previewHeight / 2 + 10;
    }
    if (posY + previewHeight / 2 > height - 10) {
      posY = height - previewHeight / 2 - 10;
    }

    this.hoverCard.setPosition(posX, posY);
  }

  private onCardHoverEnd(gameObject: Phaser.GameObjects.Image) {
    // Restore to normal size
    const normalWidth = this.CARD_WIDTH * this.CARD_SCALE;
    const normalHeight = this.CARD_HEIGHT * this.CARD_SCALE;
    gameObject.setDisplaySize(normalWidth, normalHeight);

    if (this.hoverCard) {
      this.hoverCard.destroy();
      this.hoverCard = undefined;
    }
  }

  /**
   * Show a hidden card preview for opponent's hidden cards
   */
  private showHiddenCardPreview(mouseX?: number, mouseY?: number) {
    const { width, height } = this.scale;

    // Preview dimensions
    const previewWidth = 280;
    const previewHeight = 400;
    const offset = 25;

    // Calculate position near cursor
    let posX = (mouseX || width / 2) + offset;
    let posY = mouseY || height / 2;

    // Keep preview on screen
    if (posX + previewWidth / 2 > width) {
      posX = (mouseX || width / 2) - previewWidth / 2 - offset;
    }
    if (posY - previewHeight / 2 < 10) {
      posY = previewHeight / 2 + 10;
    }
    if (posY + previewHeight / 2 > height - 10) {
      posY = height - previewHeight / 2 - 10;
    }

    this.hoverCard = this.add.container(posX, posY);
    this.hoverCard.setDepth(2000);

    // Background panel
    const bgPanel = this.add.rectangle(0, 0, previewWidth, previewHeight, 0x111122, 0.98)
      .setStrokeStyle(3, 0x666666);
    this.hoverCard.add(bgPanel);

    // Show card back image
    const cardBack = this.add.image(0, -50, 'card-back')
      .setDisplaySize(200, 280);
    this.hoverCard.add(cardBack);

    // "Hidden Card" text
    const hiddenText = this.add.text(0, 130, 'Hidden Card', {
      fontSize: '18px',
      color: '#888888',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5);
    this.hoverCard.add(hiddenText);

    const infoText = this.add.text(0, 160, 'Card details not visible', {
      fontSize: '12px',
      color: '#555555',
      align: 'center'
    }).setOrigin(0.5);
    this.hoverCard.add(infoText);
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
          this.playSound('cardPlay');
          this.events.emit('playCard', { cardId, zone: CardZone.FIELD });
        }
      }
    });

    // Reset card position if not played
    this.renderGameState();
  }

  private onAttackClick() {
    if (this.selectedCard) {
      this.playSound('attack');
      this.events.emit('declareAttack', { attackerId: this.selectedCard });
    }
  }

  private onEndTurnClick() {
    this.playSound('click');
    this.events.emit('endTurn');
  }

  private onPassClick() {
    this.playSound('click');
    this.events.emit('pass');
  }

  // ==================== COUNTER STEP UI ====================

  /**
   * Show the counter step panel when in COUNTER_STEP phase
   */
  private showCounterStepUI() {
    if (this.counterPanel) {
      this.hideCounterStepUI();
    }

    const { width, height } = this.scale;
    const combat = this.gameState?.currentCombat;
    if (!combat || !this.playerId) return;

    // Get player's hand cards with counter values
    const player = this.gameState?.players[this.playerId];
    if (!player) return;

    const counterCards = player.hand.filter(card => {
      const cardData = this.getCardData(card.cardId);
      return cardData && cardData.counter !== null && cardData.counter > 0;
    });

    // Create panel container
    this.counterPanel = this.add.container(width / 2, height / 2);
    this.counterPanel.setDepth(4000);

    // Background overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    overlay.setInteractive(); // Block clicks behind panel
    this.counterPanel.add(overlay);

    // Panel background
    const panelWidth = Math.max(500, counterCards.length * 80 + 100);
    const panelHeight = 350;
    const panelBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x1a1a1a, 0.98)
      .setStrokeStyle(3, 0xffd700);
    this.counterPanel.add(panelBg);

    // Title
    const title = this.add.text(0, -panelHeight / 2 + 30, 'COUNTER STEP', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.counterPanel.add(title);

    // Combat info
    const attackPower = combat.attackPower || 0;
    const currentCounter = combat.counterPower || 0;

    const combatInfo = this.add.text(0, -panelHeight / 2 + 60,
      `Attack Power: ${attackPower}  |  Your Counter: ${currentCounter}`, {
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5);
    this.counterPanel.add(combatInfo);

    // Instructions
    const instructions = this.add.text(0, -panelHeight / 2 + 90,
      'Select counter cards to use (click to toggle)', {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.counterPanel.add(instructions);

    // Counter cards display
    this.selectedCounterCards.clear();
    this.counterCardSprites.clear();

    if (counterCards.length === 0) {
      const noCardsText = this.add.text(0, 0, 'No counter cards available', {
        fontSize: '18px',
        color: '#ff6666'
      }).setOrigin(0.5);
      this.counterPanel.add(noCardsText);
    } else {
      const startX = -((counterCards.length - 1) * 75) / 2;

      counterCards.forEach((card, index) => {
        const x = startX + index * 75;
        const y = -20;

        // Card sprite (slightly smaller for counter panel)
        const texture = this.loadCardImage(card.cardId);
        const cardSprite = this.add.image(x, y, texture)
          .setDisplaySize(this.CARD_WIDTH, this.CARD_HEIGHT)
          .setInteractive({ useHandCursor: true })
          .setData('cardId', card.id);

        cardSprite.on('pointerdown', () => this.toggleCounterCard(card.id));
        cardSprite.on('pointerover', () => {
          if (!this.selectedCounterCards.has(card.id)) {
            cardSprite.setTint(0xaaaaff);
          }
        });
        cardSprite.on('pointerout', () => {
          if (!this.selectedCounterCards.has(card.id)) {
            cardSprite.clearTint();
          }
        });

        this.counterPanel!.add(cardSprite);
        this.counterCardSprites.set(card.id, cardSprite);

        // Counter value label
        const cardData = this.getCardData(card.cardId);
        if (cardData) {
          const counterLabel = this.add.text(x, y + 55, `+${cardData.counter}`, {
            fontSize: '14px',
            color: '#00ff00',
            fontStyle: 'bold',
            backgroundColor: '#000000'
          }).setOrigin(0.5);
          this.counterPanel!.add(counterLabel);
        }
      });
    }

    // Selected counter total
    const totalText = this.add.text(0, panelHeight / 2 - 90, 'Selected Counter: +0', {
      fontSize: '18px',
      color: '#00ff00',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    totalText.setData('type', 'counterTotal');
    this.counterPanel.add(totalText);

    // Buttons
    const buttonY = panelHeight / 2 - 40;

    // Use Counter button
    const useBtn = this.add.rectangle(-80, buttonY, 140, 45, 0x228B22)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.confirmUseCounter())
      .on('pointerover', () => useBtn.setFillStyle(0x2E8B2E))
      .on('pointerout', () => useBtn.setFillStyle(0x228B22));
    const useBtnText = this.add.text(-80, buttonY, 'USE COUNTER', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.counterPanel.add(useBtn);
    this.counterPanel.add(useBtnText);

    // Pass button
    const passBtn = this.add.rectangle(80, buttonY, 140, 45, 0x8B0000)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.passCounter())
      .on('pointerover', () => passBtn.setFillStyle(0xA00000))
      .on('pointerout', () => passBtn.setFillStyle(0x8B0000));
    const passBtnText = this.add.text(80, buttonY, 'PASS', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.counterPanel.add(passBtn);
    this.counterPanel.add(passBtnText);

    // Animate panel appearance
    this.counterPanel.setScale(0.8);
    this.counterPanel.setAlpha(0);
    this.tweens.add({
      targets: this.counterPanel,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });
  }

  /**
   * Toggle selection of a counter card
   */
  private toggleCounterCard(cardId: string) {
    const sprite = this.counterCardSprites.get(cardId);
    if (!sprite) return;

    if (this.selectedCounterCards.has(cardId)) {
      this.selectedCounterCards.delete(cardId);
      sprite.clearTint();
      sprite.setDisplaySize(this.CARD_WIDTH, this.CARD_HEIGHT);
    } else {
      this.selectedCounterCards.add(cardId);
      sprite.setTint(0x00ff00);
      sprite.setDisplaySize(this.CARD_WIDTH * 1.1, this.CARD_HEIGHT * 1.1);
    }

    this.updateCounterTotal();
  }

  /**
   * Update the displayed total counter power
   */
  private updateCounterTotal() {
    if (!this.counterPanel) return;

    let total = 0;
    this.selectedCounterCards.forEach(cardId => {
      // Find the card in player's hand
      const player = this.gameState?.players[this.playerId!];
      const card = player?.hand.find(c => c.id === cardId);
      if (card) {
        const cardData = this.getCardData(card.cardId);
        if (cardData && cardData.counter) {
          total += cardData.counter;
        }
      }
    });

    // Update total text
    this.counterPanel.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Text && child.getData('type') === 'counterTotal') {
        child.setText(`Selected Counter: +${total}`);
      }
    });
  }

  /**
   * Confirm using selected counter cards
   */
  private confirmUseCounter() {
    const cardIds = Array.from(this.selectedCounterCards);
    this.playSound('counter');
    this.events.emit('useCounter', { cardIds });
    this.hideCounterStepUI();
  }

  /**
   * Pass on using counters
   */
  private passCounter() {
    this.events.emit('passCounter');
    this.hideCounterStepUI();
  }

  /**
   * Hide the counter step UI
   */
  private hideCounterStepUI() {
    if (this.counterPanel) {
      this.counterPanel.destroy();
      this.counterPanel = undefined;
    }
    this.selectedCounterCards.clear();
    this.counterCardSprites.clear();
  }

  /**
   * Check if counter step UI should be shown based on game state
   */
  private checkCounterStepUI() {
    if (!this.gameState || !this.playerId) return;

    const isCounterStep = this.gameState.phase === 'COUNTER_STEP';
    const combat = this.gameState.currentCombat;

    // Show counter UI if:
    // - We're in counter step
    // - There's active combat
    // - We are the defender (not the attacker's owner)
    if (isCounterStep && combat) {
      // Find who owns the attacker
      let attackerOwner: string | undefined;
      for (const player of Object.values(this.gameState.players)) {
        const attackerInField = player.field.find(c => c.id === combat.attackerId);
        const attackerIsLeader = player.leaderCard?.id === combat.attackerId;
        if (attackerInField || attackerIsLeader) {
          attackerOwner = player.id;
          break;
        }
      }

      // Show panel if we're the defender
      if (attackerOwner && attackerOwner !== this.playerId) {
        if (!this.counterPanel) {
          this.showCounterStepUI();
        }
      }
    } else {
      this.hideCounterStepUI();
    }

    // Check trigger step
    this.checkTriggerStepUI();
  }

  // ==================== TRIGGER STEP UI ====================

  /**
   * Check if trigger step UI should be shown
   */
  private checkTriggerStepUI() {
    if (!this.gameState || !this.playerId) return;

    const isTriggerStep = this.gameState.phase === 'TRIGGER_STEP';

    if (isTriggerStep) {
      // Check if player has pending trigger effects
      const player = this.gameState.players[this.playerId];
      if (player && !this.triggerPanel) {
        // Find the most recently revealed life card (the one that was just added to hand)
        const recentLifeCard = this.findRecentTriggerCard(player);
        if (recentLifeCard) {
          this.showTriggerStepUI(recentLifeCard);
        }
      }
    } else {
      this.hideTriggerStepUI();
    }
  }

  /**
   * Find a card that was recently moved from life to hand with a trigger effect
   */
  private findRecentTriggerCard(player: PlayerState): GameCard | null {
    // Look for cards in hand that have trigger effects
    for (const card of player.hand) {
      const cardData = this.getCardData(card.cardId);
      if (cardData) {
        // Check if card has trigger-type effect (simplified check)
        // In a full implementation, this would check the card's effects array
        // For now, we assume any card that just moved to hand during trigger step has a trigger
        if (card.faceUp === true) {
          return card;
        }
      }
    }
    return null;
  }

  /**
   * Show the trigger step UI panel
   */
  private showTriggerStepUI(triggerCard: GameCard) {
    if (this.triggerPanel) {
      this.hideTriggerStepUI();
    }

    const { width, height } = this.scale;
    const cardData = this.getCardData(triggerCard.cardId);
    if (!cardData) return;

    // Create panel container
    this.triggerPanel = this.add.container(width / 2, height / 2);
    this.triggerPanel.setDepth(4000);

    // Background overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    overlay.setInteractive(); // Block clicks behind panel
    this.triggerPanel.add(overlay);

    // Panel background
    const panelWidth = 450;
    const panelHeight = 400;
    const panelBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x1a1a1a, 0.98)
      .setStrokeStyle(3, 0xff6600);
    this.triggerPanel.add(panelBg);

    // Title
    const title = this.add.text(0, -panelHeight / 2 + 30, 'TRIGGER EFFECT!', {
      fontSize: '24px',
      color: '#ff6600',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.triggerPanel.add(title);

    // Subtitle
    const subtitle = this.add.text(0, -panelHeight / 2 + 60, 'A life card with a trigger effect was revealed', {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.triggerPanel.add(subtitle);

    // Card display (larger for trigger panel - about 1.5x normal)
    const texture = this.loadCardImage(triggerCard.cardId);
    const triggerCardWidth = this.CARD_WIDTH * 1.5;
    const triggerCardHeight = this.CARD_HEIGHT * 1.5;
    const cardImage = this.add.image(0, -30, texture).setDisplaySize(triggerCardWidth, triggerCardHeight);
    this.triggerPanel.add(cardImage);

    // Card name
    const cardName = this.add.text(0, panelHeight / 2 - 130, cardData.name, {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.triggerPanel.add(cardName);

    // Trigger effect description (simplified)
    const effectText = this.add.text(0, panelHeight / 2 - 100,
      'This card has a [Trigger] effect.\nActivate it?', {
      fontSize: '14px',
      color: '#cccccc',
      align: 'center'
    }).setOrigin(0.5);
    this.triggerPanel.add(effectText);

    // Buttons
    const buttonY = panelHeight / 2 - 40;

    // Activate button
    const activateBtn = this.add.rectangle(-80, buttonY, 140, 45, 0xCC5500)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.activateTrigger(triggerCard.id))
      .on('pointerover', () => activateBtn.setFillStyle(0xDD6600))
      .on('pointerout', () => activateBtn.setFillStyle(0xCC5500));
    const activateBtnText = this.add.text(-80, buttonY, 'ACTIVATE', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.triggerPanel.add(activateBtn);
    this.triggerPanel.add(activateBtnText);

    // Pass button
    const passBtn = this.add.rectangle(80, buttonY, 140, 45, 0x555555)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.passTrigger())
      .on('pointerover', () => passBtn.setFillStyle(0x666666))
      .on('pointerout', () => passBtn.setFillStyle(0x555555));
    const passBtnText = this.add.text(80, buttonY, 'SKIP', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.triggerPanel.add(passBtn);
    this.triggerPanel.add(passBtnText);

    // Animate panel appearance
    this.triggerPanel.setScale(0.8);
    this.triggerPanel.setAlpha(0);
    this.tweens.add({
      targets: this.triggerPanel,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });
  }

  /**
   * Activate the trigger effect
   */
  private activateTrigger(cardId: string) {
    this.events.emit('activateTrigger', { cardId });
    this.hideTriggerStepUI();
  }

  /**
   * Pass on the trigger effect
   */
  private passTrigger() {
    this.events.emit('passTrigger');
    this.hideTriggerStepUI();
  }

  /**
   * Hide the trigger step UI
   */
  private hideTriggerStepUI() {
    if (this.triggerPanel) {
      this.triggerPanel.destroy();
      this.triggerPanel = undefined;
    }
  }

  // ==================== MULLIGAN UI ====================

  /**
   * Check if mulligan UI should be shown
   */
  private checkMulliganUI() {
    if (!this.gameState || !this.playerId) return;

    const isMulliganPhase = this.gameState.phase === GamePhase.START_MULLIGAN;

    if (isMulliganPhase) {
      // Only create mulligan panel if:
      // 1. Panel doesn't exist AND
      // 2. Player hasn't already made their mulligan decision
      // This prevents panel from reappearing while waiting for opponent
      if (!this.mulliganPanel && !this.mulliganDecisionMade) {
        this.showMulliganUI();
      }
    } else {
      // Transitioning out of mulligan phase - reset the flag for next game
      this.mulliganDecisionMade = false;
      this.hideMulliganUI();
    }
  }

  /**
   * Show the mulligan UI panel
   */
  private showMulliganUI() {
    if (!this.gameState || !this.playerId) return;

    // Don't create a new panel if one already exists
    if (this.mulliganPanel) {
      console.log('[GameScene] Mulligan panel already exists, skipping creation');
      return;
    }

    const { width, height } = this.scale;
    const player = this.gameState.players[this.playerId];
    if (!player) return;

    console.log('[GameScene] Creating mulligan panel with', player.hand.length, 'cards');

    // Create container
    this.mulliganPanel = this.add.container(width / 2, height / 2);
    this.mulliganPanel.setDepth(5000);

    // Semi-transparent overlay (interactive to block clicks on cards behind)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setInteractive();
    this.mulliganPanel.add(overlay);

    // Panel background - sized to fit cards with minimal padding
    const mulliganCardScale = 2.2;
    const cardSpacing = 125; // Tighter spacing between cards
    const displayWidth = this.CARD_WIDTH * mulliganCardScale;   // ~139px
    const displayHeight = this.CARD_HEIGHT * mulliganCardScale; // ~194px

    const panelWidth = Math.max(650, (player.hand.length * cardSpacing) + 60);
    const panelHeight = 360;
    const panelBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x222233, 0.95)
      .setStrokeStyle(3, 0x4444ff);
    this.mulliganPanel.add(panelBg);

    // Title
    const title = this.add.text(0, -panelHeight / 2 + 28, 'MULLIGAN PHASE', {
      fontSize: '26px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.mulliganPanel.add(title);

    // Instructions - single line
    const instructions = this.add.text(0, -panelHeight / 2 + 58,
      'Hover over cards to see details. Keep this hand or mulligan once for a new hand.', {
      fontSize: '14px',
      color: '#aaaaaa',
      align: 'center'
    }).setOrigin(0.5);
    this.mulliganPanel.add(instructions);

    // Display hand cards - larger scale for better visibility
    const cardStartX = -(player.hand.length - 1) * (cardSpacing / 2);
    const cardY = 10;

    player.hand.forEach((card, index) => {
      const x = cardStartX + index * cardSpacing;
      const cardData = this.cardDataMap.get(card.cardId);

      // Use card texture if loaded, otherwise card-back
      const textureKey = `card-${card.cardId}`;
      let texture = 'card-back';
      if (this.loadedTextures.has(textureKey)) {
        texture = textureKey;
      } else {
        // Try to load the image if not already loaded
        this.loadCardImage(card.cardId);
      }

      const cardSprite = this.add.image(x, cardY, texture)
        .setDisplaySize(displayWidth, displayHeight)
        .setInteractive({ useHandCursor: true })
        .setData('cardId', card.id)
        .setData('cardDefId', card.cardId)
        .setData('ownerId', card.owner)
        .setData('zone', card.zone)
        .setData('faceUp', true)
        .setData('isMulliganCard', true)
        .setData('baseWidth', displayWidth)
        .setData('baseHeight', displayHeight);

      // Add hover effects for mulligan cards
      cardSprite.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        // Enlarge card slightly on hover
        cardSprite.setDisplaySize(displayWidth * 1.1, displayHeight * 1.1);
        cardSprite.setDepth(100);
        // Show card preview near cursor
        this.showMulliganCardPreview(card.cardId, cardData, pointer.x, pointer.y);
      });

      cardSprite.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        // Update preview position as mouse moves
        this.updateMulliganPreviewPosition(pointer.x, pointer.y);
      });

      cardSprite.on('pointerout', () => {
        // Restore original size
        cardSprite.setDisplaySize(displayWidth, displayHeight);
        cardSprite.setDepth(0);
        // Hide preview
        this.hideMulliganCardPreview();
      });

      this.mulliganPanel!.add(cardSprite);

      // Show card name above the card (so it doesn't get covered by buttons)
      if (cardData) {
        const nameText = this.add.text(x, cardY - displayHeight / 2 + 12, cardData.name, {
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 120 }
        }).setOrigin(0.5, 1); // Origin at bottom center so text grows upward
        this.mulliganPanel!.add(nameText);
      }
    });

    // Button Y position
    const buttonY = panelHeight / 2 - 50;

    // Keep Hand button
    const keepBtn = this.add.rectangle(-100, buttonY, 150, 45, 0x00aa00)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.confirmKeepHand())
      .on('pointerover', () => keepBtn.setFillStyle(0x00cc00))
      .on('pointerout', () => keepBtn.setFillStyle(0x00aa00));
    const keepBtnText = this.add.text(-100, buttonY, 'KEEP HAND', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.mulliganPanel.add(keepBtn);
    this.mulliganPanel.add(keepBtnText);

    // Mulligan button
    const mulliganBtn = this.add.rectangle(100, buttonY, 150, 45, 0xaa6600)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.performMulligan())
      .on('pointerover', () => mulliganBtn.setFillStyle(0xcc8800))
      .on('pointerout', () => mulliganBtn.setFillStyle(0xaa6600));
    const mulliganBtnText = this.add.text(100, buttonY, 'MULLIGAN', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.mulliganPanel.add(mulliganBtn);
    this.mulliganPanel.add(mulliganBtnText);

    // Animate panel appearance
    this.mulliganPanel.setScale(0.8);
    this.mulliganPanel.setAlpha(0);
    this.tweens.add({
      targets: this.mulliganPanel,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Power2'
    });
  }

  /**
   * Confirm keeping the current hand
   */
  private confirmKeepHand() {
    this.mulliganDecisionMade = true; // Prevent panel from reappearing while waiting for opponent
    this.events.emit('keepHand');
    this.hideMulliganUI();
  }

  /**
   * Perform mulligan - request new hand
   */
  private performMulligan() {
    this.mulliganDecisionMade = true; // Prevent panel from reappearing while waiting for opponent
    this.events.emit('mulligan');
    this.hideMulliganUI();
  }

  /**
   * Hide the mulligan UI
   */
  private hideMulliganUI() {
    if (this.mulliganPanel) {
      this.mulliganPanel.destroy();
      this.mulliganPanel = undefined;
      // Re-render to show hand cards now that panel is hidden
      this.scheduleRender();
    }
    // Also hide any active preview
    this.hideMulliganCardPreview();
  }

  /**
   * Show card preview during mulligan phase - positioned near cursor like deck builder
   */
  private showMulliganCardPreview(cardDefId: string, cardData?: CardData, mouseX?: number, mouseY?: number) {
    // Clean up existing preview
    this.hideMulliganCardPreview();

    const { width, height } = this.scale;

    // Calculate position near cursor - larger preview
    const previewWidth = 320;
    const previewHeight = 480;
    const offset = 25;

    let posX = (mouseX || width / 2) + offset;
    let posY = mouseY || height / 2;

    // Keep preview on screen - if it would go off right edge, show on left of cursor
    if (posX + previewWidth / 2 > width) {
      posX = (mouseX || width / 2) - previewWidth / 2 - offset;
    }

    // Keep within vertical bounds
    if (posY - previewHeight / 2 < 10) {
      posY = previewHeight / 2 + 10;
    }
    if (posY + previewHeight / 2 > height - 10) {
      posY = height - previewHeight / 2 - 10;
    }

    // Create preview container
    this.mulliganPreview = this.add.container(posX, posY);
    this.mulliganPreview.setDepth(6000); // Above mulligan panel

    // Background panel
    const bgPanel = this.add.rectangle(0, 0, previewWidth, previewHeight, 0x111122, 0.98)
      .setStrokeStyle(3, cardData ? this.getColorHex(cardData.colors[0] || 'BLACK') : 0x4444ff);
    this.mulliganPreview.add(bgPanel);

    // Card image - larger preview size
    const texture = this.loadCardImage(cardDefId);
    const cardDisplayWidth = 240;
    const cardDisplayHeight = 336;
    const cardImage = this.add.image(0, -55, texture).setDisplaySize(cardDisplayWidth, cardDisplayHeight);
    this.mulliganPreview.add(cardImage);

    // Card info below the image
    if (cardData) {
      // Card name
      const nameText = this.add.text(0, 130, cardData.name, {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: previewWidth - 20 },
        align: 'center'
      }).setOrigin(0.5);
      this.mulliganPreview.add(nameText);

      // Card type and colors
      const typeText = this.add.text(0, 165, `${cardData.type} - ${cardData.colors.join('/')}`, {
        fontSize: '13px',
        color: '#aaaaaa'
      }).setOrigin(0.5);
      this.mulliganPreview.add(typeText);

      // Stats on one line
      const stats: string[] = [];
      if (cardData.cost !== null) stats.push(`Cost: ${cardData.cost}`);
      if (cardData.power !== null) stats.push(`Power: ${cardData.power}`);
      if (cardData.counter !== null) stats.push(`+${cardData.counter}`);

      const statsText = this.add.text(0, 195, stats.join('  |  '), {
        fontSize: '15px',
        color: '#ffdd44',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.mulliganPreview.add(statsText);

      // Set code
      const setText = this.add.text(0, 220, cardData.setCode, {
        fontSize: '12px',
        color: '#666666'
      }).setOrigin(0.5);
      this.mulliganPreview.add(setText);
    }
  }

  /**
   * Update mulligan preview position as mouse moves
   */
  private updateMulliganPreviewPosition(mouseX: number, mouseY: number) {
    if (!this.mulliganPreview) return;

    const { width, height } = this.scale;
    const previewWidth = 320;
    const previewHeight = 480;
    const offset = 25;

    let posX = mouseX + offset;
    let posY = mouseY;

    // Keep preview on screen
    if (posX + previewWidth / 2 > width) {
      posX = mouseX - previewWidth / 2 - offset;
    }

    if (posY - previewHeight / 2 < 10) {
      posY = previewHeight / 2 + 10;
    }
    if (posY + previewHeight / 2 > height - 10) {
      posY = height - previewHeight / 2 - 10;
    }

    this.mulliganPreview.setPosition(posX, posY);
  }

  /**
   * Hide mulligan card preview
   */
  private hideMulliganCardPreview() {
    if (this.mulliganPreview) {
      this.mulliganPreview.destroy();
      this.mulliganPreview = undefined;
    }
  }
}
