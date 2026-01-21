import { 
  GameState, 
  GamePhase, 
  PlayerState, 
  GameCard, 
  CardZone, 
  CardState,
  GameAction,
  ActionType,
  DEFAULT_GAME_CONFIG
} from '../types/game';

export class GameStateManager {
  private state: GameState;
  
  constructor(gameId: string, player1Id: string, player2Id: string) {
    this.state = this.initializeGameState(gameId, player1Id, player2Id);
  }

  private initializeGameState(gameId: string, player1Id: string, player2Id: string): GameState {
    return {
      id: gameId,
      phase: GamePhase.START_WAITING,
      turn: 0,
      activePlayerId: '',
      players: {
        [player1Id]: this.initializePlayerState(player1Id),
        [player2Id]: this.initializePlayerState(player2Id)
      },
      stack: [],
      turnHistory: []
    };
  }

  private initializePlayerState(playerId: string): PlayerState {
    return {
      id: playerId,
      username: '',
      leaderId: '',
      life: DEFAULT_GAME_CONFIG.maxLife,
      lifeCards: [],
      hand: [],
      field: [],
      trash: [],
      deck: [],
      donDeck: DEFAULT_GAME_CONFIG.maxDon,
      donField: [],
      isActive: false
    };
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(newState: GameState): void {
    this.state = newState;
  }

  // Game setup methods
  public setupPlayer(playerId: string, username: string, deck: any[]): void {
    const player = this.state.players[playerId];
    if (!player) return;

    player.username = username;
    
    // Find leader card and set it up
    const leaderCard = deck.find(card => card.type === 'LEADER');
    if (leaderCard) {
      player.leaderId = leaderCard.id;
      player.leaderCard = {
        id: `${playerId}-leader`,
        cardId: leaderCard.id,
        zone: CardZone.LEADER,
        state: CardState.ACTIVE,
        owner: playerId,
        power: leaderCard.power
      };
    }

    // Setup deck (excluding leader)
    const deckCards = deck
      .filter(card => card.type !== 'LEADER')
      .map((card, index) => ({
        id: `${playerId}-deck-${index}`,
        cardId: card.id,
        zone: CardZone.DECK,
        state: CardState.ACTIVE,
        owner: playerId,
        position: index
      }));

    player.deck = this.shuffleArray(deckCards);
  }

  public startGame(firstPlayerId: string): void {
    this.state.activePlayerId = firstPlayerId;
    this.state.phase = GamePhase.START_MULLIGAN;
    this.state.turn = 1;

    // Draw initial hands
    Object.keys(this.state.players).forEach(playerId => {
      this.drawCards(playerId, DEFAULT_GAME_CONFIG.startingHand);
      this.setupLife(playerId);
    });
  }

  // Card movement methods
  public drawCards(playerId: string, count: number): GameCard[] {
    const player = this.state.players[playerId];
    if (!player) return [];

    const drawnCards: GameCard[] = [];
    for (let i = 0; i < count; i++) {
      const card = player.deck.shift();
      if (card) {
        card.zone = CardZone.HAND;
        player.hand.push(card);
        drawnCards.push(card);
      }
    }

    return drawnCards;
  }

  private setupLife(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    for (let i = 0; i < DEFAULT_GAME_CONFIG.maxLife; i++) {
      const card = player.deck.shift();
      if (card) {
        card.zone = CardZone.LIFE;
        card.faceUp = false;
        card.position = i;
        player.lifeCards.push(card);
      }
    }
  }

  public playCard(playerId: string, cardId: string, targetZone: CardZone = CardZone.FIELD): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = player.hand.splice(cardIndex, 1)[0];
    card.zone = targetZone;
    card.state = CardState.ACTIVE;
    card.turnPlayed = this.state.turn;

    if (targetZone === CardZone.FIELD) {
      player.field.push(card);
    } else if (targetZone === CardZone.TRASH) {
      player.trash.push(card);
    }

    return true;
  }

  public attachDon(playerId: string, donId: string, targetId: string): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    const donIndex = player.donField.findIndex(d => d.id === donId);
    if (donIndex === -1) return false;

    const don = player.donField[donIndex];
    don.attachedTo = targetId;
    don.state = CardState.ATTACHED;

    return true;
  }

  // Combat methods
  public declareAttack(attackerId: string, targetId: string, targetType: 'leader' | 'character'): boolean {
    const attacker = this.findCard(attackerId);
    if (!attacker || attacker.state !== CardState.ACTIVE) return false;

    // Rest the attacker
    attacker.state = CardState.RESTED;
    attacker.hasAttacked = true;

    // Calculate attack power (base + attached DON!)
    let attackPower = attacker.power || 0;
    const attachedDon = this.getAttachedDon(attackerId);
    attackPower += attachedDon.length * 1000;

    this.state.currentCombat = {
      attackerId,
      targetId,
      targetType,
      attackPower
    };

    this.state.phase = GamePhase.COUNTER_STEP;
    return true;
  }

  public declareBlocker(blockerId: string): boolean {
    if (!this.state.currentCombat) return false;

    const blocker = this.findCard(blockerId);
    if (!blocker || blocker.state !== CardState.ACTIVE) return false;

    // Check if card has blocker keyword
    if (!blocker.keywords?.includes('Blocker')) return false;

    blocker.state = CardState.RESTED;
    this.state.currentCombat.isBlocked = true;
    this.state.currentCombat.targetId = blockerId;
    this.state.currentCombat.targetType = 'character';

    return true;
  }

  public resolveCombat(): void {
    if (!this.state.currentCombat) return;

    const { targetId, targetType, attackPower, counterPower = 0 } = this.state.currentCombat;

    if (targetType === 'leader') {
      // Damage to leader
      const targetPlayer = this.findCardOwner(targetId!);
      if (targetPlayer) {
        const damage = Math.max(0, attackPower - counterPower);
        if (damage > 0) {
          this.takeDamage(targetPlayer.id, damage);
        }
      }
    } else if (targetType === 'character') {
      // Battle with character
      const target = this.findCard(targetId!);
      if (target) {
        const targetPower = (target.power || 0) + (counterPower || 0);
        if (attackPower >= targetPower) {
          this.koCharacter(targetId!);
        }
      }
    }

    this.state.currentCombat = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;
  }

  private takeDamage(playerId: string, damage: number): void {
    const player = this.state.players[playerId];
    if (!player) return;

    for (let i = 0; i < damage; i++) {
      if (player.lifeCards.length > 0) {
        const lifeCard = player.lifeCards.pop();
        if (lifeCard) {
          lifeCard.zone = CardZone.HAND;
          lifeCard.faceUp = true;
          player.hand.push(lifeCard);
          player.life--;

          // Check for trigger
          if (this.hasTriggr(lifeCard)) {
            this.state.phase = GamePhase.TRIGGER_STEP;
            // Handle trigger resolution
          }
        }
      }
    }

    // Check win condition
    if (player.life <= 0) {
      const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
      this.state.winner = opponentId;
      this.state.phase = GamePhase.GAME_OVER;
    }
  }

  private koCharacter(cardId: string): void {
    const card = this.findCard(cardId);
    if (!card) return;

    const player = this.state.players[card.owner];
    if (!player) return;

    const fieldIndex = player.field.findIndex(c => c.id === cardId);
    if (fieldIndex !== -1) {
      const koCard = player.field.splice(fieldIndex, 1)[0];
      koCard.zone = CardZone.TRASH;
      player.trash.push(koCard);

      // Detach any DON! attached to this card
      player.donField.forEach(don => {
        if (don.attachedTo === cardId) {
          don.attachedTo = undefined;
          don.state = CardState.ACTIVE;
        }
      });
    }
  }

  // Turn management
  public startTurn(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    this.state.activePlayerId = playerId;
    this.state.turn++;
    this.state.phase = GamePhase.UNTAP_PHASE;
    player.isActive = true;

    // Untap all cards
    this.untapAll(playerId);

    // Move to draw phase
    this.state.phase = GamePhase.DRAW_PHASE;
    this.drawCards(playerId, 1);

    // Add DON!
    this.state.phase = GamePhase.DON_PHASE;
    const donCount = Math.min(DEFAULT_GAME_CONFIG.donPerTurn, player.donDeck);
    for (let i = 0; i < donCount; i++) {
      player.donDeck--;
      player.donField.push({
        id: `${playerId}-don-${Date.now()}-${i}`,
        cardId: 'DON',
        zone: CardZone.DON_FIELD,
        state: CardState.ACTIVE,
        owner: playerId
      });
    }

    this.state.phase = GamePhase.MAIN_PHASE;
  }

  public endTurn(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    player.isActive = false;
    this.state.phase = GamePhase.END_PHASE;

    // Find next player
    const nextPlayerId = Object.keys(this.state.players).find(id => id !== playerId);
    if (nextPlayerId) {
      this.startTurn(nextPlayerId);
    }
  }

  private untapAll(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Untap leader
    if (player.leaderCard) {
      player.leaderCard.state = CardState.ACTIVE;
    }

    // Untap all field cards
    player.field.forEach(card => {
      if (card.state === CardState.RESTED) {
        card.state = CardState.ACTIVE;
        card.hasAttacked = false;
      }
    });

    // Untap DON!
    player.donField.forEach(don => {
      if (don.state === CardState.RESTED && !don.attachedTo) {
        don.state = CardState.ACTIVE;
      }
    });
  }

  // Helper methods
  private findCard(cardId: string): GameCard | undefined {
    for (const player of Object.values(this.state.players)) {
      // Check all zones
      const allCards = [
        ...player.hand,
        ...player.field,
        ...player.trash,
        ...player.deck,
        ...player.lifeCards,
        ...player.donField,
        player.leaderCard
      ].filter(Boolean) as GameCard[];

      const card = allCards.find(c => c.id === cardId);
      if (card) return card;
    }
    return undefined;
  }

  private findCardOwner(cardId: string): PlayerState | undefined {
    for (const player of Object.values(this.state.players)) {
      const allCards = [
        ...player.hand,
        ...player.field,
        ...player.trash,
        ...player.deck,
        ...player.lifeCards,
        ...player.donField,
        player.leaderCard
      ].filter(Boolean) as GameCard[];

      if (allCards.some(c => c.id === cardId)) {
        return player;
      }
    }
    return undefined;
  }

  private getAttachedDon(cardId: string): GameCard[] {
    const owner = this.findCardOwner(cardId);
    if (!owner) return [];

    return owner.donField.filter(don => don.attachedTo === cardId);
  }

  private hasTriggr(_card: GameCard): boolean {
    // TODO: Check card definition for trigger keyword
    return false;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Process game action
  public processAction(action: GameAction): boolean {
    switch (action.type) {
      case ActionType.PLAY_CARD:
        return this.playCard(action.playerId, action.data.cardId, action.data.zone);
      
      case ActionType.ATTACH_DON:
        return this.attachDon(action.playerId, action.data.donId, action.data.targetId);
      
      case ActionType.DECLARE_ATTACK:
        return this.declareAttack(action.data.attackerId, action.data.targetId, action.data.targetType);
      
      case ActionType.SELECT_BLOCKER:
        return this.declareBlocker(action.data.blockerId);
      
      case ActionType.RESOLVE_COMBAT:
        this.resolveCombat();
        return true;
      
      case ActionType.END_TURN:
        this.endTurn(action.playerId);
        return true;
      
      default:
        return false;
    }
  }
}