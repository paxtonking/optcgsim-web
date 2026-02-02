import {
  GameState,
  GamePhase,
  PlayerState,
  GameCard,
  CardZone,
  CardState,
  GameAction,
  ActionType,
  DEFAULT_GAME_CONFIG,
  PendingPreGameEffect,
  PendingActivateEffect,
  PendingEventEffect,
  PendingCounterEffect,
  PendingAdditionalCost,
  PendingDeckRevealEffect,
  PendingHandSelectEffect,
} from '../types/game';

import {
  EffectEngine,
  CardDefinition,
  EffectContext,
  TriggerEvent,
  EffectTrigger,
  PendingEffect,
  StateChange,
  EffectType,
  CardEffectDefinition,
  EffectAction,
  TargetType,
  parseLeaderRestrictions,
  ConditionType,
  extractSearchAndSelectDetails,
} from '../effects';

export class GameStateManager {
  private state: GameState;
  private effectEngine: EffectEngine;
  private mulliganConfirmed: Set<string> = new Set();
  private mulliganUsed: Set<string> = new Set();

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
      maxLife: DEFAULT_GAME_CONFIG.maxLife,  // Will be updated in setupLife based on leader
      lifeCards: [],
      hand: [],
      field: [],
      trash: [],
      deck: [],
      donDeck: DEFAULT_GAME_CONFIG.maxDon,
      donField: [],
      stage: null,
      isActive: false,
      turnCount: 0  // Start at 0 so after first startTurn increment it becomes 1
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
        position: index,
        power: card.power,
        cost: card.cost
      }));

    player.deck = this.shuffleArray(deckCards);
  }

  public startGame(firstPlayerId: string): void {
    this.state.activePlayerId = firstPlayerId;
    this.state.firstPlayerId = firstPlayerId;  // Track who goes first (cannot attack on turn 1)
    this.state.turn = 1;

    // Reset mulligan confirmations
    this.mulliganConfirmed.clear();

    // Check for pre-game abilities FIRST (before any drawing)
    // This ensures cards like Mary Geoise stages are still in deck for Imu's ability
    const preGameEffects = this.checkPreGameAbilities();

    if (preGameEffects.length > 0) {
      // There are pre-game abilities to resolve - do NOT draw cards yet
      this.state.phase = GamePhase.PRE_GAME_SETUP;
      this.state.pendingPreGameEffects = preGameEffects;
    } else {
      // No pre-game abilities - draw cards and setup life now, then proceed to mulligan
      this.drawInitialCardsAndLife();
      this.state.phase = GamePhase.START_MULLIGAN;
    }
  }

  /**
   * Draw initial hands and setup life for all players
   * Called either immediately (no pre-game abilities) or after pre-game effects resolve
   */
  private drawInitialCardsAndLife(): void {
    Object.keys(this.state.players).forEach(playerId => {
      this.drawCards(playerId, DEFAULT_GAME_CONFIG.startingHand);
      this.setupLife(playerId);
    });
  }

  /**
   * Check for pre-game abilities (start-of-game effects)
   * Returns list of pending effects for players with such abilities
   */
  private checkPreGameAbilities(): PendingPreGameEffect[] {
    const effects: PendingPreGameEffect[] = [];

    for (const playerId of Object.keys(this.state.players)) {
      const player = this.state.players[playerId];
      const leaderDef = this.effectEngine.getCardDefinition(player.leaderId);

      console.log(`[checkPreGameAbilities] Player ${playerId} leader: ${player.leaderId}`);
      console.log(`[checkPreGameAbilities] LeaderDef found: ${!!leaderDef}`);

      if (!leaderDef) continue;

      // Use the raw effect text for parsing start-of-game abilities
      const effectText = leaderDef.effectText || '';
      console.log(`[checkPreGameAbilities] Leader effectText: "${effectText.substring(0, 100)}..."`);

      const { startOfGame } = parseLeaderRestrictions(effectText);
      console.log(`[checkPreGameAbilities] startOfGame ability found: ${!!startOfGame}`);

      if (startOfGame) {
        // Find valid cards in deck that match the criteria
        const validCardIds: string[] = [];

        for (const card of player.deck) {
          const cardDef = this.effectEngine.getCardDefinition(card.cardId);
          if (!cardDef) continue;

          // Check if card type matches
          if (cardDef.type !== startOfGame.cardType) continue;

          // Check if card has the required trait
          const traits = cardDef.traits || [];
          if (!traits.some(t => t.toLowerCase().includes(startOfGame.trait.toLowerCase()))) {
            continue;
          }

          validCardIds.push(card.id);
        }

        if (validCardIds.length > 0 || startOfGame.optional) {
          effects.push({
            playerId,
            trait: startOfGame.trait,
            cardType: startOfGame.cardType,
            count: startOfGame.count,
            optional: startOfGame.optional,
            description: startOfGame.description,
            validCardIds,
          });
        }
      }
    }

    return effects;
  }

  /**
   * Handle pre-game card selection (e.g., Imu selecting a Mary Geoise stage)
   */
  public handlePreGameSelect(playerId: string, cardId: string | null): boolean {
    if (this.state.phase !== GamePhase.PRE_GAME_SETUP) {
      return false;
    }

    const pendingEffects = this.state.pendingPreGameEffects || [];
    const effectIndex = pendingEffects.findIndex(e => e.playerId === playerId);

    if (effectIndex === -1) {
      return false;
    }

    const effect = pendingEffects[effectIndex];

    if (cardId) {
      // Player selected a card to play
      if (!effect.validCardIds.includes(cardId)) {
        return false; // Invalid card selection
      }

      // Find the card in deck and play it
      const player = this.state.players[playerId];
      const cardIndex = player.deck.findIndex(c => c.id === cardId);

      if (cardIndex === -1) {
        return false;
      }

      const card = player.deck[cardIndex];

      // Move card from deck to appropriate zone
      player.deck.splice(cardIndex, 1);

      if (effect.cardType === 'STAGE') {
        card.zone = CardZone.STAGE;
        player.stage = card;
      } else if (effect.cardType === 'CHARACTER') {
        card.zone = CardZone.FIELD;
        player.field.push(card);
      }
      // Note: EVENT cards would typically be played but this is unusual for start-of-game

    } else if (!effect.optional) {
      // Player tried to skip a non-optional effect
      return false;
    }

    // Remove this effect from pending list
    pendingEffects.splice(effectIndex, 1);

    // Check if all pre-game effects are resolved
    if (pendingEffects.length === 0) {
      this.state.pendingPreGameEffects = undefined;

      // NOW draw initial hands and setup life (after all pre-game effects resolve)
      this.drawInitialCardsAndLife();

      this.state.phase = GamePhase.START_MULLIGAN;
    }

    return true;
  }

  /**
   * Skip a pre-game effect (only valid for optional effects)
   */
  public skipPreGameEffect(playerId: string): boolean {
    return this.handlePreGameSelect(playerId, null);
  }

  /**
   * Confirm keeping hand (skip mulligan)
   * When both players confirm, move to MAIN_PHASE
   */
  public confirmKeepHand(playerId: string): boolean {
    if (this.state.phase !== GamePhase.START_MULLIGAN) {
      return false;
    }

    // Check if player exists
    if (!this.state.players[playerId]) {
      return false;
    }

    // Mark this player as confirmed
    this.mulliganConfirmed.add(playerId);

    // Check if both players have confirmed
    const playerIds = Object.keys(this.state.players);
    const allConfirmed = playerIds.every(id => this.mulliganConfirmed.has(id));

    if (allConfirmed) {
      // Both players confirmed - start first turn
      this.beginFirstTurn();
    }

    return true;
  }

  /**
   * Perform mulligan - shuffle hand back into deck and draw new hand
   * Can only be done once per player during START_MULLIGAN phase
   */
  public performMulligan(playerId: string): boolean {
    if (this.state.phase !== GamePhase.START_MULLIGAN) {
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) {
      return false;
    }

    // Check if player already used their mulligan
    if (this.mulliganUsed.has(playerId)) {
      return false;
    }

    // Mark mulligan as used
    this.mulliganUsed.add(playerId);

    // Shuffle hand back into deck
    while (player.hand.length > 0) {
      const card = player.hand.pop()!;
      card.zone = CardZone.DECK;
      player.deck.push(card);
    }

    // Shuffle the deck
    player.deck = this.shuffleArray(player.deck);

    // Draw new starting hand
    this.drawCards(playerId, DEFAULT_GAME_CONFIG.startingHand);

    // Auto-confirm after mulligan (player can't mulligan again)
    this.confirmKeepHand(playerId);

    return true;
  }

  /**
   * Check if a player has already used their mulligan
   */
  public hasMulliganBeenUsed(playerId: string): boolean {
    return this.mulliganUsed.has(playerId);
  }

  /**
   * Check if a player has confirmed their hand (keep or mulligan)
   */
  public hasConfirmedHand(playerId: string): boolean {
    return this.mulliganConfirmed.has(playerId);
  }

  /**
   * Begin the first turn after mulligan
   * Special handling: first player draws 1 DON (not 2) and doesn't draw a card
   */
  private beginFirstTurn(): void {
    const activePlayer = this.state.players[this.state.activePlayerId];
    if (!activePlayer) return;

    // Mark player as active and increment their turn count
    activePlayer.isActive = true;
    activePlayer.turnCount++;

    // DON phase - first player only gets 1 DON on turn 1
    this.state.phase = GamePhase.DON_PHASE;
    const donToDraw = Math.min(1, activePlayer.donDeck);
    for (let i = 0; i < donToDraw; i++) {
      activePlayer.donDeck--;
      activePlayer.donField.push({
        id: `${this.state.activePlayerId}-don-${Date.now()}-${i}`,
        cardId: 'DON',
        zone: CardZone.DON_FIELD,
        state: CardState.ACTIVE,
        owner: this.state.activePlayerId
      });
    }

    // Skip draw phase on turn 1 for first player (already drew starting hand)
    // Move directly to main phase
    this.state.phase = GamePhase.MAIN_PHASE;
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

        // Trigger CARD_DRAWN for each card
        const cardDrawnTrigger: TriggerEvent = {
          type: EffectTrigger.CARD_DRAWN,
          cardId: card.id,
          playerId: playerId,
          value: 1,
        };
        this.processTriggers(cardDrawnTrigger);
      }
    }

    return drawnCards;
  }

  private setupLife(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Get leader's life count (default to maxLife if not specified)
    const leaderDef = this.effectEngine.getCardDefinition(player.leaderId);
    const lifeCount = leaderDef?.life ?? DEFAULT_GAME_CONFIG.maxLife;

    // Debug: Log life setup info
    console.log(`[setupLife] Player ${playerId} - Leader: ${player.leaderId}, leaderDef found: ${!!leaderDef}, leaderDef.life: ${leaderDef?.life}, using lifeCount: ${lifeCount}`);

    // Update player's life and maxLife to match leader's life count
    player.life = lifeCount;
    player.maxLife = lifeCount;

    for (let i = 0; i < lifeCount; i++) {
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
    // Validate phase - can only play cards during MAIN_PHASE
    if (this.state.phase !== GamePhase.MAIN_PHASE) {
      return false;
    }

    // Validate turn - can only play cards on your turn
    if (this.state.activePlayerId !== playerId) {
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = player.hand[cardIndex];

    // Get card definition to check cost
    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    const cardCost = cardDef?.cost || 0;

    // Check if player has enough ACTIVE DON to pay the cost
    const activeDon = player.donField.filter(don => don.state === CardState.ACTIVE);
    if (activeDon.length < cardCost) {
      return false; // Not enough DON to play this card
    }

    // Rest DON equal to the card cost
    for (let i = 0; i < cardCost; i++) {
      activeDon[i].state = CardState.RESTED;
    }

    // Trigger DON_TAP if any DON was tapped
    if (cardCost > 0) {
      const donTapTrigger: TriggerEvent = {
        type: EffectTrigger.DON_TAP,
        playerId: playerId,
      };
      this.processTriggers(donTapTrigger);
    }

    // Now remove from hand and play
    player.hand.splice(cardIndex, 1);
    card.zone = targetZone;
    card.state = CardState.ACTIVE;
    card.turnPlayed = this.state.turn;

    // Check for Rush keyword
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

      const pendingEffects = this.processTriggers(triggerEvent);

      // Trigger DEPLOYED_FROM_HAND for card owner
      const deployedTrigger: TriggerEvent = {
        type: EffectTrigger.DEPLOYED_FROM_HAND,
        cardId: card.id,
        playerId: playerId,
      };
      this.processTriggers(deployedTrigger);

      // Trigger OPPONENT_DEPLOYS for opponent's cards
      const opponentDeploysTrigger: TriggerEvent = {
        type: EffectTrigger.OPPONENT_DEPLOYS,
        cardId: card.id,
        playerId: playerId,
      };
      this.processTriggers(opponentDeploysTrigger);

      // Check for SEARCH_AND_SELECT ON_PLAY effects (e.g., "Look at 3 cards, reveal up to 1, add to hand")
      const searchSelectEffect = pendingEffects.find(e =>
        e.effect.effects.some(action => action.type === EffectType.SEARCH_AND_SELECT)
      );

      if (searchSelectEffect) {
        console.log('[playCard] CHARACTER SEARCH_AND_SELECT ON_PLAY detected');
        const conditionsMet = this.checkEffectConditions(searchSelectEffect.effect, playerId);

        if (conditionsMet) {
          const effectAction = searchSelectEffect.effect.effects.find(e => e.type === EffectType.SEARCH_AND_SELECT);
          const searchDetails = searchSelectEffect.effect.description ? extractSearchAndSelectDetails(searchSelectEffect.effect.description) : null;

          const lookCount = searchDetails?.lookCount ?? effectAction?.value ?? 3;
          const maxSelections = searchDetails?.maxSelections ?? effectAction?.maxCount ?? 1;
          const traitFilter = searchDetails?.traitFilter ?? effectAction?.traitFilter;
          const excludeNames = searchDetails?.excludeNames ?? effectAction?.excludeNames;
          const selectAction = searchDetails?.selectAction ?? 'ADD_TO_HAND';
          const remainderAction = searchDetails?.remainderAction ?? 'TRASH';
          const childEffects = effectAction?.childEffects;

          // Remove this effect from pending (it will be handled by deck reveal flow)
          this.effectEngine.removePendingEffect(searchSelectEffect.id);

          this.setupDeckRevealEffect(
            playerId,
            card.id,
            searchSelectEffect.effect.description || 'Look at cards from your deck',
            lookCount,
            maxSelections,
            traitFilter,
            excludeNames,
            selectAction,
            remainderAction,
            childEffects
          );
          return true; // Early return - deck reveal UI will handle the rest
        } else {
          console.log('[playCard] CHARACTER SEARCH_AND_SELECT conditions not met');
          // Remove the pending effect since it fizzles
          this.effectEngine.removePendingEffect(searchSelectEffect.id);
        }
      }

      // Auto-resolve effects that don't require target selection (like MILL_DECK, DRAW_CARDS, etc.)
      const effectsNotRequiringChoice = pendingEffects.filter(e => !e.requiresChoice);
      for (const effect of effectsNotRequiringChoice) {
        console.log('[playCard] Auto-resolving non-choice effect:', effect.effect.effects[0]?.type);
        this.resolveEffect(effect.id, []);
      }

      // Check if any ON_PLAY effects require target selection
      const effectsRequiringChoice = pendingEffects.filter(e => e.requiresChoice);
      if (effectsRequiringChoice.length > 0) {
        // Build pending play effects with valid targets
        const pendingPlayEffects = effectsRequiringChoice.map(e => {
          // Get valid targets for the effect
          const validTargets = this.getValidTargetsForEffect(e.id);

          // Determine effect type and max targets from effect definition
          const effectAction = e.effect.effects[0];
          const effectType = effectAction?.type || 'UNKNOWN';

          // ATTACH_DON only needs 1 selection: the target (leader/character)
          // System auto-selects DON cards based on target type
          let maxTargets = effectAction?.target?.count || 1;
          if (effectAction?.type === EffectType.ATTACH_DON) {
            maxTargets = 1; // Just the target, DON is auto-selected
          }

          return {
            id: e.id,
            sourceCardId: e.sourceCardId,
            playerId: e.playerId,
            description: e.effect.description || 'Activate ON PLAY ability',
            validTargets,
            requiresChoice: e.requiresChoice,
            effectType: effectType.toString(),
            maxTargets,
            minTargets: e.effect.isOptional ? 0 : 1
          };
        });

        // Filter out ATTACH_DON effects with 0 valid targets (auto-skip them)
        const actionableEffects = pendingPlayEffects.filter(e => {
          if (e.effectType === 'ATTACH_DON' && (!e.validTargets || e.validTargets.length === 0)) {
            // No valid targets (not enough rested DON) - auto-skip this effect
            console.log('[playCard] ATTACH_DON has no valid targets, auto-skipping');
            this.effectEngine.removePendingEffect(e.id);
            return false;
          }
          return true;
        });

        if (actionableEffects.length > 0) {
          // Pause at PLAY_EFFECT_STEP to let player select targets
          this.state.phase = GamePhase.PLAY_EFFECT_STEP;
          this.state.pendingPlayEffects = actionableEffects;
        }
      }
    } else if (targetZone === CardZone.STAGE) {
      // Stage card handling - only 1 stage per player
      // If player already has a stage, send it to trash
      if (player.stage) {
        const oldStage = player.stage;
        oldStage.zone = CardZone.TRASH;
        player.trash.push(oldStage);

        // Remove any continuous effects from old stage
        this.removeStageEffects(playerId, oldStage.id);
      }

      // Place new stage
      card.zone = CardZone.STAGE;
      card.state = CardState.ACTIVE;
      card.turnPlayed = this.state.turn;
      player.stage = card;

      // Recalculate hand costs based on new stage's effects
      this.applyStageEffects(playerId);

      // Trigger ON_PLAY effects for stage
      const triggerEvent: TriggerEvent = {
        type: EffectTrigger.ON_PLAY,
        cardId: card.id,
        playerId: playerId,
      };
      this.processTriggers(triggerEvent);
    } else if (targetZone === CardZone.EVENT || cardDef?.type === 'EVENT') {
      // EVENT card handling: resolve [Main] effect, then move to trash
      console.log('[playCard] EVENT card handling for:', card.cardId);

      // Trigger OPPONENT_PLAYS_EVENT for the opponent's cards
      const opponentPlaysEventTrigger: TriggerEvent = {
        type: EffectTrigger.OPPONENT_PLAYS_EVENT,
        cardId: card.id,
        playerId: playerId,
      };
      this.processTriggers(opponentPlaysEventTrigger);

      // Move card to trash immediately (events don't stay on field)
      card.zone = CardZone.TRASH;
      player.trash.push(card);

      // Find [Main] effect for this event
      console.log('[playCard] Looking for [Main] effect in cardDef:', cardDef?.id);
      console.log('[playCard] cardDef.effects:', cardDef?.effects?.length || 0, 'effects');
      console.log('[playCard] cardDef.effectText:', cardDef?.effectText?.substring(0, 100));
      const mainEffect = cardDef?.effects.find(e => e.trigger === EffectTrigger.MAIN);
      console.log('[playCard] mainEffect found:', !!mainEffect);
      if (mainEffect) {
        // Check for SEARCH_AND_SELECT effect (Look at X cards, select, trash rest)
        const isSearchAndSelect = mainEffect.effects.some(e => e.type === EffectType.SEARCH_AND_SELECT);
        const searchDetails = mainEffect.description ? extractSearchAndSelectDetails(mainEffect.description) : null;

        if (isSearchAndSelect || searchDetails) {
          console.log('[playCard] SEARCH_AND_SELECT effect detected');
          // Check leader conditions first
          const conditionsMet = this.checkEffectConditions(mainEffect, playerId);
          if (!conditionsMet) {
            console.log('[playCard] Leader conditions not met for SEARCH_AND_SELECT');
            // Effect fizzles - create a dummy event effect to show the message
            const pendingEvent: PendingEventEffect = {
              id: `event-${card.id}-${Date.now()}`,
              sourceCardId: card.id,
              playerId: playerId,
              description: mainEffect.description || 'Look at cards from deck',
              validTargets: [],
              effectType: 'SEARCH_AND_SELECT',
              maxTargets: 0,
              minTargets: 0,
              conditionsMet: false,
            };
            this.state.phase = GamePhase.EVENT_EFFECT_STEP;
            this.state.pendingEventEffects = [pendingEvent];
          } else {
            // Get details from parsed description or effect action
            const effectAction = mainEffect.effects.find(e => e.type === EffectType.SEARCH_AND_SELECT);
            const lookCount = searchDetails?.lookCount ?? effectAction?.value ?? 3;
            const maxSelections = searchDetails?.maxSelections ?? effectAction?.maxCount ?? 1;
            const traitFilter = searchDetails?.traitFilter ?? effectAction?.traitFilter;
            const excludeNames = searchDetails?.excludeNames ?? effectAction?.excludeNames;
            const selectAction = searchDetails?.selectAction ?? effectAction?.selectAction ?? 'ADD_TO_HAND';
            const remainderAction = searchDetails?.remainderAction ?? effectAction?.remainderAction ?? 'TRASH';
            const childEffects = effectAction?.childEffects;

            this.setupDeckRevealEffect(
              playerId,
              card.id,
              mainEffect.description || 'Look at cards from your deck',
              lookCount,
              maxSelections,
              traitFilter,
              excludeNames,
              selectAction,
              remainderAction,
              childEffects
            );
          }
        } else {
          // Standard event effect handling
          // Check if effect has leader conditions
          const conditionsMet = this.checkEffectConditions(mainEffect, playerId);

          // Check for additional costs (e.g., "You may rest 1 DON")
          const additionalCost = this.extractAdditionalCost(mainEffect, playerId);

          // Get valid targets for the effect
          const validTargets = this.getValidTargetsForEventEffect(mainEffect, playerId);

          // Create pending event effect
          const pendingEvent: PendingEventEffect = {
            id: `event-${card.id}-${Date.now()}`,
            sourceCardId: card.id,
            playerId: playerId,
            description: mainEffect.description || 'Activate event [Main] ability',
            validTargets: validTargets,
            effectType: mainEffect.effects[0]?.type.toString() || 'UNKNOWN',
            maxTargets: mainEffect.effects[0]?.target?.maxCount || mainEffect.effects[0]?.target?.count || 1,
            minTargets: mainEffect.isOptional ? 0 : 1,
            conditionsMet: conditionsMet,
            additionalCost: additionalCost
          };

          // If there's an additional cost, pause for cost decision first
          if (additionalCost && additionalCost.optional) {
            this.state.phase = GamePhase.ADDITIONAL_COST_STEP;
            this.state.pendingAdditionalCost = additionalCost;
            this.state.pendingEventEffects = [pendingEvent];
          }
          // If conditions are met and requires target selection
          else if (conditionsMet && validTargets.length > 0) {
            this.state.phase = GamePhase.EVENT_EFFECT_STEP;
            this.state.pendingEventEffects = [pendingEvent];
          }
          // If conditions not met or no targets, still enter EVENT_EFFECT_STEP so client can show fizzle message
          else {
            console.log('[playCard] Event effect will fizzle - conditions:', conditionsMet, 'targets:', validTargets.length);
            this.state.phase = GamePhase.EVENT_EFFECT_STEP;
            this.state.pendingEventEffects = [pendingEvent];
          }
        }
      }
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

  /**
   * Check if effect conditions are met (e.g., "If your Leader is [Imu]")
   */
  private checkEffectConditions(effect: CardEffectDefinition, playerId: string): boolean {
    if (!effect.conditions || effect.conditions.length === 0) {
      return true; // No conditions, always met
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    for (const condition of effect.conditions) {
      switch (condition.type) {
        case ConditionType.LEADER_IS: {
          // Check if leader matches the required name
          if (!condition.leaderName) continue;
          const leaderDef = this.effectEngine.getCardDefinition(player.leaderCard?.cardId || player.leaderId);
          if (!leaderDef || leaderDef.name !== condition.leaderName) {
            console.log('[checkEffectConditions] Leader check failed:', leaderDef?.name, '!==', condition.leaderName);
            return false;
          }
          break;
        }
        case ConditionType.LEADER_HAS_TRAIT: {
          // Check if leader has the required trait
          if (!condition.traits || condition.traits.length === 0) continue;
          const leaderDef = this.effectEngine.getCardDefinition(player.leaderCard?.cardId || player.leaderId);
          if (!leaderDef) return false;
          const hasRequiredTrait = condition.traits.some(trait =>
            leaderDef.traits.includes(trait)
          );
          if (!hasRequiredTrait) {
            console.log('[checkEffectConditions] Leader trait check failed');
            return false;
          }
          break;
        }
        // Add more condition types as needed
        default:
          // Unknown condition type - skip for now
          break;
      }
    }

    return true;
  }

  /**
   * Extract additional cost from effect (e.g., "You may rest 1 DON")
   */
  private extractAdditionalCost(effect: CardEffectDefinition, playerId: string): PendingAdditionalCost | undefined {
    if (!effect.costs || effect.costs.length === 0) {
      return undefined;
    }

    // Look for optional costs (costs with optional: true)
    const optionalCost = effect.costs.find(c => c.optional === true);
    if (!optionalCost) {
      return undefined;
    }

    let costType: 'REST_DON' | 'TRASH_CARD' | 'LIFE';
    let description: string;

    switch (optionalCost.type) {
      case 'REST_DON':
        costType = 'REST_DON';
        description = `Rest ${optionalCost.count || 1} DON!! card(s)`;
        break;
      case 'TRASH_CARD':
      case 'TRASH_FROM_HAND':
        costType = 'TRASH_CARD';
        description = `Trash ${optionalCost.count || 1} card(s) from your hand`;
        break;
      case 'LIFE':
        costType = 'LIFE';
        description = `Take ${optionalCost.count || 1} damage`;
        break;
      default:
        return undefined;
    }

    return {
      id: `cost-${Date.now()}`,
      sourceCardId: '', // Will be set by caller
      playerId: playerId,
      costType: costType,
      amount: optionalCost.count || 1,
      optional: true,
      description: description
    };
  }

  /**
   * Get valid targets for an event effect
   */
  private getValidTargetsForEventEffect(effect: CardEffectDefinition, playerId: string): string[] {
    const player = this.state.players[playerId];
    const opponent = Object.values(this.state.players).find(p => p.id !== playerId);
    if (!player || !opponent) return [];

    const validTargets: string[] = [];
    const effectAction = effect.effects[0];
    if (!effectAction || !effectAction.target) return [];

    const targetType = effectAction.target.type;
    const filters = effectAction.target.filters || [];

    // Collect candidates based on target type
    let candidates: GameCard[] = [];
    switch (targetType) {
      case TargetType.OPPONENT_STAGE:
        if (opponent.stage) candidates = [opponent.stage];
        break;
      case TargetType.OPPONENT_CHARACTER:
        candidates = opponent.field;
        break;
      case TargetType.YOUR_CHARACTER:
        candidates = player.field;
        break;
      case TargetType.YOUR_LEADER:
        if (player.leaderCard) candidates = [player.leaderCard];
        break;
      case TargetType.YOUR_LEADER_OR_CHARACTER:
        candidates = [...player.field];
        if (player.leaderCard) candidates.unshift(player.leaderCard);
        break;
      case TargetType.OPPONENT_LEADER:
        if (opponent.leaderCard) candidates = [opponent.leaderCard];
        break;
      case TargetType.OPPONENT_LEADER_OR_CHARACTER:
        candidates = [...opponent.field];
        if (opponent.leaderCard) candidates.unshift(opponent.leaderCard);
        break;
      default:
        break;
    }

    // Apply filters
    for (const candidate of candidates) {
      const cardDef = this.effectEngine.getCardDefinition(candidate.cardId);
      if (!cardDef) continue;

      let passesFilters = true;
      for (const filter of filters) {
        switch (filter.property) {
          case 'COST':
            const cardCost = candidate.modifiedCost ?? cardDef.cost ?? 0;
            if (filter.operator === 'OR_LESS' && cardCost > (filter.value as number)) passesFilters = false;
            if (filter.operator === 'OR_MORE' && cardCost < (filter.value as number)) passesFilters = false;
            if (filter.operator === 'EQUALS' && cardCost !== filter.value) passesFilters = false;
            break;
          case 'POWER':
            // Calculate current power including buffs
            let cardPower = candidate.basePower ?? cardDef.power ?? 0;
            if (candidate.powerBuffs) {
              for (const buff of candidate.powerBuffs) {
                cardPower += buff.value;
              }
            }
            if (filter.operator === 'OR_LESS' && cardPower > (filter.value as number)) passesFilters = false;
            if (filter.operator === 'OR_MORE' && cardPower < (filter.value as number)) passesFilters = false;
            break;
          case 'TRAIT':
            const traits = Array.isArray(filter.value) ? filter.value : [filter.value];
            if (filter.operator === 'CONTAINS' && !traits.some(t => cardDef.traits.includes(t as string))) passesFilters = false;
            break;
          // Add more filter types as needed
        }
        if (!passesFilters) break;
      }

      if (passesFilters) {
        validTargets.push(candidate.id);
      }
    }

    return validTargets;
  }

  // Remove active effects that originated from a stage card
  private removeStageEffects(_playerId: string, stageCardId: string): void {
    // Remove any active effects that came from this stage
    this.effectEngine.removeActiveEffectsBySource(stageCardId);
  }

  // =====================================================
  // STAGE EFFECT SYSTEM
  // =====================================================

  // Stage effects are now loaded from database via effectEngine.getCardDefinition()
  // The following stage cards have effects defined in database:
  // - OP05-097 (Mary Geoise): YOUR_TURN - Celestial Dragons cost -1
  // - ST14-017 (Thousand Sunny): CONTINUOUS - Black Straw Hat Crew cost +1 for opponent
  // - OP02-024 (Moby Dick): YOUR_TURN - If life ≤1, Whitebeard Pirates +2000
  // - OP08-020 (Drum Kingdom): OPPONENT_TURN - Drum Kingdom Characters +1000
  // - OP13-099 (Empty Throne): YOUR_TURN - If 19+ trash, Leader +1000
  // - OP04-096 (Corrida Coliseum): CONTINUOUS - Dressrosa Characters can attack characters on play

  /**
   * Clear all stage-based modifications (called at end of turn)
   */
  private clearStageModifications(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Clear hand cost modifications
    for (const card of player.hand) {
      card.modifiedCost = undefined;
    }

    // Clear field power buffs from stage effects
    this.clearStagePowerBuffs(playerId);

    // Clear rush vs characters flag
    for (const card of player.field) {
      card.hasRushVsCharacters = undefined;
    }

    // Clear stage active effect flag
    if (player.stage) {
      player.stage.hasActiveEffect = false;
    }
  }

  /**
   * Clear power buffs that came from stage continuous effects
   */
  private clearStagePowerBuffs(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Clear from leader
    if (player.leaderCard?.powerBuffs) {
      player.leaderCard.powerBuffs = player.leaderCard.powerBuffs.filter(
        buff => buff.duration !== 'STAGE_CONTINUOUS'
      );
    }

    // Clear from field characters
    for (const card of player.field) {
      if (card.powerBuffs) {
        card.powerBuffs = card.powerBuffs.filter(
          buff => buff.duration !== 'STAGE_CONTINUOUS'
        );
      }
    }
  }

  /**
   * Apply all stage continuous effects for a player
   * Called at start of turn, after playing a stage, and when relevant conditions change
   * Effects are now loaded from the database via effectEngine.getCardDefinition()
   */
  private applyStageEffects(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Determine if it's this player's turn
    const isMyTurn = this.state.activePlayerId === playerId;

    // Clear previous modifications first
    for (const card of player.hand) {
      card.modifiedCost = undefined;
    }
    this.clearStagePowerBuffs(playerId);
    for (const card of player.field) {
      card.hasRushVsCharacters = undefined;
    }

    if (player.stage) {
      player.stage.hasActiveEffect = false;
    }

    // Check own stage effects
    if (player.stage) {
      const stageDef = this.effectEngine.getCardDefinition(player.stage.cardId);

      if (stageDef?.effects) {
        for (const effect of stageDef.effects) {
          // Check timing
          const trigger = effect.trigger;
          const shouldApply =
            trigger === EffectTrigger.PASSIVE ||
            (trigger === EffectTrigger.YOUR_TURN && isMyTurn) ||
            (trigger === EffectTrigger.OPPONENT_TURN && !isMyTurn);

          if (shouldApply) {
            const hadEffect = this.applySingleStageEffect(player, effect, player.stage.id);
            if (hadEffect) {
              player.stage.hasActiveEffect = true;
            }
          }
        }
      }
    }

    // Also check opponent's stage for effects that affect them on our turn
    const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
    if (opponentId) {
      const opponent = this.state.players[opponentId];
      if (opponent?.stage) {
        const stageDef = this.effectEngine.getCardDefinition(opponent.stage.cardId);
        if (stageDef?.effects) {
          for (const effect of stageDef.effects) {
            // Opponent's "opponent turn" effects apply when it's OUR turn
            if (effect.trigger === EffectTrigger.OPPONENT_TURN && isMyTurn) {
              this.applySingleStageEffect(opponent, effect, opponent.stage.id);
              if (opponent.stage) {
                opponent.stage.hasActiveEffect = true;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Apply a single stage effect to a player's cards
   * Returns true if any cards were affected
   */
  private applySingleStageEffect(
    player: PlayerState,
    effect: CardEffectDefinition,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;

    // Check conditions
    if (effect.conditions) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard: player.stage!,
        sourcePlayer: player,
      };
      for (const condition of effect.conditions) {
        if (!this.effectEngine.checkCondition(condition, context)) {
          return false;
        }
      }
    }

    // Process each effect action
    for (const action of effect.effects) {
      switch (action.type) {
        case EffectType.REDUCE_COST:
          hadEffect = this.applyHandCostModification(player, action, -(action.value || 0)) || hadEffect;
          break;

        case EffectType.INCREASE_COST:
          // For OPPONENT_HAND target, apply to opponent
          if (action.target?.type === TargetType.OPPONENT_HAND) {
            const opponentId = Object.keys(this.state.players).find(id => id !== player.id);
            if (opponentId) {
              const opponent = this.state.players[opponentId];
              hadEffect = this.applyHandCostModification(opponent, action, action.value || 0) || hadEffect;
            }
          } else {
            hadEffect = this.applyHandCostModification(player, action, action.value || 0) || hadEffect;
          }
          break;

        case EffectType.BUFF_POWER:
        case EffectType.BUFF_ANY:
          hadEffect = this.applyFieldPowerBuff(player, action, sourceCardId) || hadEffect;
          break;

        case EffectType.GRANT_RUSH_VS_CHARACTERS:
          hadEffect = this.applyRushVsCharacters(player, action) || hadEffect;
          break;
      }
    }

    return hadEffect;
  }

  /**
   * Apply cost modification to cards in a player's hand
   */
  private applyHandCostModification(
    player: PlayerState,
    action: EffectAction,
    modifier: number
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];

    for (const card of player.hand) {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) continue;

      // Check filters
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => cardDef.traits?.includes(t))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'COLOR') {
          const colors = filter.value as string[];
          if (!colors.some(c => cardDef.colors?.includes(c))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'COST' && filter.operator === 'OR_MORE') {
          if ((cardDef.cost ?? 0) < (filter.value as number)) {
            matches = false;
            break;
          }
        }
      }

      if (matches && cardDef.cost !== null) {
        const baseCost = cardDef.cost ?? 0;
        const currentModified = card.modifiedCost ?? baseCost;
        card.modifiedCost = Math.max(0, currentModified + modifier);
        hadEffect = true;
      }
    }

    return hadEffect;
  }

  /**
   * Apply power buff to field/leader cards
   */
  private applyFieldPowerBuff(
    player: PlayerState,
    action: EffectAction,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const targetType = action.target?.type;
    const filters = action.target?.filters || [];
    const modifier = action.value || 0;

    const applyToCard = (card: GameCard): boolean => {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) return false;

      // Check filters
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => cardDef.traits?.includes(t))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'NAME') {
          const names = filter.value as string[];
          if (!names.some(n => cardDef.name?.includes(n.replace(/[.\[\]]/g, '')))) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        if (!card.powerBuffs) card.powerBuffs = [];
        card.powerBuffs.push({
          id: `stage-${sourceCardId}-${card.id}`,
          sourceCardId: sourceCardId,
          value: modifier,
          duration: 'STAGE_CONTINUOUS' as any
        });
        return true;
      }
      return false;
    };

    // Apply to leader
    if (targetType === TargetType.YOUR_LEADER || targetType === TargetType.YOUR_LEADER_OR_CHARACTER) {
      if (player.leaderCard) {
        hadEffect = applyToCard(player.leaderCard) || hadEffect;
      }
    }

    // Apply to characters
    if (targetType === TargetType.YOUR_CHARACTER || targetType === TargetType.YOUR_LEADER_OR_CHARACTER || targetType === TargetType.YOUR_FIELD) {
      for (const card of player.field) {
        hadEffect = applyToCard(card) || hadEffect;
      }
    }

    return hadEffect;
  }

  /**
   * Apply rush vs characters ability to matching cards
   */
  private applyRushVsCharacters(
    player: PlayerState,
    action: EffectAction
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];

    // Check leader condition (e.g., leader must have Dressrosa trait)
    for (const filter of filters) {
      if (filter.property === 'TRAIT' && filter.value) {
        const leaderDef = player.leaderCard ?
          this.effectEngine.getCardDefinition(player.leaderCard.cardId) : null;
        const traits = filter.value as string[];
        // This is the leader condition check - if leader doesn't have the trait, skip
        if (leaderDef && !traits.some(t => leaderDef.traits?.includes(t))) {
          // Check if this is a leader condition or target condition
          // For Corrida Coliseum, the leader must have Dressrosa trait
          // But we also need the target characters to have Dressrosa
          // This is handled below
        }
      }
    }

    for (const card of player.field) {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) continue;

      // Check filters
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => cardDef.traits?.includes(t))) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        card.hasRushVsCharacters = true;
        hadEffect = true;
      }
    }

    return hadEffect;
  }

  /**
   * Check if a character has Rush vs Characters ability from stage effects
   * Used when determining if a character can attack characters on the turn it was played
   */
  public hasStageGrantedRushVsCharacters(playerId: string, cardId: string): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    // Check if the card has the flag set
    const card = player.field.find(c => c.id === cardId);
    return card?.hasRushVsCharacters === true;
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

    // Mark card as activated this turn if effect is once-per-turn
    if (pending.effect.oncePerTurn && card) {
      card.activatedThisTurn = true;
      console.log(`[resolveEffect] Marked ${card.cardId} as activatedThisTurn`);
    }

    // Process childEffects if any
    if (result.childEffects && result.childEffects.length > 0) {
      console.log('[resolveEffect] Processing', result.childEffects.length, 'childEffects');
      this.processChildEffects(result.childEffects, pending.playerId, pending.sourceCardId);
    }

    return result.changes;
  }

  // Get pending effects for UI to display
  public getPendingEffects(): PendingEffect[] {
    return this.effectEngine.getPendingEffects();
  }

  // Get valid targets for an effect
  public getValidTargetsForEffect(effectId: string): string[] {
    const pending = this.effectEngine.getPendingEffects().find(e => e.id === effectId);
    if (!pending) return [];

    const effectAction = pending.effect.effects[0];
    const player = this.state.players[pending.playerId];
    const card = this.findCard(pending.sourceCardId);
    if (!player || !card) return [];

    // Special handling for ATTACH_DON - only return valid targets (leader/characters)
    // System auto-selects DON cards based on target type
    if (effectAction?.type === EffectType.ATTACH_DON) {
      const targets: string[] = [];

      // Count available rested DON cards
      const restedDonCount = player.donField.filter(
        don => don.state === CardState.RESTED && !don.attachedTo
      ).length;

      // Get DON requirements from effect definition
      const donReq = effectAction.donCountByTarget || { leader: 1, character: 1 };

      // Add leader as target ONLY if enough rested DON available
      if (player.leaderCard && restedDonCount >= donReq.leader) {
        targets.push(player.leaderCard.id);
      }

      // Add field characters as targets ONLY if enough rested DON for 1
      if (restedDonCount >= donReq.character) {
        player.field.forEach(c => targets.push(c.id));
      }

      return targets;
    }

    // For other effects, use the effect engine's target resolution
    if (!effectAction?.target) return [];

    const context: EffectContext = {
      gameState: this.state,
      sourceCard: card,
      sourcePlayer: player,
    };

    return this.effectEngine.getValidTargets(effectAction, context);
  }

  public attachDon(playerId: string, donId: string, targetId: string): boolean {
    // Validate turn - can only attach DON on your turn
    if (this.state.activePlayerId !== playerId) {
      return false;
    }

    // Validate phase - can only attach DON during MAIN_PHASE
    if (this.state.phase !== GamePhase.MAIN_PHASE) {
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    const donIndex = player.donField.findIndex(d => d.id === donId);
    if (donIndex === -1) return false;

    const don = player.donField[donIndex];
    don.attachedTo = targetId;
    don.state = CardState.ATTACHED;

    // Trigger ATTACH_DON event
    const triggerEvent: TriggerEvent = {
      type: EffectTrigger.ATTACH_DON,
      cardId: donId,
      playerId: playerId,
      targetId: targetId,
    };
    this.processTriggers(triggerEvent);

    return true;
  }

  // Combat methods
  public declareAttack(attackerId: string, targetId: string, targetType: 'leader' | 'character'): boolean {
    console.log('[DEBUG ATTACK GSM] declareAttack called:', { attackerId, targetId, targetType });

    // Validate phase - can only attack during MAIN_PHASE
    if (this.state.phase !== GamePhase.MAIN_PHASE) {
      console.log('[DEBUG ATTACK GSM] Not in MAIN_PHASE');
      return false;
    }

    const attacker = this.findCard(attackerId);
    if (!attacker) {
      console.log('[DEBUG ATTACK GSM] Attacker not found');
      return false;
    }

    // Validate that attacker belongs to the active player
    if (attacker.owner !== this.state.activePlayerId) {
      console.log('[DEBUG ATTACK GSM] Attacker does not belong to active player');
      return false;
    }

    if (attacker.state !== CardState.ACTIVE) {
      console.log('[DEBUG ATTACK GSM] Attacker not ACTIVE:', attacker.state);
      return false;
    }

    // Neither player can attack on their first personal turn (One Piece TCG rule)
    const attackerPlayer = this.state.players[attacker.owner];
    if (attackerPlayer && attackerPlayer.turnCount === 1) {
      console.log('[DEBUG ATTACK GSM] First turn - cannot attack');
      return false;
    }

    // Check if card can attack (Rush check for cards played this turn)
    if (attacker.turnPlayed === this.state.turn) {
      // Card was played this turn - check attack eligibility
      const hasRush = this.effectEngine.canAttackOnPlayTurn(attacker, this.state.turn);
      const hasStageRushVsCharacters = this.hasStageGrantedRushVsCharacters(attacker.owner, attacker.id);

      if (hasRush) {
        // Full Rush - can attack anything
      } else if (hasStageRushVsCharacters && targetType === 'character') {
        // Stage-granted rush vs characters only (e.g., Corrida Coliseum)
      } else {
        // No rush ability - cannot attack on play turn
        return false;
      }
    }

    // If attacking a character, verify target is RESTED (cannot attack active characters)
    if (targetType === 'character') {
      const target = this.findCard(targetId);
      if (!target || target.state !== CardState.RESTED) {
        return false; // Can only attack rested characters
      }
    }

    // Rest the attacker
    attacker.state = CardState.RESTED;
    attacker.hasAttacked = true;

    // Calculate attack power (base + buffs + attached DON!)
    const attackPower = this.getEffectivePower(attacker);

    this.state.currentCombat = {
      attackerId,
      targetId,
      targetType,
      attackPower
    };

    // Trigger ON_ATTACK effects FIRST (before setting phase)
    // This allows effects like CANT_BE_BLOCKED to apply before blocker step
    const triggerEvent: TriggerEvent = {
      type: EffectTrigger.ON_ATTACK,
      cardId: attackerId,
      playerId: attacker.owner,
      targetId: targetId,
    };
    const pendingEffects = this.processTriggers(triggerEvent);

    // Check if any ON_ATTACK effects require target selection
    const effectsRequiringChoice = pendingEffects.filter(e => e.requiresChoice);
    if (effectsRequiringChoice.length > 0) {
      // Pause at ATTACK_EFFECT_STEP to let player select targets
      this.state.phase = GamePhase.ATTACK_EFFECT_STEP;

      // Populate pendingAttackEffects for the client to display (compute valid targets like play effects)
      this.state.pendingAttackEffects = effectsRequiringChoice.map(e => {
        // Get valid targets for the effect
        const validTargets = this.getValidTargetsForEffect(e.id);
        const effectAction = e.effect.effects[0];

        return {
          id: e.id,
          sourceCardId: e.sourceCardId,
          playerId: e.playerId,
          description: e.effect.description || 'Activate ability',
          validTargets,
          requiresChoice: e.requiresChoice,
          maxTargets: effectAction?.target?.count || 1
        };
      });

      return true;
    }

    // Combat order: Attack → Block → Counter → Damage
    // Check if attacker became unblockable from ON_ATTACK effects
    if (this.effectEngine.isUnblockable(attacker)) {
      // Skip blocker step entirely, go to counter step
      this.state.phase = GamePhase.COUNTER_STEP;
      console.log('[DEBUG ATTACK GSM] Attack declared - going to COUNTER_STEP (unblockable)');
    } else {
      this.state.phase = GamePhase.BLOCKER_STEP;
      console.log('[DEBUG ATTACK GSM] Attack declared - going to BLOCKER_STEP');
    }

    console.log('[DEBUG ATTACK GSM] Combat state:', {
      attackerId: this.state.currentCombat.attackerId,
      targetId: this.state.currentCombat.targetId,
      attackPower: this.state.currentCombat.attackPower,
      newPhase: this.state.phase
    });

    return true;
  }

  // Resolve an ON_ATTACK effect that requires target selection
  public resolveAttackEffect(effectId: string, selectedTargets: string[]): boolean {
    if (this.state.phase !== GamePhase.ATTACK_EFFECT_STEP) return false;
    if (!this.state.currentCombat) return false;

    // Resolve the effect with selected targets
    this.resolveEffect(effectId, selectedTargets);

    // Check if there are more pending ON_ATTACK effects requiring choices
    const remainingEffects = this.effectEngine.getPendingEffects().filter(e =>
      e.trigger === EffectTrigger.ON_ATTACK && e.requiresChoice
    );

    if (remainingEffects.length > 0) {
      // Update pendingAttackEffects for the client (compute valid targets)
      this.state.pendingAttackEffects = remainingEffects.map(e => {
        const validTargets = this.getValidTargetsForEffect(e.id);
        const effectAction = e.effect.effects[0];
        return {
          id: e.id,
          sourceCardId: e.sourceCardId,
          playerId: e.playerId,
          description: e.effect.description || 'Activate ability',
          validTargets,
          requiresChoice: e.requiresChoice,
          maxTargets: effectAction?.target?.count || 1
        };
      });
      // Stay in ATTACK_EFFECT_STEP for next effect
      return true;
    }

    // All effects resolved, proceed to next combat phase
    return this.proceedFromAttackEffectStep();
  }

  // Skip an ON_ATTACK effect (player chooses not to use it)
  public skipAttackEffect(effectId: string): boolean {
    if (this.state.phase !== GamePhase.ATTACK_EFFECT_STEP) return false;
    if (!this.state.currentCombat) return false;

    // Remove the effect from pending without resolving
    this.effectEngine.removePendingEffect(effectId);

    // Check if there are more pending ON_ATTACK effects requiring choices
    const remainingEffects = this.effectEngine.getPendingEffects().filter(e =>
      e.trigger === EffectTrigger.ON_ATTACK && e.requiresChoice
    );

    if (remainingEffects.length > 0) {
      // Update pendingAttackEffects for the client (compute valid targets)
      this.state.pendingAttackEffects = remainingEffects.map(e => {
        const validTargets = this.getValidTargetsForEffect(e.id);
        const effectAction = e.effect.effects[0];
        return {
          id: e.id,
          sourceCardId: e.sourceCardId,
          playerId: e.playerId,
          description: e.effect.description || 'Activate ability',
          validTargets,
          requiresChoice: e.requiresChoice,
          maxTargets: effectAction?.target?.count || 1
        };
      });
      // Stay in ATTACK_EFFECT_STEP for next effect
      return true;
    }

    // All effects handled, proceed to next combat phase
    return this.proceedFromAttackEffectStep();
  }

  // Helper to proceed from ATTACK_EFFECT_STEP to the next combat phase
  private proceedFromAttackEffectStep(): boolean {
    if (!this.state.currentCombat) return false;

    // Clear pending attack effects since we're done with the effect step
    this.state.pendingAttackEffects = undefined;

    const attacker = this.findCard(this.state.currentCombat.attackerId);

    // Check if attacker became unblockable from ON_ATTACK effects
    if (attacker && this.effectEngine.isUnblockable(attacker)) {
      // Skip blocker step entirely, go to counter step
      this.state.phase = GamePhase.COUNTER_STEP;
    } else {
      this.state.phase = GamePhase.BLOCKER_STEP;
    }

    return true;
  }

  // Resolve an ON_PLAY effect that requires target selection
  public resolvePlayEffect(effectId: string, selectedTargets: string[]): boolean {
    if (this.state.phase !== GamePhase.PLAY_EFFECT_STEP) return false;

    console.log('[resolvePlayEffect] Called with effectId:', effectId, 'targets:', selectedTargets);

    // Resolve the effect with selected targets
    this.resolveEffect(effectId, selectedTargets);

    // Check if there are more pending ON_PLAY effects requiring choices
    const remainingEffects = this.effectEngine.getPendingEffects().filter(e =>
      e.trigger === EffectTrigger.ON_PLAY && e.requiresChoice
    );

    if (remainingEffects.length > 0) {
      // Update pendingPlayEffects for the client
      this.state.pendingPlayEffects = remainingEffects.map(e => {
        const validTargets = this.getValidTargetsForEffect(e.id);
        const effectAction = e.effect.effects[0];
        const effectType = effectAction?.type || 'UNKNOWN';

        // ATTACH_DON needs 2 selections: DON card + target (leader/character)
        let maxTargets = effectAction?.target?.count || 1;
        if (effectAction?.type === EffectType.ATTACH_DON) {
          maxTargets = 2; // DON card + target
        }

        return {
          id: e.id,
          sourceCardId: e.sourceCardId,
          playerId: e.playerId,
          description: e.effect.description || 'Activate ON PLAY ability',
          validTargets,
          requiresChoice: e.requiresChoice,
          effectType: effectType.toString(),
          maxTargets,
          minTargets: e.effect.isOptional ? 0 : 1
        };
      });
      // Stay in PLAY_EFFECT_STEP for next effect
      return true;
    }

    // All effects resolved, return to MAIN_PHASE
    this.state.pendingPlayEffects = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;

    return true;
  }

  // Skip an ON_PLAY effect (player chooses not to use it)
  public skipPlayEffect(effectId: string): boolean {
    if (this.state.phase !== GamePhase.PLAY_EFFECT_STEP) return false;

    console.log('[skipPlayEffect] Called with effectId:', effectId);

    // Remove the effect from pending without resolving
    this.effectEngine.removePendingEffect(effectId);

    // Check if there are more pending ON_PLAY effects requiring choices
    const remainingEffects = this.effectEngine.getPendingEffects().filter(e =>
      e.trigger === EffectTrigger.ON_PLAY && e.requiresChoice
    );

    if (remainingEffects.length > 0) {
      // Update pendingPlayEffects for the client
      this.state.pendingPlayEffects = remainingEffects.map(e => {
        const validTargets = this.getValidTargetsForEffect(e.id);
        const effectAction = e.effect.effects[0];
        const effectType = effectAction?.type || 'UNKNOWN';

        // ATTACH_DON needs 2 selections: DON card + target (leader/character)
        let maxTargets = effectAction?.target?.count || 1;
        if (effectAction?.type === EffectType.ATTACH_DON) {
          maxTargets = 2; // DON card + target
        }

        return {
          id: e.id,
          sourceCardId: e.sourceCardId,
          playerId: e.playerId,
          description: e.effect.description || 'Activate ON PLAY ability',
          validTargets,
          requiresChoice: e.requiresChoice,
          effectType: effectType.toString(),
          maxTargets,
          minTargets: e.effect.isOptional ? 0 : 1
        };
      });
      // Stay in PLAY_EFFECT_STEP for next effect
      return true;
    }

    // All effects handled, return to MAIN_PHASE
    this.state.pendingPlayEffects = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;

    return true;
  }

  // Resolve an ACTIVATE_MAIN effect that requires hand card selection (e.g., Empty Throne)
  public resolveActivateEffect(effectId: string, selectedTargets: string[]): boolean {
    console.log('[resolveActivateEffect] Called with effectId:', effectId, 'targets:', selectedTargets);

    // Find and remove the pending effect
    const pendingEffects = this.state.pendingActivateEffects || [];
    const effectIndex = pendingEffects.findIndex(e => e.id === effectId);
    if (effectIndex === -1) {
      console.log('[resolveActivateEffect] Effect not found in pending list');
      return false;
    }

    const pendingEffect = pendingEffects[effectIndex];
    const player = this.state.players[pendingEffect.playerId];
    if (!player) {
      console.log('[resolveActivateEffect] Player not found');
      return false;
    }

    // Validate that selected targets are valid
    for (const targetId of selectedTargets) {
      if (!pendingEffect.validHandCardIds.includes(targetId)) {
        console.log('[resolveActivateEffect] Invalid target:', targetId);
        return false;
      }
    }

    // Remove the pending effect
    pendingEffects.splice(effectIndex, 1);
    if (pendingEffects.length === 0) {
      this.state.pendingActivateEffects = undefined;
    }

    // Find the source card to get the effect definition
    const sourceCard = this.findCard(pendingEffect.sourceCardId);
    if (!sourceCard) {
      console.log('[resolveActivateEffect] Source card not found');
      return false;
    }

    const cardDef = this.effectEngine.getCardDefinition(sourceCard.cardId);
    if (!cardDef) {
      console.log('[resolveActivateEffect] Card definition not found');
      return false;
    }

    const activateEffect = cardDef.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
    if (!activateEffect) {
      console.log('[resolveActivateEffect] No ACTIVATE_MAIN effect found');
      return false;
    }

    // Create effect context with selected targets
    const context: EffectContext = {
      gameState: this.state,
      sourceCard,
      sourcePlayer: player,
      selectedTargets,
    };

    console.log('[resolveActivateEffect] Resolving effect with targets:', selectedTargets);

    // Resolve the effect
    const result = this.effectEngine.resolveEffect(activateEffect, context);
    console.log('[resolveActivateEffect] Effect result:', result);

    // Process childEffects if any
    if (result.childEffects && result.childEffects.length > 0) {
      console.log('[resolveActivateEffect] Processing', result.childEffects.length, 'childEffects');
      this.processChildEffects(result.childEffects, pendingEffect.playerId, pendingEffect.sourceCardId);
    }

    return result.success;
  }

  // Skip an ACTIVATE_MAIN effect (player chooses not to select a card)
  public skipActivateEffect(effectId: string): boolean {
    console.log('[skipActivateEffect] Called with effectId:', effectId);

    // Find and remove the pending effect
    const pendingEffects = this.state.pendingActivateEffects || [];
    const effectIndex = pendingEffects.findIndex(e => e.id === effectId);
    if (effectIndex === -1) {
      console.log('[skipActivateEffect] Effect not found in pending list');
      return false;
    }

    const pendingEffect = pendingEffects[effectIndex];

    // Only allow skip if effect is optional
    if (!pendingEffect.optional) {
      console.log('[skipActivateEffect] Effect is not optional, cannot skip');
      return false;
    }

    // Remove the pending effect
    pendingEffects.splice(effectIndex, 1);
    if (pendingEffects.length === 0) {
      this.state.pendingActivateEffects = undefined;
    }

    console.log('[skipActivateEffect] Effect skipped successfully');
    return true;
  }

  public declareBlocker(playerId: string, blockerId: string): boolean {
    if (!this.state.currentCombat) return false;
    if (this.state.phase !== GamePhase.BLOCKER_STEP) return false;

    // Validate that this player is the DEFENDER (not the attacker)
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker) return false;

    // The attacker's owner cannot declare blockers - only the defender can
    if (attacker.owner === playerId) {
      return false;
    }

    const blocker = this.findCard(blockerId);
    if (!blocker || blocker.state !== CardState.ACTIVE) return false;

    // Validate that the blocker belongs to the player declaring the block
    if (blocker.owner !== playerId) {
      return false;
    }

    // Check if card can block using effect engine
    if (!this.effectEngine.canBlock(blocker)) return false;

    // Check if attacker is unblockable
    if (this.effectEngine.isUnblockable(attacker)) return false;

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

    // Trigger OPPONENT_ACTIVATES_BLOCKER for the attacking player's cards
    const opponentBlockerTrigger: TriggerEvent = {
      type: EffectTrigger.OPPONENT_ACTIVATES_BLOCKER,
      cardId: blockerId,
      playerId: blocker.owner,
      targetId: this.state.currentCombat.attackerId,
    };
    this.processTriggers(opponentBlockerTrigger);

    // After blocker selected, move to counter step
    this.state.phase = GamePhase.COUNTER_STEP;

    return true;
  }

  // Counter Step methods
  // Handles both character counters (free) and event counters (costs DON)
  public useCounter(playerId: string, cardIds: string[]): boolean {
    console.log('[useCounter] Called with playerId:', playerId, 'cardIds:', cardIds);

    if (!this.state.currentCombat) {
      console.log('[useCounter] FAIL: No current combat');
      return false;
    }
    if (this.state.phase !== GamePhase.COUNTER_STEP) {
      console.log('[useCounter] FAIL: Not in COUNTER_STEP, phase is:', this.state.phase);
      return false;
    }

    // Player using counter must be the defender (not the attacker's owner)
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker || attacker.owner === playerId) {
      console.log('[useCounter] FAIL: Player is attacker or attacker not found');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) {
      console.log('[useCounter] FAIL: Player not found');
      return false;
    }

    let totalCounterPower = 0;
    const usedCards: GameCard[] = [];
    let totalDonCost = 0;

    // First pass: validate all cards and calculate total DON cost needed
    for (const cardId of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        console.log('[useCounter] FAIL: Card not in hand, cardId:', cardId);
        return false;
      }

      const card = player.hand[cardIndex];
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      console.log('[useCounter] Card:', card.cardId, 'CardDef:', cardDef ? {
        name: cardDef.name,
        type: cardDef.type,
        counter: cardDef.counter,
        cost: cardDef.cost,
        effectsCount: cardDef.effects?.length || 0,
        effectTriggers: cardDef.effects?.map(e => e.trigger) || []
      } : 'NOT FOUND');

      if (!cardDef) {
        console.log('[useCounter] FAIL: CardDef not found for:', card.cardId);
        return false;
      }

      // Character counter (free, has counter stat)
      if (cardDef.counter !== null && cardDef.counter !== undefined && cardDef.counter > 0) {
        console.log('[useCounter] Valid character counter with value:', cardDef.counter);
        totalCounterPower += cardDef.counter;
        usedCards.push(card);
      }
      // Event counter (costs DON, has COUNTER effect trigger)
      else if (cardDef.type === 'EVENT' && cardDef.effects.some(e => e.trigger === EffectTrigger.COUNTER)) {
        console.log('[useCounter] Valid event counter with cost:', cardDef.cost);
        totalDonCost += cardDef.cost || 0;
        usedCards.push(card);
        // Event counter power comes from effect resolution, not a stat
      }
      else {
        // Card is neither a valid character counter nor event counter
        console.log('[useCounter] FAIL: Card is not a valid counter. type:', cardDef.type,
          'counter:', cardDef.counter,
          'hasCounterTrigger:', cardDef.effects?.some(e => e.trigger === EffectTrigger.COUNTER));
        return false;
      }
    }

    // Check if player has enough DON to pay for event counters
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
    if (activeDon.length < totalDonCost) {
      console.log(`[useCounter] Not enough DON. Need ${totalDonCost}, have ${activeDon.length}`);
      return false;
    }

    // Pay DON cost for event counters (rest DON cards)
    for (let i = 0; i < totalDonCost; i++) {
      activeDon[i].state = CardState.RESTED;
    }

    // Collect event counter cards that need target selection
    const counterEffectsNeedingSelection: PendingCounterEffect[] = [];

    // Remove counter cards from hand and move to trash
    for (const card of usedCards) {
      const cardIndex = player.hand.findIndex(c => c.id === card.id);
      if (cardIndex !== -1) {
        const removedCard = player.hand.splice(cardIndex, 1)[0];
        removedCard.zone = CardZone.TRASH;
        player.trash.push(removedCard);

        // Check if this is an event counter that needs target selection
        const cardDef = this.effectEngine.getCardDefinition(removedCard.cardId);
        if (cardDef?.type === 'EVENT') {
          const counterEffect = cardDef.effects.find(e => e.trigger === EffectTrigger.COUNTER);
          if (counterEffect) {
            // Check conditions (e.g., "If your Leader is [Imu]")
            const conditionsMet = this.checkEffectConditions(counterEffect, playerId);

            // Get valid targets for the counter effect
            const validTargets = this.getValidTargetsForEventEffect(counterEffect, playerId);

            // Extract power boost value from effect
            const powerBoostAction = counterEffect.effects.find(e => e.type === EffectType.BUFF_POWER);
            const powerBoost = powerBoostAction?.value || 0;

            // If effect requires target selection (power buff to leader/character)
            if (powerBoostAction && validTargets.length > 0) {
              counterEffectsNeedingSelection.push({
                id: `counter-${removedCard.id}-${Date.now()}`,
                sourceCardId: removedCard.id,
                playerId: playerId,
                description: counterEffect.description || `Give +${powerBoost} power during this battle`,
                validTargets: validTargets,
                effectType: 'BUFF_POWER',
                powerBoost: powerBoost,
                maxTargets: powerBoostAction.target?.count || 1,
                conditionsMet: conditionsMet
              });
            } else if (!powerBoostAction) {
              // Trigger COUNTER effects that don't need selection
              const triggerEvent: TriggerEvent = {
                type: EffectTrigger.COUNTER,
                cardId: removedCard.id,
                playerId: playerId,
              };
              this.processTriggers(triggerEvent);
            }
          }
        } else {
          // Character counter - trigger effect normally (just power from counter stat)
          const triggerEvent: TriggerEvent = {
            type: EffectTrigger.COUNTER,
            cardId: removedCard.id,
            playerId: playerId,
          };
          this.processTriggers(triggerEvent);
        }
      }
    }

    // Update combat counter power (character counter values only - event effects are separate)
    this.state.currentCombat.counterPower =
      (this.state.currentCombat.counterPower || 0) + totalCounterPower;

    // If there are counter effects needing target selection, pause for that
    if (counterEffectsNeedingSelection.length > 0) {
      this.state.phase = GamePhase.COUNTER_EFFECT_STEP;
      this.state.pendingCounterEffects = counterEffectsNeedingSelection;
      console.log('[useCounter] Pausing for counter effect target selection:', counterEffectsNeedingSelection);
      return true;
    }

    // Counter step is after blocker step, so resolve combat now
    this.resolveCombat();

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

    // Counter step is after blocker step, so resolve combat now
    this.resolveCombat();

    return true;
  }

  public passBlocker(playerId: string): boolean {
    if (!this.state.currentCombat) return false;
    if (this.state.phase !== GamePhase.BLOCKER_STEP) return false;

    // Player passing must be the defender
    const attacker = this.findCard(this.state.currentCombat.attackerId);
    if (!attacker || attacker.owner === playerId) return false;

    // No blocker selected, move to counter step
    this.state.phase = GamePhase.COUNTER_STEP;

    return true;
  }

  // Get cards that can be used as counters
  // Includes: 1) Character cards with counter value (free), 2) Event cards with [Counter] effect (costs DON)
  public getAvailableCounterCards(playerId: string): GameCard[] {
    const player = this.state.players[playerId];
    if (!player) return [];

    // Count available DON for event counter cost checking
    const activeDonCount = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo).length;

    return player.hand.filter(card => {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) return false;

      // Character cards with counter value (free to use)
      if (cardDef.counter !== null && cardDef.counter !== undefined && cardDef.counter > 0) {
        return true;
      }

      // Event cards with [Counter] effect (require DON cost payment)
      if (cardDef.type === 'EVENT') {
        // Check if card has a COUNTER trigger in its effects
        const hasCounterEffect = cardDef.effects.some(e => e.trigger === EffectTrigger.COUNTER);
        if (hasCounterEffect) {
          // Check if player has enough active DON to pay the event's cost
          const eventCost = cardDef.cost || 0;
          return activeDonCount >= eventCost;
        }
      }

      return false;
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

    const { attackerId, targetId, targetType, attackPower, counterPower = 0, effectBuffPower = 0 } = this.state.currentCombat;
    const attacker = this.findCard(attackerId);

    if (targetType === 'leader') {
      // Damage to leader
      const targetPlayer = this.findCardOwner(targetId!);
      if (targetPlayer) {
        // Check for Double Attack
        let damageMultiplier = 1;
        const hasDoubleAttack = attacker && this.effectEngine.hasDoubleAttack(attacker);
        if (hasDoubleAttack) {
          damageMultiplier = 2;
        }

        // Check if attack succeeds (include base power, buffs, and attached DON for defender)
        const leaderPower = targetPlayer.leaderCard
          ? this.getEffectivePower(targetPlayer.leaderCard)
          : 0;
        if (attackPower >= leaderPower + counterPower + effectBuffPower) {
          // Deal damage
          this.takeDamage(targetPlayer.id, damageMultiplier, attacker, hasDoubleAttack);

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
        // Include base power, buffs, and attached DON for defender
        const targetPower = this.getEffectivePower(target) + (counterPower || 0) + (effectBuffPower || 0);
        if (attackPower >= targetPower) {
          // Trigger PRE_KO before the KO happens (allows prevention effects)
          const preKoTrigger: TriggerEvent = {
            type: EffectTrigger.PRE_KO,
            cardId: targetId,
            playerId: target.owner,
          };
          const preKoEffects = this.processTriggers(preKoTrigger);

          // Check if any PRE_KO effect prevents the KO
          const koPrevented = preKoEffects.some(e =>
            e.effect.effects.some(action => action.type === EffectType.PREVENT_KO)
          );

          if (!koPrevented) {
            this.koCharacter(targetId!);

            // Trigger ON_KO (for the card being KO'd)
            const triggerEvent: TriggerEvent = {
              type: EffectTrigger.ON_KO,
              cardId: targetId,
              playerId: target.owner,
            };
            this.processTriggers(triggerEvent);

            // Trigger ANY_CHARACTER_KOD (for all cards watching)
            const anyKOTrigger: TriggerEvent = {
              type: EffectTrigger.ANY_CHARACTER_KOD,
              cardId: targetId,
              playerId: target.owner,
            };
            this.processTriggers(anyKOTrigger);

            // Trigger AFTER_KO_CHARACTER (for other cards to react)
            const afterKoTrigger: TriggerEvent = {
              type: EffectTrigger.AFTER_KO_CHARACTER,
              cardId: targetId,
              playerId: target.owner,
            };
            this.processTriggers(afterKoTrigger);
          }
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

    // Clear temporary keywords granted during combat (e.g., Unblockable from CANT_BE_BLOCKED)
    if (attacker) {
      attacker.temporaryKeywords = [];
    }

    // Clear THIS_BATTLE power buffs from all cards
    this.clearBattleBuffs();

    this.state.currentCombat = undefined;
    // Only return to MAIN_PHASE if game hasn't ended
    if (this.state.phase !== GamePhase.GAME_OVER) {
      this.state.phase = GamePhase.MAIN_PHASE;
    }
  }

  private takeDamage(playerId: string, damage: number, attacker?: GameCard, isDoubleAttack?: boolean): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Capture life before damage for Double Attack win prevention check
    const lifeBeforeDamage = player.lifeCards.length;

    // Check if attacker has Banish - cards go to trash instead of hand
    const hasBanish = attacker && this.effectEngine.hasBanish(attacker);

    for (let i = 0; i < damage; i++) {
      // Win condition: If player has no life cards and takes damage, they lose
      if (player.lifeCards.length === 0) {
        // Double Attack cannot win if opponent had only 1 life (One Piece TCG rule)
        if (isDoubleAttack && lifeBeforeDamage === 1) {
          // Opponent survives - Double Attack rule prevents win
          return;
        }

        const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
        this.state.winner = opponentId;
        this.state.phase = GamePhase.GAME_OVER;

        // Trigger LIFE_REACHES_ZERO
        const lifeZeroEvent: TriggerEvent = {
          type: EffectTrigger.LIFE_REACHES_ZERO,
          playerId: playerId,
        };
        this.processTriggers(lifeZeroEvent);
        return; // Game is over
      }

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

      // Trigger TRASH_SELF for the card being trashed
      const trashSelfTrigger: TriggerEvent = {
        type: EffectTrigger.TRASH_SELF,
        cardId: cardId,
        playerId: card.owner,
      };
      this.processTriggers(trashSelfTrigger);

      // Trigger TRASH_ALLY for other cards owned by the same player
      const trashAllyTrigger: TriggerEvent = {
        type: EffectTrigger.TRASH_ALLY,
        cardId: cardId,
        playerId: card.owner,
      };
      this.processTriggers(trashAllyTrigger);

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
    this.state.phase = GamePhase.REFRESH_PHASE;
    player.isActive = true;
    player.turnCount++;

    // Cleanup expired effects from previous turn
    this.effectEngine.cleanupExpiredEffects(this.state);

    // Recalculate hand costs based on stage effects (your turn only)
    this.applyStageEffects(playerId);

    // REFRESH PHASE: Return all attached DON to cost area (skip on turn 1)
    // According to official rules, Refresh Phase is skipped on the very first turn
    if (this.state.turn > 1) {
      player.donField.forEach(don => {
        if (don.attachedTo) {
          don.attachedTo = undefined;
          don.state = CardState.ACTIVE;
        }
      });
    }

    // Untap all cards (including any rested DON)
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

    // Check for deck-out: if player's deck is empty, they lose
    if (player.deck.length === 0) {
      const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
      this.state.winner = opponentId;
      this.state.phase = GamePhase.GAME_OVER;
      return;
    }

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
    // Only the active player can end their turn
    if (this.state.activePlayerId !== playerId) {
      return;
    }

    const player = this.state.players[playerId];
    if (!player) return;

    player.isActive = false;
    this.state.phase = GamePhase.END_PHASE;

    // Clear "[Your Turn]" cost modifications since turn is ending
    this.clearStageModifications(playerId);

    // Trigger END_OF_TURN effects
    const endTurnEvent: TriggerEvent = {
      type: EffectTrigger.END_OF_TURN,
      playerId: playerId,
    };
    this.processTriggers(endTurnEvent);

    // Clear THIS_TURN power buffs from all cards (for both players)
    this.clearTurnBuffs();

    // Find next player
    const nextPlayerId = Object.keys(this.state.players).find(id => id !== playerId);
    if (nextPlayerId) {
      this.startTurn(nextPlayerId);
    }
  }

  private untapAll(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Untap leader and reset turn-based flags
    if (player.leaderCard) {
      player.leaderCard.state = CardState.ACTIVE;
      player.leaderCard.hasAttacked = false;
      player.leaderCard.activatedThisTurn = false;
    }

    // Untap all field cards and reset turn-based flags
    player.field.forEach(card => {
      if (card.state === CardState.RESTED) {
        card.state = CardState.ACTIVE;
        card.hasAttacked = false;
      }
      card.activatedThisTurn = false;
    });

    // Untap DON! (all DON should be in cost area now after refresh phase)
    player.donField.forEach(don => {
      if (don.state === CardState.RESTED) {
        don.state = CardState.ACTIVE;
      }
    });
  }

  /**
   * Clear THIS_TURN power buffs from all cards at end of turn
   */
  private clearTurnBuffs(): void {
    for (const player of Object.values(this.state.players)) {
      // Clear from leader
      if (player.leaderCard?.powerBuffs) {
        player.leaderCard.powerBuffs = player.leaderCard.powerBuffs.filter(
          buff => buff.duration !== 'THIS_TURN'
        );
      }
      // Clear from field cards
      for (const card of player.field) {
        if (card.powerBuffs) {
          card.powerBuffs = card.powerBuffs.filter(
            buff => buff.duration !== 'THIS_TURN'
          );
        }
      }
    }
  }

  /**
   * Clear THIS_BATTLE power buffs from all cards after combat resolves
   */
  private clearBattleBuffs(): void {
    for (const player of Object.values(this.state.players)) {
      // Clear from leader
      if (player.leaderCard?.powerBuffs) {
        player.leaderCard.powerBuffs = player.leaderCard.powerBuffs.filter(
          buff => buff.duration !== 'THIS_BATTLE'
        );
      }
      // Clear from field cards
      for (const card of player.field) {
        if (card.powerBuffs) {
          card.powerBuffs = card.powerBuffs.filter(
            buff => buff.duration !== 'THIS_BATTLE'
          );
        }
      }
    }
  }

  /**
   * Calculate effective power of a card including base power, active buffs, and attached DON
   */
  public getEffectivePower(card: GameCard): number {
    // Use basePower if available, otherwise fall back to power field
    const base = card.basePower ?? card.power ?? 0;

    // Sum active buffs (PERMANENT, THIS_TURN, THIS_BATTLE, STAGE_CONTINUOUS)
    const buffTotal = (card.powerBuffs || [])
      .filter(buff => {
        if (buff.duration === 'PERMANENT') return true;
        if (buff.duration === 'STAGE_CONTINUOUS') return true; // Stage continuous effects
        if (buff.duration === 'THIS_TURN') {
          return buff.appliedTurn === this.state.turn;
        }
        if (buff.duration === 'THIS_BATTLE') {
          // Only include if we're currently in combat
          if (!this.state.currentCombat) return false;
          const currentCombatId = `${this.state.turn}-${this.state.currentCombat.attackerId}`;
          return buff.appliedCombatId === currentCombatId;
        }
        return false;
      })
      .reduce((sum, buff) => sum + buff.value, 0);

    // DON bonus (+1000 per attached DON) - only applies on the card owner's turn
    const attachedDon = this.getAttachedDon(card.id);
    const isOwnersTurn = card.owner === this.state.activePlayerId;
    const donBonus = isOwnersTurn ? (attachedDon.length * 1000) : 0;

    return base + buffTotal + donBonus;
  }

  /**
   * Get the total buff amount on a card (for display purposes)
   */
  public getBuffTotal(card: GameCard): number {
    return (card.powerBuffs || [])
      .filter(buff => {
        if (buff.duration === 'PERMANENT') return true;
        if (buff.duration === 'STAGE_CONTINUOUS') return true; // Stage continuous effects
        if (buff.duration === 'THIS_TURN') {
          return buff.appliedTurn === this.state.turn;
        }
        if (buff.duration === 'THIS_BATTLE') {
          if (!this.state.currentCombat) return false;
          const currentCombatId = `${this.state.turn}-${this.state.currentCombat.attackerId}`;
          return buff.appliedCombatId === currentCombatId;
        }
        return false;
      })
      .reduce((sum, buff) => sum + buff.value, 0);
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

    // Find effects with TRIGGER trigger type
    const triggerEffects = cardDef.effects.filter(e => e.trigger === EffectTrigger.TRIGGER);
    if (triggerEffects.length === 0) return false;

    // Get player who owns the card
    const player = this.state.players[card.owner];
    if (!player) return false;

    // Check if at least one trigger effect can potentially activate
    // (conditions checked, costs checked at activation time)
    for (const effect of triggerEffects) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard: card,
        sourcePlayer: player,
      };

      // Check conditions (if any) - effects without conditions always pass
      if (effect.conditions && effect.conditions.length > 0) {
        const allConditionsMet = effect.conditions.every(cond =>
          this.effectEngine.checkCondition(cond, context)
        );
        if (!allConditionsMet) continue;
      }

      // At least one trigger effect can potentially activate
      return true;
    }

    // No trigger effects can activate (all failed conditions)
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
      case ActionType.PRE_GAME_SELECT:
        return this.handlePreGameSelect(action.playerId, action.data.cardId);

      case ActionType.SKIP_PRE_GAME:
        return this.skipPreGameEffect(action.playerId);

      case ActionType.KEEP_HAND:
        return this.confirmKeepHand(action.playerId);

      case ActionType.MULLIGAN:
        return this.performMulligan(action.playerId);

      case ActionType.PLAY_CARD:
        return this.playCard(action.playerId, action.data.cardId, action.data.zone);

      case ActionType.ATTACH_DON:
        return this.attachDon(action.playerId, action.data.donId, action.data.targetId);

      case ActionType.DECLARE_ATTACK:
        return this.declareAttack(action.data.attackerId, action.data.targetId, action.data.targetType);

      case ActionType.RESOLVE_ATTACK_EFFECT:
        return this.resolveAttackEffect(action.data.effectId, action.data.selectedTargets || []);

      case ActionType.SKIP_ATTACK_EFFECT:
        return this.skipAttackEffect(action.data.effectId);

      case ActionType.RESOLVE_PLAY_EFFECT:
        return this.resolvePlayEffect(action.data.effectId, action.data.selectedTargets || []);

      case ActionType.SKIP_PLAY_EFFECT:
        return this.skipPlayEffect(action.data.effectId);

      case ActionType.RESOLVE_ACTIVATE_EFFECT:
        return this.resolveActivateEffect(action.data.effectId, action.data.selectedTargets || []);

      case ActionType.SKIP_ACTIVATE_EFFECT:
        return this.skipActivateEffect(action.data.effectId);

      case ActionType.USE_COUNTER:
        return this.useCounter(action.playerId, action.data.cardIds || []);

      case ActionType.PASS_COUNTER:
        return this.passCounter(action.playerId);

      case ActionType.SELECT_BLOCKER:
        return this.declareBlocker(action.playerId, action.data.blockerId);

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

      case ActionType.ACTIVATE_ABILITY:
        return this.activateAbility(action.playerId, action.data.cardId, action.data.targets);

      case ActionType.RESOLVE_EVENT_EFFECT:
        return this.resolveEventEffect(action.playerId, action.data.effectId, action.data.selectedTargets);

      case ActionType.SKIP_EVENT_EFFECT:
        return this.skipEventEffect(action.playerId, action.data.effectId);

      case ActionType.PAY_ADDITIONAL_COST:
        return this.payAdditionalCost(action.playerId, action.data.costId);

      case ActionType.SKIP_ADDITIONAL_COST:
        return this.skipAdditionalCost(action.playerId, action.data.costId);

      case ActionType.RESOLVE_COUNTER_EFFECT:
        return this.resolveCounterEffect(action.playerId, action.data.effectId, action.data.selectedTargets);

      case ActionType.SKIP_COUNTER_EFFECT:
        return this.skipCounterEffect(action.playerId, action.data.effectId);

      case ActionType.RESOLVE_DECK_REVEAL:
        return this.resolveDeckReveal(action.playerId, action.data.selectedCardIds);

      case ActionType.SKIP_DECK_REVEAL:
        return this.skipDeckReveal(action.playerId);

      case ActionType.RESOLVE_HAND_SELECT:
        return this.resolveHandSelect(action.playerId, action.data.selectedCardIds);

      case ActionType.SKIP_HAND_SELECT:
        return this.skipHandSelect(action.playerId);

      default:
        return false;
    }
  }

  // Activate a card's [Activate: Main] ability
  public activateAbility(playerId: string, cardId: string, selectedTargets?: string[]): boolean {
    console.log('[ActivateAbility] Called with:', { playerId, cardId, selectedTargets });

    // Must be in main phase
    if (this.state.phase !== GamePhase.MAIN_PHASE) {
      console.log('[ActivateAbility] Failed: Not in main phase');
      return false;
    }

    // Must be the active player
    if (this.state.activePlayerId !== playerId) {
      console.log('[ActivateAbility] Failed: Not active player');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) {
      console.log('[ActivateAbility] Failed: Player not found');
      return false;
    }

    // Find the card (can be leader or field character)
    const card = this.findCard(cardId);
    if (!card || card.owner !== playerId) {
      console.log('[ActivateAbility] Failed: Card not found or not owned by player');
      return false;
    }

    // Card must be on field, leader, or stage
    if (card.zone !== CardZone.FIELD && card.zone !== CardZone.LEADER && card.zone !== CardZone.STAGE) {
      console.log('[ActivateAbility] Failed: Card not on field, leader, or stage zone');
      return false;
    }

    // Get card definition and find ACTIVATE_MAIN effect
    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    if (!cardDef) {
      return false;
    }

    const activateEffect = cardDef.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
    if (!activateEffect) {
      return false;
    }

    // Check once-per-turn restriction
    if (activateEffect.oncePerTurn && card.activatedThisTurn) {
      return false;
    }

    // Check conditions
    if (activateEffect.conditions) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard: card,
        sourcePlayer: player,
      };

      for (const condition of activateEffect.conditions) {
        if (!this.effectEngine.checkCondition(condition, context)) {
          return false;
        }
      }
    }

    // Check and pay costs
    if (activateEffect.costs) {
      for (const cost of activateEffect.costs) {
        if (cost.type === 'REST_DON') {
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
          if (activeDon.length < (cost.count || 0)) {
            return false; // Not enough DON to pay cost
          }
          // Pay the cost - rest the DON
          for (let i = 0; i < (cost.count || 0); i++) {
            activeDon[i].state = CardState.RESTED;
          }
        } else if (cost.type === 'DON') {
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
          if (activeDon.length < (cost.count || 0)) {
            return false;
          }
          for (let i = 0; i < (cost.count || 0); i++) {
            activeDon[i].state = CardState.RESTED;
          }
        } else if (cost.type === 'LIFE') {
          if (player.lifeCards.length < (cost.count || 0)) {
            return false;
          }
          // Move life card to deck bottom
          for (let i = 0; i < (cost.count || 0); i++) {
            const lifeCard = player.lifeCards.pop();
            if (lifeCard) {
              lifeCard.zone = CardZone.DECK;
              player.deck.push(lifeCard);
              player.life--;
            }
          }
        } else if (cost.type === 'REST_SELF') {
          // Rest the source card itself
          if (card.state === CardState.RESTED) {
            return false; // Already rested, can't pay this cost
          }
          card.state = CardState.RESTED;
        } else if (cost.type === 'TRASH_FROM_HAND') {
          // Trash card(s) from hand as cost
          const requiredCount = cost.count || 1;
          if (player.hand.length < requiredCount) {
            return false; // Not enough cards in hand to pay cost
          }

          // Mark as activated this turn BEFORE creating pending
          if (activateEffect.oncePerTurn) {
            card.activatedThisTurn = true;
          }

          // Create pending hand select for cost payment
          const pendingEffect: PendingHandSelectEffect = {
            id: `cost-trash-${card.id}-${Date.now()}`,
            sourceCardId: card.cardId,
            playerId,
            description: `Select ${requiredCount} card${requiredCount > 1 ? 's' : ''} to trash to activate ${cardDef.name}'s ability`,
            selectAction: 'TRASH',
            minSelections: requiredCount,
            maxSelections: requiredCount,
            canSkip: false, // Must pay the cost once activated
            isCostPayment: true,
            pendingEffectId: activateEffect.id,
            sourceCardInstanceId: card.id,
          };

          this.state.pendingHandSelectEffect = pendingEffect;
          this.state.phase = GamePhase.HAND_SELECT_STEP;

          return true; // Effect will be executed after cost is paid
        }
      }
    }

    // Check if effect contains PLAY_FROM_HAND and needs hand selection
    const playFromHandAction = activateEffect.effects.find(e => e.type === EffectType.PLAY_FROM_HAND);
    if (playFromHandAction && (!selectedTargets || selectedTargets.length === 0)) {
      // Get valid hand cards for this effect
      const validHandCardIds = this.effectEngine.getValidHandCardsForEffect(
        activateEffect,
        this.state,
        card,
        player
      );

      console.log('[ActivateAbility] PLAY_FROM_HAND detected, valid hand cards:', validHandCardIds);

      // If there are valid cards and the effect is not optional with 0 valid, create pending
      const isOptional = playFromHandAction.target?.optional || false;
      if (validHandCardIds.length > 0 || !isOptional) {
        // Mark as activated this turn BEFORE creating pending
        if (activateEffect.oncePerTurn) {
          card.activatedThisTurn = true;
        }

        // Create pending activate effect for hand selection
        const pendingEffect: PendingActivateEffect = {
          id: `pending-activate-${Date.now()}`,
          sourceCardId: cardId,
          playerId,
          description: activateEffect.description || 'Select a card from your hand to play',
          validHandCardIds,
          optional: isOptional,
          maxTargets: playFromHandAction.target?.count || 1,
        };

        // Initialize pendingActivateEffects if not present
        if (!this.state.pendingActivateEffects) {
          this.state.pendingActivateEffects = [];
        }
        this.state.pendingActivateEffects.push(pendingEffect);

        console.log('[ActivateAbility] Created pending activate effect:', pendingEffect);
        return true; // Costs paid, waiting for selection
      }

      // If optional and no valid targets, skip the effect
      if (isOptional && validHandCardIds.length === 0) {
        console.log('[ActivateAbility] Optional effect with no valid targets, skipping');
        if (activateEffect.oncePerTurn) {
          card.activatedThisTurn = true;
        }
        return true;
      }

      // No valid targets for required effect
      console.log('[ActivateAbility] No valid targets for required PLAY_FROM_HAND effect');
      return false;
    }

    // Mark as activated this turn (for once-per-turn abilities)
    if (activateEffect.oncePerTurn) {
      card.activatedThisTurn = true;
    }

    // Resolve the effect
    const context: EffectContext = {
      gameState: this.state,
      sourceCard: card,
      sourcePlayer: player,
      selectedTargets,
    };

    console.log('[ActivateAbility] Resolving effect with context:', {
      sourceCardId: card.cardId,
      selectedTargets,
      effectTypes: activateEffect.effects.map(e => e.type),
    });

    const result = this.effectEngine.resolveEffect(activateEffect, context);
    console.log('[ActivateAbility] Effect result:', result);

    // Process childEffects if any
    if (result.childEffects && result.childEffects.length > 0) {
      console.log('[ActivateAbility] Processing', result.childEffects.length, 'childEffects');
      this.processChildEffects(result.childEffects, playerId, cardId);
    }

    // If effect requires target selection and none provided, add to pending
    if (result.success && activateEffect.effects.some(e => e.target && e.target.count)) {
      if (!selectedTargets || selectedTargets.length === 0) {
        // Add to pending effects for target selection
        this.effectEngine.addPendingEffect({
          id: `pending-${Date.now()}`,
          sourceCardId: cardId,
          playerId,
          effect: activateEffect,
          trigger: EffectTrigger.ACTIVATE_MAIN,
          requiresChoice: true,
          priority: 1,
        });
      }
    }

    return result.success;
  }

  // Check if a card can activate its ability (for UI)
  public canActivateAbility(playerId: string, cardId: string): { canActivate: boolean; reason?: string } {
    // Must be in main phase
    if (this.state.phase !== GamePhase.MAIN_PHASE) {
      return { canActivate: false, reason: 'Can only activate during Main Phase' };
    }

    // Must be the active player
    if (this.state.activePlayerId !== playerId) {
      return { canActivate: false, reason: 'Not your turn' };
    }

    const player = this.state.players[playerId];
    if (!player) return { canActivate: false, reason: 'Player not found' };

    // Find the card
    const card = this.findCard(cardId);
    if (!card || card.owner !== playerId) {
      return { canActivate: false, reason: 'Card not found or not yours' };
    }

    // Card must be on field, leader, or stage
    if (card.zone !== CardZone.FIELD && card.zone !== CardZone.LEADER && card.zone !== CardZone.STAGE) {
      return { canActivate: false, reason: 'Card must be on field or stage' };
    }

    // Get card definition and find ACTIVATE_MAIN effect
    const cardDef = this.effectEngine.getCardDefinition(card.cardId);
    if (!cardDef) return { canActivate: false, reason: 'Card definition not found' };

    const activateEffect = cardDef.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
    if (!activateEffect) return { canActivate: false, reason: 'No Activate: Main ability' };

    // Check once-per-turn restriction
    if (activateEffect.oncePerTurn && card.activatedThisTurn) {
      return { canActivate: false, reason: 'Already activated this turn' };
    }

    // Check conditions
    if (activateEffect.conditions) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard: card,
        sourcePlayer: player,
      };

      for (const condition of activateEffect.conditions) {
        if (!this.effectEngine.checkCondition(condition, context)) {
          return { canActivate: false, reason: 'Conditions not met' };
        }
      }
    }

    // Check costs
    if (activateEffect.costs) {
      for (const cost of activateEffect.costs) {
        if (cost.type === 'REST_DON' || cost.type === 'DON') {
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
          if (activeDon.length < (cost.count || 0)) {
            return { canActivate: false, reason: `Need ${cost.count} active DON` };
          }
        } else if (cost.type === 'LIFE') {
          if (player.lifeCards.length < (cost.count || 0)) {
            return { canActivate: false, reason: `Need ${cost.count} life` };
          }
        } else if (cost.type === 'REST_SELF') {
          if (card.state === CardState.RESTED) {
            return { canActivate: false, reason: 'Card is already rested' };
          }
        }
      }
    }

    return { canActivate: true };
  }

  /**
   * Create a sanitized copy of game state for a specific player.
   * Hides opponent's hidden information (hand cardIds, deck, face-down life cards).
   * This prevents cheating by inspecting network requests or console logs.
   */
  // =====================================================
  // EVENT CARD EFFECT RESOLUTION
  // =====================================================

  /**
   * Resolve an event card's [Main] effect with selected targets
   */
  public resolveEventEffect(playerId: string, effectId: string, selectedTargets: string[]): boolean {
    console.log('[resolveEventEffect] Called:', { playerId, effectId, selectedTargets });

    if (this.state.phase !== GamePhase.EVENT_EFFECT_STEP) {
      console.log('[resolveEventEffect] Not in EVENT_EFFECT_STEP');
      return false;
    }

    const pendingEffect = this.state.pendingEventEffects?.find(e => e.id === effectId);
    if (!pendingEffect || pendingEffect.playerId !== playerId) {
      console.log('[resolveEventEffect] Pending effect not found or wrong player');
      return false;
    }

    // Validate targets
    if (!pendingEffect.conditionsMet) {
      console.log('[resolveEventEffect] Conditions not met, effect fizzles');
      this.clearEventEffectState();
      return true;
    }

    const validTargetIds = new Set(pendingEffect.validTargets);
    for (const target of selectedTargets) {
      if (!validTargetIds.has(target)) {
        console.log('[resolveEventEffect] Invalid target:', target);
        return false;
      }
    }

    // Find the source card and its effect
    const sourceCard = this.findCard(pendingEffect.sourceCardId);
    if (!sourceCard) {
      console.log('[resolveEventEffect] Source card not found');
      return false;
    }

    const cardDef = this.effectEngine.getCardDefinition(sourceCard.cardId);
    const mainEffect = cardDef?.effects.find(e => e.trigger === EffectTrigger.MAIN);

    if (mainEffect) {
      // Apply the effect to selected targets
      const player = this.state.players[playerId];
      if (player) {
        const context: EffectContext = {
          gameState: this.state,
          sourceCard: sourceCard,
          sourcePlayer: player,
          selectedTargets: selectedTargets,
        };

        // Execute the effect actions
        for (const action of mainEffect.effects) {
          this.executeEffectAction(action, context, selectedTargets);
        }
      }
    }

    this.clearEventEffectState();
    return true;
  }

  /**
   * Skip an event card's [Main] effect (for optional effects)
   */
  public skipEventEffect(playerId: string, effectId: string): boolean {
    console.log('[skipEventEffect] Called:', { playerId, effectId });

    if (this.state.phase !== GamePhase.EVENT_EFFECT_STEP) {
      return false;
    }

    const pendingEffect = this.state.pendingEventEffects?.find(e => e.id === effectId);
    if (!pendingEffect || pendingEffect.playerId !== playerId) {
      return false;
    }

    // Can only skip optional effects
    if (pendingEffect.minTargets > 0) {
      console.log('[skipEventEffect] Cannot skip non-optional effect');
      return false;
    }

    this.clearEventEffectState();
    return true;
  }

  /**
   * Pay an optional additional cost for an effect
   */
  public payAdditionalCost(playerId: string, costId: string): boolean {
    console.log('[payAdditionalCost] Called:', { playerId, costId });

    if (this.state.phase !== GamePhase.ADDITIONAL_COST_STEP) {
      return false;
    }

    const pendingCost = this.state.pendingAdditionalCost;
    if (!pendingCost || pendingCost.id !== costId || pendingCost.playerId !== playerId) {
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    // Pay the cost
    let costPaid = false;
    switch (pendingCost.costType) {
      case 'REST_DON': {
        const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
        if (activeDon.length >= pendingCost.amount) {
          for (let i = 0; i < pendingCost.amount; i++) {
            activeDon[i].state = CardState.RESTED;
          }
          costPaid = true;
        }
        break;
      }
      case 'TRASH_CARD': {
        // Would need UI to select cards - for now auto-fail if not enough
        console.log('[payAdditionalCost] TRASH_CARD requires card selection');
        return false;
      }
      case 'LIFE': {
        // Would deal damage to self
        if (player.lifeCards.length >= pendingCost.amount) {
          this.takeDamage(playerId, pendingCost.amount);
          costPaid = true;
        }
        break;
      }
    }

    if (costPaid) {
      // Cost paid, now transition to effect resolution
      this.state.pendingAdditionalCost = undefined;
      if (this.state.pendingEventEffects && this.state.pendingEventEffects.length > 0) {
        const pendingEvent = this.state.pendingEventEffects[0];
        if (pendingEvent.conditionsMet && pendingEvent.validTargets.length > 0) {
          this.state.phase = GamePhase.EVENT_EFFECT_STEP;
        } else {
          // Conditions not met or no targets, effect fizzles
          this.clearEventEffectState();
        }
      } else {
        this.state.phase = GamePhase.MAIN_PHASE;
      }
    }

    return costPaid;
  }

  /**
   * Skip an optional additional cost
   */
  public skipAdditionalCost(playerId: string, costId: string): boolean {
    console.log('[skipAdditionalCost] Called:', { playerId, costId });

    if (this.state.phase !== GamePhase.ADDITIONAL_COST_STEP) {
      return false;
    }

    const pendingCost = this.state.pendingAdditionalCost;
    if (!pendingCost || pendingCost.id !== costId || pendingCost.playerId !== playerId) {
      return false;
    }

    // Can only skip optional costs
    if (!pendingCost.optional) {
      return false;
    }

    // Cost skipped, the effect based on this cost doesn't activate
    this.clearEventEffectState();
    return true;
  }

  /**
   * Resolve a counter effect with selected targets
   */
  public resolveCounterEffect(playerId: string, effectId: string, selectedTargets: string[]): boolean {
    console.log('[resolveCounterEffect] Called:', { playerId, effectId, selectedTargets });

    if (this.state.phase !== GamePhase.COUNTER_EFFECT_STEP) {
      return false;
    }

    const pendingEffect = this.state.pendingCounterEffects?.find(e => e.id === effectId);
    if (!pendingEffect || pendingEffect.playerId !== playerId) {
      return false;
    }

    // Validate targets
    if (!pendingEffect.conditionsMet) {
      console.log('[resolveCounterEffect] Conditions not met, effect fizzles');
      this.clearCounterEffectState();
      return true;
    }

    const validTargetIds = new Set(pendingEffect.validTargets);
    for (const target of selectedTargets) {
      if (!validTargetIds.has(target)) {
        console.log('[resolveCounterEffect] Invalid target:', target);
        return false;
      }
    }

    // Apply power buff to selected target
    if (selectedTargets.length > 0 && pendingEffect.powerBoost) {
      for (const targetId of selectedTargets) {
        const targetCard = this.findCard(targetId);
        if (targetCard) {
          // Add power buff for this battle
          if (!targetCard.powerBuffs) {
            targetCard.powerBuffs = [];
          }
          targetCard.powerBuffs.push({
            id: `counter-buff-${Date.now()}`,
            sourceCardId: pendingEffect.sourceCardId,
            value: pendingEffect.powerBoost,
            duration: 'THIS_BATTLE',
            appliedCombatId: this.state.currentCombat?.attackerId,
          });

          console.log('[resolveCounterEffect] Applied +', pendingEffect.powerBoost, 'to', targetId);
        }
      }
    }

    this.clearCounterEffectState();

    // Continue with combat resolution
    this.resolveCombat();
    return true;
  }

  /**
   * Skip a counter effect (optional effects or no valid targets)
   */
  public skipCounterEffect(playerId: string, effectId: string): boolean {
    console.log('[skipCounterEffect] Called:', { playerId, effectId });

    const pendingEffect = this.state.pendingCounterEffects?.find(e => e.id === effectId);
    if (!pendingEffect || pendingEffect.playerId !== playerId) {
      console.log('[skipCounterEffect] No matching pending effect');
      return false;
    }

    // Clear the counter effect state
    this.clearCounterEffectState();

    // Continue with combat resolution
    this.resolveCombat();
    return true;
  }

  /**
   * Clear event effect state and return to main phase
   */
  private clearEventEffectState(): void {
    this.state.pendingEventEffects = undefined;
    this.state.pendingAdditionalCost = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;
  }

  /**
   * Clear counter effect state and continue with combat
   */
  private clearCounterEffectState(): void {
    this.state.pendingCounterEffects = undefined;
    // Don't change phase here - resolveCombat will handle that
  }

  /**
   * Set up a deck reveal effect for "Look at X cards, select Y, trash rest" effects
   */
  public setupDeckRevealEffect(
    playerId: string,
    sourceCardId: string,
    description: string,
    lookCount: number,
    maxSelections: number,
    traitFilter?: string,
    excludeNames?: string[],
    selectAction: 'ADD_TO_HAND' | 'PLAY_TO_FIELD' | 'ADD_TO_LIFE' = 'ADD_TO_HAND',
    remainderAction: 'TRASH' | 'DECK_BOTTOM' | 'SHUFFLE_INTO_DECK' = 'TRASH',
    childEffects?: any[]
  ): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Get top X cards from deck
    const revealedCardIds: string[] = [];
    const selectableCardIds: string[] = [];

    for (let i = 0; i < Math.min(lookCount, player.deck.length); i++) {
      const card = player.deck[i];
      revealedCardIds.push(card.id);

      // Check if card matches the filters
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (cardDef) {
        let matches = true;

        // Check trait filter
        if (traitFilter && cardDef.traits) {
          if (!cardDef.traits.includes(traitFilter)) {
            matches = false;
          }
        }

        // Check name exclusion
        if (excludeNames && excludeNames.includes(cardDef.name)) {
          matches = false;
        }

        if (matches) {
          selectableCardIds.push(card.id);
        }
      }
    }

    console.log('[setupDeckRevealEffect] Revealed:', revealedCardIds.length, 'Selectable:', selectableCardIds.length);

    // Create pending effect
    const pendingEffect: PendingDeckRevealEffect = {
      id: `deck-reveal-${sourceCardId}-${Date.now()}`,
      sourceCardId: sourceCardId,
      playerId: playerId,
      description: description,
      revealedCardIds: revealedCardIds,
      selectableCardIds: selectableCardIds,
      maxSelections: maxSelections,
      minSelections: 0, // "up to X" means 0 minimum
      traitFilter: traitFilter,
      excludeNames: excludeNames,
      selectAction: selectAction,
      remainderAction: remainderAction,
      childEffects: childEffects,
    };

    this.state.pendingDeckRevealEffect = pendingEffect;
    this.state.phase = GamePhase.DECK_REVEAL_STEP;
  }

  /**
   * Resolve deck reveal selection - player chose cards to add to hand
   */
  public resolveDeckReveal(playerId: string, selectedCardIds: string[]): boolean {
    console.log('[resolveDeckReveal] Called:', { playerId, selectedCardIds });

    if (this.state.phase !== GamePhase.DECK_REVEAL_STEP) {
      console.log('[resolveDeckReveal] Not in DECK_REVEAL_STEP');
      return false;
    }

    const pending = this.state.pendingDeckRevealEffect;
    if (!pending || pending.playerId !== playerId) {
      console.log('[resolveDeckReveal] No pending effect or wrong player');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    // Validate selections
    for (const id of selectedCardIds) {
      if (!pending.selectableCardIds.includes(id)) {
        console.log('[resolveDeckReveal] Invalid selection:', id);
        return false;
      }
    }

    if (selectedCardIds.length > pending.maxSelections) {
      console.log('[resolveDeckReveal] Too many selections');
      return false;
    }

    if (selectedCardIds.length < pending.minSelections) {
      console.log('[resolveDeckReveal] Not enough selections');
      return false;
    }

    // Process selected cards based on selectAction
    for (const cardId of selectedCardIds) {
      const cardIndex = player.deck.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = player.deck.splice(cardIndex, 1)[0];

        switch (pending.selectAction) {
          case 'ADD_TO_HAND':
            card.zone = CardZone.HAND;
            player.hand.push(card);
            console.log('[resolveDeckReveal] Added to hand:', card.cardId);
            break;
          case 'PLAY_TO_FIELD':
            card.zone = CardZone.FIELD;
            card.state = CardState.ACTIVE;
            card.turnPlayed = this.state.turn;
            player.field.push(card);
            break;
          case 'ADD_TO_LIFE':
            card.zone = CardZone.LIFE;
            card.faceUp = false;
            player.lifeCards.push(card);
            player.life++;
            break;
        }
      }
    }

    // Handle remaining revealed cards
    for (const cardId of pending.revealedCardIds) {
      if (selectedCardIds.includes(cardId)) continue; // Already handled

      const cardIndex = player.deck.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = player.deck.splice(cardIndex, 1)[0];

        switch (pending.remainderAction) {
          case 'TRASH':
            card.zone = CardZone.TRASH;
            player.trash.push(card);
            console.log('[resolveDeckReveal] Trashed:', card.cardId);
            break;
          case 'DECK_BOTTOM':
            card.zone = CardZone.DECK;
            player.deck.push(card);
            break;
          case 'SHUFFLE_INTO_DECK':
            player.deck.push(card);
            player.deck = this.shuffleArray(player.deck);
            break;
        }
      }
    }

    // Check for childEffects (e.g., "Then, trash 1 card from your hand")
    const childEffects = pending.childEffects;

    // Clear pending deck reveal
    this.state.pendingDeckRevealEffect = undefined;

    // Process childEffects if any
    if (childEffects && childEffects.length > 0) {
      const discardEffect = childEffects.find((e: any) =>
        e.type === 'DISCARD_FROM_HAND' || e.type === EffectType.DISCARD_FROM_HAND
      );

      if (discardEffect && player.hand.length > 0) {
        // Set up hand select for discard
        const discardCount = discardEffect.value || 1;
        console.log('[resolveDeckReveal] Setting up hand discard for', discardCount, 'cards');
        this.setupHandSelectEffect(
          playerId,
          pending.sourceCardId,
          `Trash ${discardCount} card${discardCount > 1 ? 's' : ''} from your hand`,
          'TRASH',
          discardCount,
          discardCount,
          false // Cannot skip - it's mandatory
        );
        return true;
      }
    }

    // No childEffects or player has no cards in hand - return to main phase
    this.state.phase = GamePhase.MAIN_PHASE;
    return true;
  }

  /**
   * Skip deck reveal - send all cards to remainder action
   */
  public skipDeckReveal(playerId: string): boolean {
    console.log('[skipDeckReveal] Called:', { playerId });

    if (this.state.phase !== GamePhase.DECK_REVEAL_STEP) {
      return false;
    }

    const pending = this.state.pendingDeckRevealEffect;
    if (!pending || pending.playerId !== playerId) {
      return false;
    }

    // Can only skip if minSelections is 0
    if (pending.minSelections > 0) {
      console.log('[skipDeckReveal] Cannot skip - minSelections > 0');
      return false;
    }

    // Resolve with empty selection (all cards go to remainder action)
    return this.resolveDeckReveal(playerId, []);
  }

  /**
   * Set up a hand selection effect (discard, return to deck, etc.)
   */
  public setupHandSelectEffect(
    playerId: string,
    sourceCardId: string,
    description: string,
    selectAction: 'TRASH' | 'RETURN_TO_DECK' | 'RETURN_TO_DECK_TOP' | 'RETURN_TO_DECK_BOTTOM',
    minSelections: number,
    maxSelections: number,
    canSkip: boolean
  ): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // If player doesn't have enough cards, adjust requirements
    const adjustedMin = Math.min(minSelections, player.hand.length);
    const adjustedMax = Math.min(maxSelections, player.hand.length);

    console.log('[setupHandSelectEffect] Setting up hand select:', { description, adjustedMin, adjustedMax, handSize: player.hand.length });

    const pendingEffect: PendingHandSelectEffect = {
      id: `hand-select-${sourceCardId}-${Date.now()}`,
      sourceCardId: sourceCardId,
      playerId: playerId,
      description: description,
      selectAction: selectAction,
      minSelections: adjustedMin,
      maxSelections: adjustedMax,
      canSkip: canSkip || adjustedMin === 0,
    };

    this.state.pendingHandSelectEffect = pendingEffect;
    this.state.phase = GamePhase.HAND_SELECT_STEP;
  }

  /**
   * Resolve hand selection - player chose cards to discard/return
   */
  public resolveHandSelect(playerId: string, selectedCardIds: string[]): boolean {
    console.log('[resolveHandSelect] Called:', { playerId, selectedCardIds });

    if (this.state.phase !== GamePhase.HAND_SELECT_STEP) {
      console.log('[resolveHandSelect] Not in HAND_SELECT_STEP');
      return false;
    }

    const pending = this.state.pendingHandSelectEffect;
    if (!pending || pending.playerId !== playerId) {
      console.log('[resolveHandSelect] No pending effect or wrong player');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    // Validate selections are in hand
    for (const id of selectedCardIds) {
      if (!player.hand.some(c => c.id === id)) {
        console.log('[resolveHandSelect] Invalid selection - not in hand:', id);
        return false;
      }
    }

    if (selectedCardIds.length > pending.maxSelections) {
      console.log('[resolveHandSelect] Too many selections');
      return false;
    }

    if (selectedCardIds.length < pending.minSelections) {
      console.log('[resolveHandSelect] Not enough selections');
      return false;
    }

    // Process selected cards based on selectAction
    for (const cardId of selectedCardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = player.hand.splice(cardIndex, 1)[0];

        switch (pending.selectAction) {
          case 'TRASH':
            card.zone = CardZone.TRASH;
            player.trash.push(card);
            console.log('[resolveHandSelect] Trashed:', card.cardId);
            break;
          case 'RETURN_TO_DECK':
          case 'RETURN_TO_DECK_BOTTOM':
            card.zone = CardZone.DECK;
            player.deck.push(card); // Bottom of deck
            console.log('[resolveHandSelect] Returned to deck bottom:', card.cardId);
            break;
          case 'RETURN_TO_DECK_TOP':
            card.zone = CardZone.DECK;
            player.deck.unshift(card); // Top of deck
            console.log('[resolveHandSelect] Returned to deck top:', card.cardId);
            break;
        }
      }
    }

    // If this was a cost payment, execute the pending effect
    if (pending.isCostPayment && pending.pendingEffectId && pending.sourceCardInstanceId) {
      console.log('[resolveHandSelect] Cost paid, executing pending effect:', pending.pendingEffectId);

      // Find the source card
      const sourceCard = this.findCard(pending.sourceCardInstanceId);
      if (sourceCard) {
        // Get the card definition and effect
        const cardDef = this.effectEngine.getCardDefinition(pending.sourceCardId);
        if (cardDef) {
          const effect = cardDef.effects.find(e => e.id === pending.pendingEffectId);
          if (effect) {
            // Execute the effect
            const context: EffectContext = {
              gameState: this.state,
              sourceCard: sourceCard,
              sourcePlayer: player,
            };

            console.log('[resolveHandSelect] Resolving effect:', effect.id);
            this.effectEngine.resolveEffect(effect, context);
          }
        }
      }
    }

    // Clear pending and return to main phase
    this.state.pendingHandSelectEffect = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;

    return true;
  }

  /**
   * Skip hand selection (only if allowed)
   */
  public skipHandSelect(playerId: string): boolean {
    console.log('[skipHandSelect] Called:', { playerId });

    if (this.state.phase !== GamePhase.HAND_SELECT_STEP) {
      return false;
    }

    const pending = this.state.pendingHandSelectEffect;
    if (!pending || pending.playerId !== playerId) {
      return false;
    }

    if (!pending.canSkip) {
      console.log('[skipHandSelect] Cannot skip - effect is mandatory');
      return false;
    }

    // Clear pending and return to main phase
    this.state.pendingHandSelectEffect = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;

    return true;
  }

  /**
   * Process childEffects from "Then" clauses
   * Handles effects that need player choice vs auto-execute
   * Supports recursion with depth limit of 3
   */
  private processChildEffects(
    childEffects: PendingEffect[],
    playerId: string,
    sourceCardId: string,
    depth: number = 0
  ): void {
    const MAX_DEPTH = 3;
    if (depth >= MAX_DEPTH) {
      console.warn('[processChildEffects] Max recursion depth reached:', depth);
      return;
    }

    console.log('[processChildEffects] Processing', childEffects.length, 'effects at depth', depth);

    for (const childEffect of childEffects) {
      const effectAction = childEffect.effect.effects[0];
      if (!effectAction) continue;

      // Determine if this childEffect needs player choice
      if (this.childEffectNeedsChoice(effectAction)) {
        this.setupChildEffectChoice(effectAction, playerId, sourceCardId);
      } else {
        this.executeChildEffectImmediately(effectAction, playerId, sourceCardId, depth);
      }
    }
  }

  /**
   * Check if a childEffect requires player choice
   */
  private childEffectNeedsChoice(effect: EffectAction): boolean {
    const choiceEffects = [
      EffectType.DISCARD_FROM_HAND,
      EffectType.RETURN_TO_HAND,
      EffectType.KO_CHARACTER,
      EffectType.BUFF_POWER,
      EffectType.DEBUFF_POWER,
      EffectType.REST_CHARACTER,
      EffectType.KO_COST_OR_LESS,
      EffectType.KO_POWER_OR_LESS,
      EffectType.SEND_TO_DECK_BOTTOM,
      EffectType.SEND_TO_DECK_TOP,
      EffectType.SEND_TO_TRASH,
    ];
    return choiceEffects.includes(effect.type);
  }

  /**
   * Set up a childEffect that requires player choice
   */
  private setupChildEffectChoice(
    effect: EffectAction,
    playerId: string,
    sourceCardId: string
  ): void {
    console.log('[setupChildEffectChoice] Setting up choice for:', effect.type);

    switch (effect.type) {
      case EffectType.DISCARD_FROM_HAND: {
        const discardCount = effect.value || 1;
        this.setupHandSelectEffect(
          playerId,
          sourceCardId,
          `Trash ${discardCount} card${discardCount > 1 ? 's' : ''} from your hand`,
          'TRASH',
          discardCount,
          discardCount,
          false // Not optional for "then" effects
        );
        break;
      }

      case EffectType.RETURN_TO_HAND: {
        // This would require target selection from field - needs different UI
        console.warn('[setupChildEffectChoice] RETURN_TO_HAND childEffect not yet fully implemented');
        break;
      }

      case EffectType.KO_CHARACTER:
      case EffectType.KO_COST_OR_LESS:
      case EffectType.KO_POWER_OR_LESS: {
        // These require target selection - would need to set up pending effect for target selection
        console.warn('[setupChildEffectChoice] KO childEffect requires target selection - not yet implemented');
        break;
      }

      case EffectType.BUFF_POWER:
      case EffectType.DEBUFF_POWER: {
        // These require target selection
        console.warn('[setupChildEffectChoice] Buff/Debuff childEffect requires target selection - not yet implemented');
        break;
      }

      default:
        console.warn('[setupChildEffectChoice] Unhandled choice effect type:', effect.type);
    }
  }

  /**
   * Execute a childEffect immediately (no player choice required)
   */
  private executeChildEffectImmediately(
    effect: EffectAction,
    playerId: string,
    sourceCardId: string,
    depth: number
  ): void {
    console.log('[executeChildEffectImmediately] Executing:', effect.type);

    const player = this.state.players[playerId];
    if (!player) return;

    switch (effect.type) {
      case EffectType.DRAW_CARDS: {
        const drawCount = effect.value || 1;
        this.drawCards(playerId, drawCount);
        console.log('[executeChildEffectImmediately] Drew', drawCount, 'cards');
        break;
      }

      case EffectType.BUFF_SELF: {
        const card = this.findCard(sourceCardId);
        if (card) {
          // Add power buff
          const buffValue = effect.value || 0;
          card.power = (card.power || 0) + buffValue;
          console.log('[executeChildEffectImmediately] Buffed self by', buffValue);
        }
        break;
      }

      case EffectType.ADD_TO_LIFE: {
        const addCount = effect.value || 1;
        for (let i = 0; i < addCount && player.deck.length > 0; i++) {
          const card = player.deck.shift()!;
          card.zone = CardZone.LIFE;
          card.faceUp = false;
          player.lifeCards.push(card);
          player.life++;
        }
        console.log('[executeChildEffectImmediately] Added', addCount, 'to life');
        break;
      }

      case EffectType.ACTIVE_DON: {
        const activateCount = effect.value || 1;
        let activated = 0;
        for (const don of player.donField) {
          if (don.state === CardState.RESTED && activated < activateCount) {
            don.state = CardState.ACTIVE;
            activated++;
          }
        }
        console.log('[executeChildEffectImmediately] Activated', activated, 'DON');
        break;
      }

      default:
        console.warn('[executeChildEffectImmediately] Unhandled auto effect type:', effect.type);
    }

    // Check if this effect also has childEffects (recursive)
    if (effect.childEffects && effect.childEffects.length > 0) {
      console.log('[executeChildEffectImmediately] Found nested childEffects:', effect.childEffects.length);
      const nestedPendingEffects: PendingEffect[] = effect.childEffects.map((childAction, index) => ({
        id: `nested-child-${Date.now()}-${index}`,
        sourceCardId: sourceCardId,
        playerId: playerId,
        effect: {
          id: `nested-effect-${Date.now()}-${index}`,
          trigger: EffectTrigger.IMMEDIATE,
          effects: [childAction],
          description: `Nested effect: ${childAction.type}`,
        },
        trigger: EffectTrigger.IMMEDIATE,
        requiresChoice: this.childEffectNeedsChoice(childAction),
        priority: 0,
      }));
      this.processChildEffects(nestedPendingEffects, playerId, sourceCardId, depth + 1);
    }
  }

  /**
   * Execute a single effect action on targets
   */
  private executeEffectAction(action: EffectAction, context: EffectContext, targetIds: string[]): void {
    console.log('[executeEffectAction]', action.type, 'on targets:', targetIds);

    switch (action.type) {
      case EffectType.KO_CHARACTER: {
        // K.O. the target(s)
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            // Move card to trash
            const owner = this.state.players[targetCard.owner];
            if (owner) {
              // Remove from field or stage
              if (targetCard.zone === CardZone.FIELD) {
                const index = owner.field.findIndex(c => c.id === targetId);
                if (index !== -1) {
                  owner.field.splice(index, 1);
                }
              } else if (targetCard.zone === CardZone.STAGE) {
                if (owner.stage?.id === targetId) {
                  owner.stage = null;
                }
              }

              targetCard.zone = CardZone.TRASH;
              owner.trash.push(targetCard);
              console.log('[executeEffectAction] K.O.d card:', targetCard.cardId);
            }
          }
        }
        break;
      }
      case EffectType.BUFF_POWER: {
        // Apply power buff to targets
        const buffValue = action.value || 0;
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            if (!targetCard.powerBuffs) {
              targetCard.powerBuffs = [];
            }
            targetCard.powerBuffs.push({
              id: `event-buff-${Date.now()}`,
              sourceCardId: context.sourceCard.id,
              value: buffValue,
              duration: action.duration === 'UNTIL_END_OF_BATTLE' ? 'THIS_BATTLE' : 'THIS_TURN',
            });
          }
        }
        break;
      }
      // Add more effect types as needed
      default:
        console.log('[executeEffectAction] Unhandled effect type:', action.type);
    }
  }

  public sanitizeStateForPlayer(playerId: string): GameState {
    const state = this.getState();
    const sanitizedState = JSON.parse(JSON.stringify(state)) as GameState;

    for (const [id, player] of Object.entries(sanitizedState.players)) {
      if (id !== playerId) {
        // Hide opponent's hand card IDs (keep structure for count)
        player.hand = player.hand.map((card, index) => ({
          ...card,
          cardId: 'hidden',  // Hide the actual card ID
          id: `hidden-hand-${index}`,  // Replace ID to prevent correlation
        }));

        // Hide opponent's deck completely (just keep count info)
        const deckCount = player.deck.length;
        player.deck = Array(deckCount).fill(null).map((_, i) => ({
          id: `hidden-deck-${i}`,
          cardId: 'hidden',
          zone: CardZone.DECK,
          state: CardState.ACTIVE,
          owner: id,
        }));

        // Hide face-down life cards (keep faceUp ones visible)
        player.lifeCards = player.lifeCards.map((card, index) => ({
          ...card,
          cardId: card.faceUp ? card.cardId : 'hidden',
          id: card.faceUp ? card.id : `hidden-life-${index}`,
        }));
      }
    }

    return sanitizedState;
  }
}