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

import {
  EffectEngine,
  CardDefinition,
  EffectContext,
  TriggerEvent,
  EffectTrigger,
  PendingEffect,
  StateChange,
} from '../effects';

export class GameStateManager {
  private state: GameState;
  private effectEngine: EffectEngine;
  
  constructor(gameId: string, player1Id: string, player2Id: string) {
    this.state = this.initializeGameState(gameId, player1Id, player2Id);
    this.effectEngine = new EffectEngine();
  }

  // Load card definitions for effect resolution
  public loadCardDefinitions(cards: CardDefinition[]): void {
    this.effectEngine.loadCardDefinitions(cards);
  }

  public getEffectEngine(): EffectEngine {
    return this.effectEngine;
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

    // Check for Rush keyword
    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    if (cardDef && cardDef.keywords.includes('Rush')) {
      if (!card.keywords) card.keywords = [];
      card.keywords.push('Rush');
    }

    // Check for Blocker keyword
    if (cardDef && cardDef.keywords.includes('Blocker')) {
      if (!card.keywords) card.keywords = [];
      card.keywords.push('Blocker');
    }

    if (targetZone === CardZone.FIELD) {
      player.field.push(card);

      // Trigger ON_PLAY effects
      const triggerEvent: TriggerEvent = {
        type: EffectTrigger.ON_PLAY,
        cardId: card.id,
        playerId: playerId,
      };
      this.processTriggers(triggerEvent);
    } else if (targetZone === CardZone.TRASH) {
      player.trash.push(card);
    }

    return true;
  }

  // Process triggered effects
  private processTriggers(event: TriggerEvent): PendingEffect[] {
    const pendingEffects = this.effectEngine.checkTriggers(this.state, event);

    // Add to pending effects for resolution
    pendingEffects.forEach(effect => {
      this.effectEngine.addPendingEffect(effect);
    });

    return pendingEffects;
  }

  // Resolve a pending effect
  public resolveEffect(effectId: string, selectedTargets?: string[]): StateChange[] {
    const pending = this.effectEngine.getPendingEffects().find(e => e.id === effectId);
    if (!pending) return [];

    const player = this.state.players[pending.playerId];
    const card = this.findCard(pending.sourceCardId);
    if (!player || !card) return [];

    const context: EffectContext = {
      gameState: this.state,
      sourceCard: card,
      sourcePlayer: player,
      selectedTargets,
    };

    const result = this.effectEngine.resolveEffect(pending.effect, context);
    this.effectEngine.removePendingEffect(effectId);

    return result.changes;
  }

  // Get pending effects for UI to display
  public getPendingEffects(): PendingEffect[] {
    return this.effectEngine.getPendingEffects();
  }

  // Get valid targets for an effect
  public getValidTargetsForEffect(effectId: string): string[] {
    const pending = this.effectEngine.getPendingEffects().find(e => e.id === effectId);
    if (!pending || !pending.effect.effects[0]?.target) return [];

    const player = this.state.players[pending.playerId];
    const card = this.findCard(pending.sourceCardId);
    if (!player || !card) return [];

    const context: EffectContext = {
      gameState: this.state,
      sourceCard: card,
      sourcePlayer: player,
    };

    return this.effectEngine.getValidTargets(pending.effect.effects[0], context);
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

    // Check if card can attack (Rush check)
    if (attacker.turnPlayed === this.state.turn) {
      // Card was played this turn, needs Rush to attack
      if (!this.effectEngine.canAttackOnPlayTurn(attacker, this.state.turn)) {
        return false;
      }
    }

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

    // Trigger ON_ATTACK effects
    const triggerEvent: TriggerEvent = {
      type: EffectTrigger.ON_ATTACK,
      cardId: attackerId,
      playerId: attacker.owner,
      targetId: targetId,
    };
    this.processTriggers(triggerEvent);

    return true;
  }

  public declareBlocker(blockerId: string): boolean {
    if (!this.state.currentCombat) return false;

    const blocker = this.findCard(blockerId);
    if (!blocker || blocker.state !== CardState.ACTIVE) return false;

    // Check if card can block using effect engine
    if (!this.effectEngine.canBlock(blocker)) return false;

    // Check if attacker is unblockable
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (attacker && this.effectEngine.isUnblockable(attacker)) return false;

    blocker.state = CardState.RESTED;
    this.state.currentCombat.isBlocked = true;
    this.state.currentCombat.targetId = blockerId;
    this.state.currentCombat.targetType = 'character';

    // Trigger ON_BLOCK effects
    const triggerEvent: TriggerEvent = {
      type: EffectTrigger.ON_BLOCK,
      cardId: blockerId,
      playerId: blocker.owner,
    };
    this.processTriggers(triggerEvent);

    return true;
  }

  // Counter Step methods
  public useCounter(playerId: string, cardIds: string[]): boolean {
    if (!this.state.currentCombat) return false;
    if (this.state.phase !== GamePhase.COUNTER_STEP) return false;

    // Player using counter must be the defender (not the attacker's owner)
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker || attacker.owner === playerId) return false;

    const player = this.state.players[playerId];
    if (!player) return false;

    let totalCounterPower = 0;
    const usedCards: GameCard[] = [];

    // Validate and calculate counter power
    for (const cardId of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return false;

      const card = player.hand[cardIndex];
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);

      // Card must have counter value
      if (!cardDef || cardDef.counter === null || cardDef.counter === undefined) {
        return false;
      }

      totalCounterPower += cardDef.counter;
      usedCards.push(card);
    }

    // Remove counter cards from hand and move to trash
    for (const card of usedCards) {
      const cardIndex = player.hand.findIndex(c => c.id === card.id);
      if (cardIndex !== -1) {
        const removedCard = player.hand.splice(cardIndex, 1)[0];
        removedCard.zone = CardZone.TRASH;
        player.trash.push(removedCard);

        // Trigger COUNTER effects for each card used
        const triggerEvent: TriggerEvent = {
          type: EffectTrigger.COUNTER,
          cardId: removedCard.id,
          playerId: playerId,
        };
        this.processTriggers(triggerEvent);
      }
    }

    // Update combat counter power
    this.state.currentCombat.counterPower =
      (this.state.currentCombat.counterPower || 0) + totalCounterPower;

    // Move to blocker step
    this.state.phase = GamePhase.BLOCKER_STEP;

    return true;
  }

  public passCounter(playerId: string): boolean {
    if (!this.state.currentCombat) return false;
    if (this.state.phase !== GamePhase.COUNTER_STEP) return false;

    // Player passing must be the defender
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker || attacker.owner === playerId) return false;

    // Initialize counter power to 0 if not set
    if (this.state.currentCombat.counterPower === undefined) {
      this.state.currentCombat.counterPower = 0;
    }

    // Move to blocker step
    this.state.phase = GamePhase.BLOCKER_STEP;

    return true;
  }

  public passBlocker(playerId: string): boolean {
    if (!this.state.currentCombat) return false;
    if (this.state.phase !== GamePhase.BLOCKER_STEP) return false;

    // Player passing must be the defender
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker || attacker.owner === playerId) return false;

    // Resolve combat since no blocker was selected
    this.resolveCombat();

    return true;
  }

  // Get cards that can be used as counters
  public getAvailableCounterCards(playerId: string): GameCard[] {
    const player = this.state.players[playerId];
    if (!player) return [];

    return player.hand.filter(card => {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      return cardDef && cardDef.counter !== null && cardDef.counter > 0;
    });
  }

  // Get counter value for a specific card
  public getCardCounterValue(cardId: string): number {
    const card = this.findCard(cardId);
    if (!card) return 0;

    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    return cardDef?.counter || 0;
  }

  public resolveCombat(): void {
    if (!this.state.currentCombat) return;

    const { attackerId, targetId, targetType, attackPower, counterPower = 0 } = this.state.currentCombat;
    const attacker = this.findCard(attackerId);

    if (targetType === 'leader') {
      // Damage to leader
      const targetPlayer = this.findCardOwner(targetId!);
      if (targetPlayer) {
        // Check for Double Attack
        let damageMultiplier = 1;
        if (attacker && this.effectEngine.hasDoubleAttack(attacker)) {
          damageMultiplier = 2;
        }

        // Check if attack succeeds
        const leaderPower = targetPlayer.leaderCard?.power || 0;
        if (attackPower >= leaderPower + counterPower) {
          // Deal damage
          this.takeDamage(targetPlayer.id, damageMultiplier, attacker);

          // Trigger HIT_LEADER
          const triggerEvent: TriggerEvent = {
            type: EffectTrigger.HIT_LEADER,
            cardId: attackerId,
            playerId: attacker?.owner,
            targetId: targetId,
          };
          this.processTriggers(triggerEvent);
        }
      }
    } else if (targetType === 'character') {
      // Battle with character
      const target = this.findCard(targetId!);
      if (target) {
        const targetPower = (target.power || 0) + (counterPower || 0);
        if (attackPower >= targetPower) {
          this.koCharacter(targetId!);

          // Trigger ON_KO
          const triggerEvent: TriggerEvent = {
            type: EffectTrigger.ON_KO,
            cardId: targetId,
            playerId: target.owner,
          };
          this.processTriggers(triggerEvent);

          // Also trigger ANY_CHARACTER_KOD
          const anyKOTrigger: TriggerEvent = {
            type: EffectTrigger.ANY_CHARACTER_KOD,
            cardId: targetId,
          };
          this.processTriggers(anyKOTrigger);
        }
      }
    }

    // Trigger AFTER_BATTLE
    const afterBattleTrigger: TriggerEvent = {
      type: EffectTrigger.AFTER_BATTLE,
      cardId: attackerId,
      playerId: attacker?.owner,
    };
    this.processTriggers(afterBattleTrigger);

    this.state.currentCombat = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;
  }

  private takeDamage(playerId: string, damage: number, attacker?: GameCard): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Check if attacker has Banish - cards go to trash instead of hand
    const hasBanish = attacker && this.effectEngine.hasBanish(attacker);

    for (let i = 0; i < damage; i++) {
      if (player.lifeCards.length > 0) {
        const lifeCard = player.lifeCards.pop();
        if (lifeCard) {
          lifeCard.faceUp = true;
          player.life--;

          if (hasBanish) {
            // Banish: card goes to trash
            lifeCard.zone = CardZone.TRASH;
            player.trash.push(lifeCard);
          } else {
            // Normal: card goes to hand
            lifeCard.zone = CardZone.HAND;
            player.hand.push(lifeCard);

            // Check for trigger effect
            if (this.hasTrigger(lifeCard)) {
              // Trigger TRIGGER effect
              const triggerEvent: TriggerEvent = {
                type: EffectTrigger.TRIGGER,
                cardId: lifeCard.id,
                playerId: playerId,
              };
              this.processTriggers(triggerEvent);
              this.state.phase = GamePhase.TRIGGER_STEP;
            }
          }

          // Trigger LIFE_ADDED_TO_HAND
          const lifeEvent: TriggerEvent = {
            type: EffectTrigger.LIFE_ADDED_TO_HAND,
            cardId: lifeCard.id,
            playerId: playerId,
          };
          this.processTriggers(lifeEvent);
        }
      }
    }

    // Check win condition
    if (player.life <= 0) {
      const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
      this.state.winner = opponentId;
      this.state.phase = GamePhase.GAME_OVER;

      // Trigger LIFE_REACHES_ZERO
      const lifeZeroEvent: TriggerEvent = {
        type: EffectTrigger.LIFE_REACHES_ZERO,
        playerId: playerId,
      };
      this.processTriggers(lifeZeroEvent);
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

    // Cleanup expired effects from previous turn
    this.effectEngine.cleanupExpiredEffects(this.state);

    // Untap all cards
    this.untapAll(playerId);

    // Trigger START_OF_TURN effects
    const startTurnEvent: TriggerEvent = {
      type: EffectTrigger.START_OF_TURN,
      playerId: playerId,
    };
    this.processTriggers(startTurnEvent);

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

    // Trigger END_OF_TURN effects
    const endTurnEvent: TriggerEvent = {
      type: EffectTrigger.END_OF_TURN,
      playerId: playerId,
    };
    this.processTriggers(endTurnEvent);

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

  private hasTrigger(card: GameCard): boolean {
    // Check card definition for trigger effect
    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    if (!cardDef) return false;

    // Check if any effect has TRIGGER as its trigger type
    return cardDef.effects.some(e => e.trigger === EffectTrigger.TRIGGER);
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

      case ActionType.USE_COUNTER:
        return this.useCounter(action.playerId, action.data.cardIds || []);

      case ActionType.PASS_COUNTER:
        return this.passCounter(action.playerId);

      case ActionType.SELECT_BLOCKER:
        return this.declareBlocker(action.data.blockerId);

      case ActionType.PASS_PRIORITY:
        // Handle pass blocker during blocker step
        if (this.state.phase === GamePhase.BLOCKER_STEP) {
          return this.passBlocker(action.playerId);
        }
        return false;

      case ActionType.RESOLVE_COMBAT:
        this.resolveCombat();
        return true;

      case ActionType.END_TURN:
        this.endTurn(action.playerId);
        return true;

      case ActionType.TRIGGER_LIFE:
        // Handle trigger effect activation
        if (action.data.effectId) {
          const changes = this.resolveEffect(action.data.effectId, action.data.targets);
          return changes.length > 0;
        }
        // Pass on trigger - continue to next phase
        if (this.state.phase === GamePhase.TRIGGER_STEP) {
          this.state.phase = GamePhase.MAIN_PHASE;
        }
        return true;

      default:
        return false;
    }
  }
}