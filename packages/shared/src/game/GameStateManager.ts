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
  PendingPlayEffect,
  ChoiceOption,
  CardRestriction,
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
  extractSearchAndSelectDetails,
  EffectCost,
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
      turnCount: 0,  // Start at 0 so after first startTurn increment it becomes 1
      extraTurns: 0,
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

    // Re-evaluate continuous effects so newly drawn cards get cost reductions etc.
    if (drawnCards.length > 0) {
      this.reapplyContinuousEffects();
    }

    return drawnCards;
  }

  /**
   * Re-evaluate continuous effects using the active player as turn owner.
   * This keeps [Your Turn]/[Opponent's Turn] polarity correct regardless of
   * which player triggered the state change (draw/effect resolution/etc.).
   */
  private reapplyContinuousEffects(): void {
    const activePlayerId = this.state.activePlayerId;
    if (!activePlayerId || !this.state.players[activePlayerId]) return;
    this.applyStageEffects(activePlayerId);
  }

  /**
   * Activate/choice flows often pay costs in GameStateManager before calling
   * EffectEngine. Strip costs for that second resolution pass to avoid
   * double-payment checks.
   */
  private stripPrepaidCosts(effect: CardEffectDefinition): CardEffectDefinition {
    if (!effect.costs || effect.costs.length === 0) return effect;
    return {
      ...effect,
      costs: undefined,
    };
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
    const cardCost = card.modifiedCost ?? cardDef?.cost ?? 0;

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

    // Copy static keywords from card definition to runtime card instance.
    if (cardDef?.keywords?.length) {
      const existingKeywords = new Set(card.keywords ?? []);
      for (const keyword of cardDef.keywords) {
        existingKeywords.add(keyword);
      }
      card.keywords = Array.from(existingKeywords);
    }

    if (targetZone === CardZone.FIELD) {
      player.field.push(card);

      // Re-evaluate continuous effects so new character gets stage/continuous buffs
      this.reapplyContinuousEffects();

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
        const conditionsMet = this.checkEffectConditions(searchSelectEffect.effect, playerId, card);

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
        // Check if the first effect has a cost that requires card selection
        const firstEffect = effectsRequiringChoice[0];
        const trashCost = firstEffect.effect.costs?.find(c =>
          c.type === 'TRASH_CARD' || c.type === 'TRASH_FROM_HAND' ||
          c.type === 'TRASH_CHARACTER' || c.alternatives
        );

        if (trashCost) {
          const isOptional = trashCost.optional === true;

          // Check if cost has alternatives (e.g., "trash 1 Character OR 1 card from hand")
          if (trashCost.alternatives && trashCost.alternatives.length > 0) {
            // Set up choice between alternatives
            const options: ChoiceOption[] = trashCost.alternatives.map((alt, idx) => {
              const canPay = this.canPaySingleCost(alt, player);
              const label = this.describeCost(alt);
              return {
                id: `cost-${idx}`,
                label,
                enabled: canPay,
                disabledReason: canPay ? undefined : 'Cannot pay this cost'
              };
            });

            // Optional alternative costs can be explicitly skipped.
            if (isOptional) {
              options.push({
                id: 'cost-skip',
                label: 'Do not pay this cost (skip effect)',
                enabled: true,
              });
            }

            // Check if at least one option can be paid
            const anyCanPay = options.some(o => o.enabled);
            if (!anyCanPay && !isOptional) {
              console.log('[playCard] Cannot pay any cost alternative, effect fizzles');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else if (!anyCanPay && isOptional) {
              console.log('[playCard] Cannot pay optional cost alternatives, skipping effect');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else {
              console.log('[playCard] Effect has cost alternatives, entering CHOICE_STEP');
              this.state.pendingChoiceEffect = {
                id: `cost-choice-${Date.now()}`,
                sourceCardId: firstEffect.sourceCardId,
                playerId: playerId,
                description: 'Choose which cost to pay',
                choiceType: 'COST_ALTERNATIVE',
                options,
                minSelections: 1,
                maxSelections: 1,
                pendingEffectId: firstEffect.id
              };
              this.state.phase = GamePhase.CHOICE_STEP;
              return true;
            }
          } else if (trashCost.type === 'TRASH_CHARACTER') {
            // Field character selection
            const validTargets = this.getValidFieldCharactersForCost(trashCost, player);
            const canPayCost = validTargets.length >= (trashCost.count || 1);

            if (!canPayCost && !isOptional) {
              console.log('[playCard] Cannot pay required field trash cost, effect fizzles');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else if (!canPayCost && isOptional) {
              console.log('[playCard] Cannot pay optional field trash cost, skipping effect');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else {
              console.log('[playCard] Effect has field trash cost, entering FIELD_SELECT_STEP');
              const traitDesc = trashCost.traitFilter ? ` ${trashCost.traitFilter}` : '';
              this.state.pendingFieldSelectEffect = {
                id: `field-cost-${Date.now()}`,
                sourceCardId: firstEffect.sourceCardId,
                playerId: playerId,
                description: `Trash ${trashCost.count || 1}${traitDesc} Character(s) to activate effect`,
                selectAction: 'TRASH',
                validTargetIds: validTargets,
                minSelections: isOptional ? 0 : (trashCost.count || 1),
                maxSelections: trashCost.count || 1,
                traitFilter: trashCost.traitFilter,
                canSkip: isOptional,
                isCostPayment: true,
                pendingEffectId: firstEffect.id
              };
              this.state.phase = GamePhase.FIELD_SELECT_STEP;
              return true;
            }
          } else {
            // Regular hand trash cost (existing flow)
            const canPayCost = player.hand.length >= (trashCost.count || 1);

            if (!canPayCost && !isOptional) {
              console.log('[playCard] Cannot pay required trash cost, effect fizzles');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else if (!canPayCost && isOptional) {
              console.log('[playCard] Cannot pay optional trash cost, skipping effect');
              this.effectEngine.removePendingEffect(firstEffect.id);
            } else {
              // Set up cost payment via HAND_SELECT_STEP
              console.log('[playCard] Effect has trash cost, entering HAND_SELECT_STEP');
              const pendingCostPayment: PendingHandSelectEffect = {
                id: `cost-payment-${Date.now()}`,
                sourceCardId: firstEffect.sourceCardId,
                playerId: playerId,
                description: `Trash ${trashCost.count || 1} card(s) from your hand to activate effect`,
                selectAction: 'TRASH',
                minSelections: isOptional ? 0 : (trashCost.count || 1),
                maxSelections: trashCost.count || 1,
                canSkip: isOptional,
                isCostPayment: true,
                pendingEffectId: firstEffect.id,
                sourceCardInstanceId: card.id
              };

              this.state.pendingHandSelectEffect = pendingCostPayment;
              this.state.phase = GamePhase.HAND_SELECT_STEP;
              return true;
            }
          }
        }

        // Build pending play effects with valid targets (no cost or cost already handled)
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
      this.reapplyContinuousEffects();

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
          const conditionsMet = this.checkEffectConditions(mainEffect, playerId, card);
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
          const conditionsMet = this.checkEffectConditions(mainEffect, playerId, card);

          // Check for additional costs (e.g., "You may rest 1 DON")
          const additionalCost = this.extractAdditionalCost(mainEffect, playerId);

          // Get valid targets for the effect
          const validTargets = this.getValidTargetsForEventEffect(mainEffect, playerId, card);
          const firstAction = mainEffect.effects[0];
          const hasTarget = Boolean(firstAction?.target);
          const maxTargets = hasTarget
            ? (firstAction?.target?.maxCount || firstAction?.target?.count || 1)
            : 0;
          const minTargets = hasTarget
            ? (firstAction?.target?.optional ? 0 : 1)
            : 0;

          // Create pending event effect
          const pendingEvent: PendingEventEffect = {
            id: `event-${card.id}-${Date.now()}`,
            sourceCardId: card.id,
            playerId: playerId,
            description: mainEffect.description || 'Activate event [Main] ability',
            validTargets: validTargets,
            effectType: firstAction?.type.toString() || 'UNKNOWN',
            maxTargets: maxTargets,
            minTargets: minTargets,
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
          else if (conditionsMet && (maxTargets === 0 || validTargets.length > 0)) {
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
  private checkEffectConditions(effect: CardEffectDefinition, playerId: string, sourceCard?: GameCard): boolean {
    if (!effect.conditions || effect.conditions.length === 0) {
      return true; // No conditions, always met
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    const context: EffectContext = {
      gameState: this.state,
      sourceCard: this.getEffectContextSourceCard(player, sourceCard),
      sourcePlayer: player,
    };

    for (const condition of effect.conditions) {
      if (!this.effectEngine.checkCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  private getEffectContextSourceCard(player: PlayerState, sourceCard?: GameCard): GameCard {
    if (sourceCard) {
      return sourceCard;
    }

    if (player.leaderCard) {
      return player.leaderCard;
    }

    return {
      id: `virtual-source-${player.id}`,
      cardId: player.leaderId || 'virtual-card',
      zone: CardZone.LEADER,
      state: CardState.ACTIVE,
      owner: player.id,
    };
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
  private getValidTargetsForEventEffect(effect: CardEffectDefinition, playerId: string, sourceCard?: GameCard): string[] {
    const player = this.state.players[playerId];
    if (!player) return [];

    const effectAction = effect.effects[0];
    if (!effectAction || !effectAction.target) return [];

    const context: EffectContext = {
      gameState: this.state,
      sourceCard: this.getEffectContextSourceCard(player, sourceCard),
      sourcePlayer: player,
    };

    return this.effectEngine.getValidTargets(effectAction, context);
  }

  private resolveEffectWithEngine(
    effect: CardEffectDefinition,
    sourceCard: GameCard,
    sourcePlayer: PlayerState,
    selectedTargets: string[] = [],
    ignoreCosts: boolean = false
  ): boolean {
    const context: EffectContext = {
      gameState: this.state,
      sourceCard,
      sourcePlayer,
      selectedTargets,
    };

    const effectToResolve = ignoreCosts
      ? { ...effect, costs: undefined }
      : effect;

    const result = this.effectEngine.resolveEffect(effectToResolve, context);
    if (result.childEffects?.length) {
      this.processChildEffects(result.childEffects, sourcePlayer.id, sourceCard.id);
    }
    this.reapplyContinuousEffects();

    return result.success;
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
    this.resetContinuousEffectState(playerId);
  }

  /**
   * Clear continuous-effect-only state from a card so it can be recalculated.
   */
  private resetContinuousCardState(card: GameCard): void {
    card.hasRushVsCharacters = undefined;
    card.modifiedCost = undefined;
    card.continuousKeywords = undefined;

    if (card.originalBasePower !== undefined) {
      card.basePower = card.originalBasePower;
      card.originalBasePower = undefined;
    }

    if (card.immunities) {
      card.immunities = card.immunities.filter(i => i.duration !== 'STAGE_CONTINUOUS');
      if (card.immunities.length === 0) {
        card.immunities = undefined;
      }
    }

    if (card.restrictions) {
      card.restrictions = card.restrictions.filter(r => r.source !== 'STAGE_CONTINUOUS');
      if (card.restrictions.length === 0) {
        card.restrictions = undefined;
      }
    }
  }

  /**
   * Reset stage/continuous-derived state for one player before reapplying effects.
   */
  private resetContinuousEffectState(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    for (const card of player.hand) {
      card.modifiedCost = undefined;
    }

    this.clearStagePowerBuffs(playerId);

    for (const card of player.field) {
      this.resetContinuousCardState(card);
    }

    if (player.leaderCard) {
      this.resetContinuousCardState(player.leaderCard);
    }

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
   * Apply all continuous [Your Turn] effects for a player
   * Called at start of turn, after playing a stage, and when relevant conditions change
   * Effects are now loaded from the database via effectEngine.getCardDefinition()
   * Processes STAGE, CHARACTER, and LEADER cards with YOUR_TURN/OPPONENT_TURN/PASSIVE triggers
   */
  private applyStageEffects(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Determine if it's this player's turn
    const isMyTurn = this.state.activePlayerId === playerId;
    const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
    const opponent = opponentId ? this.state.players[opponentId] : undefined;

    // Always recalculate continuous effects from a clean baseline for both players.
    this.resetContinuousEffectState(playerId);
    if (opponentId) {
      this.resetContinuousEffectState(opponentId);
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

    // Process CHARACTER cards on field with continuous effects (YOUR_TURN, PASSIVE)
    for (const card of player.field) {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef?.effects) continue;

      for (const effect of cardDef.effects) {
        const trigger = effect.trigger;
        // Process YOUR_TURN when it's player's turn, PASSIVE always, OPPONENT_TURN when not player's turn
        const shouldApply =
          trigger === EffectTrigger.PASSIVE ||
          (trigger === EffectTrigger.YOUR_TURN && isMyTurn) ||
          (trigger === EffectTrigger.OPPONENT_TURN && !isMyTurn);

        if (shouldApply) {
          this.applySingleStageEffect(player, effect, card.id);
        }
      }
    }

    // Process LEADER card with continuous effects (YOUR_TURN, PASSIVE, OPPONENT_TURN)
    if (player.leaderCard) {
      const leaderDef = this.effectEngine.getCardDefinition(player.leaderCard.cardId);
      if (leaderDef?.effects) {
        for (const effect of leaderDef.effects) {
          const trigger = effect.trigger;
          const shouldApply =
            trigger === EffectTrigger.PASSIVE ||
            (trigger === EffectTrigger.YOUR_TURN && isMyTurn) ||
            (trigger === EffectTrigger.OPPONENT_TURN && !isMyTurn);

          if (shouldApply) {
            this.applySingleStageEffect(player, effect, player.leaderCard.id);
          }
        }
      }
    }

    // Process opponent's continuous effects that apply when it's OUR turn
    // (their OPPONENT_TURN effects activate when it's our turn)
    if (opponentId && opponent) {
      // Process opponent's STAGE with OPPONENT_TURN effects (when it's our turn)
      if (opponent.stage) {
        const stageDef = this.effectEngine.getCardDefinition(opponent.stage.cardId);
        if (stageDef?.effects) {
          for (const effect of stageDef.effects) {
            const shouldApply =
              effect.trigger === EffectTrigger.PASSIVE ||
              (effect.trigger === EffectTrigger.OPPONENT_TURN && isMyTurn);

            if (shouldApply) {
              this.applySingleStageEffect(opponent, effect, opponent.stage.id);
              if (opponent.stage) {
                opponent.stage.hasActiveEffect = true;
              }
            }
          }
        }
      }

      // Process opponent's CHARACTER cards with OPPONENT_TURN effects (when it's our turn)
      for (const card of opponent.field) {
        const cardDef = this.effectEngine.getCardDefinition(card.cardId);
        if (!cardDef?.effects) continue;

        for (const effect of cardDef.effects) {
          // Opponent's OPPONENT_TURN effects apply when it's OUR turn
          // Also check PASSIVE for opponent's cards
          const shouldApply =
            effect.trigger === EffectTrigger.PASSIVE ||
            (effect.trigger === EffectTrigger.OPPONENT_TURN && isMyTurn);

          if (shouldApply) {
            this.applySingleStageEffect(opponent, effect, card.id);
          }
        }
      }

      // Process opponent's LEADER with OPPONENT_TURN effects (when it's our turn)
      if (opponent.leaderCard) {
        const leaderDef = this.effectEngine.getCardDefinition(opponent.leaderCard.cardId);
        if (leaderDef?.effects) {
          for (const effect of leaderDef.effects) {
            const shouldApply =
              effect.trigger === EffectTrigger.PASSIVE ||
              (effect.trigger === EffectTrigger.OPPONENT_TURN && isMyTurn);

            if (shouldApply) {
              this.applySingleStageEffect(opponent, effect, opponent.leaderCard.id);
            }
          }
        }
      }
    }
  }

  /**
   * Apply a single continuous effect to a player's cards
   * Works for STAGE, CHARACTER, and LEADER card effects
   * Returns true if any cards were affected
   */
  private applySingleStageEffect(
    player: PlayerState,
    effect: CardEffectDefinition,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;

    // Find the source card (could be stage, character, or leader)
    let sourceCard: GameCard | undefined | null = player.stage;
    if (player.leaderCard?.id === sourceCardId) {
      sourceCard = player.leaderCard;
    } else {
      const fieldCard = player.field.find(c => c.id === sourceCardId);
      if (fieldCard) {
        sourceCard = fieldCard;
      }
    }

    // Check conditions
    if (effect.conditions && sourceCard) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard: sourceCard,
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

        case EffectType.SET_BASE_POWER:
          hadEffect = this.applySetBasePower(player, action, sourceCardId) || hadEffect;
          break;

        case EffectType.DEBUFF_COST:
          // Apply cost debuff - can target own or opponent's cards
          if (action.target?.type === TargetType.OPPONENT_FIELD ||
              action.target?.type === TargetType.OPPONENT_CHARACTER ||
              action.target?.type === TargetType.ALL_CHARACTERS) {
            const opponentId = Object.keys(this.state.players).find(id => id !== player.id);
            if (opponentId) {
              const opponent = this.state.players[opponentId];
              hadEffect = this.applyFieldCostDebuff(opponent, action, sourceCardId) || hadEffect;
            }
          } else {
            hadEffect = this.applyFieldCostDebuff(player, action, sourceCardId) || hadEffect;
          }
          break;

        case EffectType.DEBUFF_POWER:
          // Apply power debuff - can target own or opponent's cards
          if (action.target?.type === TargetType.OPPONENT_FIELD ||
              action.target?.type === TargetType.OPPONENT_CHARACTER ||
              action.target?.type === TargetType.ALL_CHARACTERS) {
            const opponentId = Object.keys(this.state.players).find(id => id !== player.id);
            if (opponentId) {
              const opponent = this.state.players[opponentId];
              hadEffect = this.applyFieldPowerDebuff(opponent, action, sourceCardId) || hadEffect;
            }
          } else {
            hadEffect = this.applyFieldPowerDebuff(player, action, sourceCardId) || hadEffect;
          }
          break;

        case EffectType.GRANT_KEYWORD:
          // Grant keyword to matching cards (e.g., Double Attack, Rush, Banish)
          hadEffect = this.applyGrantKeyword(player, action, sourceCardId) || hadEffect;
          break;

        case EffectType.IMMUNE_KO:
          // Grant KO immunity to matching cards
          hadEffect = this.applyKOImmunity(player, action, sourceCardId) || hadEffect;
          break;

        case EffectType.CANT_ATTACK:
          // Apply attack restriction
          hadEffect = this.applyAttackRestriction(player, action, sourceCardId) || hadEffect;
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
   * Apply SET_BASE_POWER effect to matching cards on field
   * Stores original power for cleanup at end of turn
   */
  private applySetBasePower(
    player: PlayerState,
    action: EffectAction,
    _sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];
    const newBasePower = action.value || 0;

    // Process field characters
    for (const card of player.field) {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) continue;

      // Check filters (e.g., TRAIT: "Five Elders")
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => cardDef.traits?.includes(t))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'TYPE') {
          const types = filter.value as string[];
          if (!types.includes(cardDef.type)) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        // Store original power if not already stored
        if (card.originalBasePower === undefined) {
          card.originalBasePower = card.basePower ?? cardDef.power ?? 0;
        }
        // Set the new base power
        card.basePower = newBasePower;
        hadEffect = true;
      }
    }

    return hadEffect;
  }

  /**
   * Apply cost debuff to cards on a player's field
   * Used for continuous effects like "[Your Turn] Give all opponent's Characters -5 cost"
   */
  private applyFieldCostDebuff(
    player: PlayerState,
    action: EffectAction,
    _sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];
    const costReduction = action.value || 0;

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
        if (filter.property === 'TYPE') {
          const types = filter.value as string[];
          if (!types.includes(cardDef.type)) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        // Apply cost debuff cumulatively (multiple continuous sources can stack).
        const baseCost = cardDef.cost ?? 0;
        const currentModified = card.modifiedCost ?? baseCost;
        card.modifiedCost = Math.max(0, currentModified - costReduction);
        hadEffect = true;
      }
    }

    return hadEffect;
  }

  /**
   * Apply power debuff to cards on a player's field
   * Used for continuous effects like "[Your Turn] Give all opponent's Characters -1000 power"
   */
  private applyFieldPowerDebuff(
    player: PlayerState,
    action: EffectAction,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];
    const powerDebuff = -(action.value || 0); // Negative value for debuff

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
        if (filter.property === 'TYPE') {
          const types = filter.value as string[];
          if (!types.includes(cardDef.type)) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        // Add power debuff as a STAGE_CONTINUOUS buff (will be cleared at turn end)
        if (!card.powerBuffs) {
          card.powerBuffs = [];
        }
        card.powerBuffs.push({
          id: `continuous-debuff-${sourceCardId}-${card.id}`,
          sourceCardId: sourceCardId,
          value: powerDebuff,
          duration: 'STAGE_CONTINUOUS',
        });
        hadEffect = true;
      }
    }

    // Also apply to leader if targeting leader or all
    if (action.target?.type === TargetType.OPPONENT_LEADER_OR_CHARACTER ||
        action.target?.type === TargetType.OPPONENT_LEADER) {
      if (player.leaderCard) {
        if (!player.leaderCard.powerBuffs) {
          player.leaderCard.powerBuffs = [];
        }
        player.leaderCard.powerBuffs.push({
          id: `continuous-debuff-${sourceCardId}-leader`,
          sourceCardId: sourceCardId,
          value: powerDebuff,
          duration: 'STAGE_CONTINUOUS',
        });
        hadEffect = true;
      }
    }

    return hadEffect;
  }

  /**
   * Apply keyword grant to cards on a player's field
   * Used for continuous effects like "[Your Turn] This Character gains [Double Attack]"
   */
  private applyGrantKeyword(
    player: PlayerState,
    action: EffectAction,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];
    const keyword = action.keyword || '';
    const targetType = action.target?.type;

    if (!keyword) return false;

    const matchesFilters = (card: GameCard): boolean => {
      const cardDef = this.effectEngine.getCardDefinition(card.cardId);
      if (!cardDef) return false;

      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => cardDef.traits?.includes(t))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'TYPE') {
          const types = filter.value as string[];
          if (!types.includes(cardDef.type)) {
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
      return matches;
    };

    const addKeyword = (card: GameCard): void => {
      if (!matchesFilters(card)) return;

      if (!card.continuousKeywords) {
        card.continuousKeywords = [];
      }
      if (!card.continuousKeywords.includes(keyword)) {
        card.continuousKeywords.push(keyword);
        hadEffect = true;
      }
    };

    const opponentId = Object.keys(this.state.players).find(id => id !== player.id);
    const opponent = opponentId ? this.state.players[opponentId] : undefined;

    if (targetType === TargetType.SELF) {
      const sourceCard = player.field.find(c => c.id === sourceCardId) ||
        (player.leaderCard?.id === sourceCardId ? player.leaderCard : null);
      if (sourceCard) {
        addKeyword(sourceCard);
      }
      return hadEffect;
    }

    const applyToField = (field: GameCard[]) => {
      for (const card of field) {
        addKeyword(card);
      }
    };

    switch (targetType) {
      case TargetType.YOUR_LEADER:
        if (player.leaderCard) addKeyword(player.leaderCard);
        break;
      case TargetType.YOUR_CHARACTER:
      case TargetType.YOUR_FIELD:
        applyToField(player.field);
        break;
      case TargetType.YOUR_LEADER_OR_CHARACTER:
        if (player.leaderCard) addKeyword(player.leaderCard);
        applyToField(player.field);
        break;
      case TargetType.OPPONENT_LEADER:
        if (opponent?.leaderCard) addKeyword(opponent.leaderCard);
        break;
      case TargetType.OPPONENT_CHARACTER:
      case TargetType.OPPONENT_FIELD:
        if (opponent) applyToField(opponent.field);
        break;
      case TargetType.OPPONENT_LEADER_OR_CHARACTER:
        if (opponent?.leaderCard) addKeyword(opponent.leaderCard);
        if (opponent) applyToField(opponent.field);
        break;
      case TargetType.ANY_LEADER:
        if (player.leaderCard) addKeyword(player.leaderCard);
        if (opponent?.leaderCard) addKeyword(opponent.leaderCard);
        break;
      case TargetType.ANY_CHARACTER:
      case TargetType.ALL_CHARACTERS:
        applyToField(player.field);
        if (opponent) applyToField(opponent.field);
        break;
      default:
        applyToField(player.field);
    }

    return hadEffect;
  }

  /**
   * Apply KO immunity to cards on a player's field
   * Used for continuous effects like "[Opponent's Turn] cannot be K.O.'d by effects"
   */
  private applyKOImmunity(
    player: PlayerState,
    action: EffectAction,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const filters = action.target?.filters || [];
    const targetType = action.target?.type;

    // If targeting self, apply to source card
    if (targetType === TargetType.SELF) {
      const sourceCard = player.field.find(c => c.id === sourceCardId) ||
                         (player.leaderCard?.id === sourceCardId ? player.leaderCard : null);
      if (sourceCard) {
        if (!sourceCard.immunities) {
          sourceCard.immunities = [];
        }
        // Add KO immunity if not already present
        if (!sourceCard.immunities.some(i => i.type === 'KO' && i.duration === 'STAGE_CONTINUOUS' && i.sourceCardId === sourceCardId)) {
          sourceCard.immunities.push({
            type: 'KO',
            source: action.immuneFrom || 'EFFECTS',
            duration: 'STAGE_CONTINUOUS',
            sourceCardId,
          });
          hadEffect = true;
        }
      }
      return hadEffect;
    }

    // Apply to matching cards on field
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
        if (filter.property === 'COST') {
          const costValue = filter.value as number;
          if (cardDef.cost !== costValue) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        if (!card.immunities) {
          card.immunities = [];
        }
        if (!card.immunities.some(i => i.type === 'KO' && i.duration === 'STAGE_CONTINUOUS' && i.sourceCardId === sourceCardId)) {
          card.immunities.push({
            type: 'KO',
            source: action.immuneFrom || 'EFFECTS',
            duration: 'STAGE_CONTINUOUS',
            sourceCardId,
          });
          hadEffect = true;
        }
      }
    }

    return hadEffect;
  }

  /**
   * Apply attack restriction to cards
   * Used for continuous effects that restrict what can be attacked
   */
  private applyAttackRestriction(
    player: PlayerState,
    action: EffectAction,
    sourceCardId: string
  ): boolean {
    let hadEffect = false;
    const targetType = action.target?.type;

    // If targeting self, apply to source card
    if (targetType === TargetType.SELF) {
      const sourceCard = player.field.find(c => c.id === sourceCardId) ||
        (player.leaderCard?.id === sourceCardId ? player.leaderCard : null);
      if (sourceCard) {
        if (!sourceCard.restrictions) {
          sourceCard.restrictions = [];
        }
        if (!sourceCard.restrictions.some(r => r.type === 'CANT_ATTACK' && r.source === 'STAGE_CONTINUOUS' && r.sourceCardId === sourceCardId)) {
          sourceCard.restrictions.push({
            type: 'CANT_ATTACK',
            until: 'END_OF_TURN',
            turnApplied: this.state.turn,
            source: 'STAGE_CONTINUOUS',
            sourceCardId,
          });
          hadEffect = true;
        }
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

    this.reapplyContinuousEffects();

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

  private isAttackRestrictionActive(restriction: CardRestriction): boolean {
    if (restriction.until === 'PERMANENT') {
      return true;
    }

    if (restriction.until === 'END_OF_TURN') {
      return restriction.turnApplied === this.state.turn;
    }

    if (restriction.until === 'END_OF_OPPONENT_TURN') {
      return this.state.turn === restriction.turnApplied || this.state.turn === restriction.turnApplied + 1;
    }

    return false;
  }

  private hasActiveCantAttackRestriction(card: GameCard): boolean {
    if (!card.restrictions || card.restrictions.length === 0) {
      return false;
    }

    let restricted = false;
    card.restrictions = card.restrictions.filter(restriction => {
      if (restriction.type !== 'CANT_ATTACK') {
        return true;
      }

      const isActive = this.isAttackRestrictionActive(restriction);
      if (isActive) {
        restricted = true;
      }
      return isActive;
    });

    if (card.restrictions.length === 0) {
      card.restrictions = undefined;
    }

    return restricted;
  }

  // Helper: Check if a single cost can be paid
  private canPaySingleCost(cost: EffectCost, player: PlayerState): boolean {
    const count = cost.count || 1;
    switch (cost.type) {
      case 'TRASH_FROM_HAND':
      case 'TRASH_CARD':
        return player.hand.length >= count;
      case 'TRASH_CHARACTER':
        const validChars = this.getValidFieldCharactersForCost(cost, player);
        return validChars.length >= count;
      case 'RETURN_DON':
        const donToReturn = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
        return donToReturn.length >= count;
      case 'REST_DON':
      case 'DON':
        const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
        return activeDon.length >= count;
      case 'LIFE':
        return player.lifeCards.length >= count;
      case 'REST_SELF':
        return true; // REST_SELF is validated against source card state elsewhere.
      case 'REST_CHARACTER':
        const restableChars = this.getValidFieldCharactersForCost(cost, player, true);
        return restableChars.length >= count;
      default:
        // Unknown cost types should not be assumed payable.
        return false;
    }
  }

  // Helper: Get valid field characters for a TRASH_CHARACTER cost
  private getValidFieldCharactersForCost(
    cost: EffectCost,
    player: PlayerState,
    requireActive: boolean = false
  ): string[] {
    return player.field
      .filter(char => {
        if (requireActive && char.state !== CardState.ACTIVE) {
          return false;
        }
        // Apply trait filter if present
        if (cost.traitFilter) {
          const cardDef = this.effectEngine.getCardDefinition(char.cardId);
          if (!cardDef?.traits?.includes(cost.traitFilter)) {
            return false;
          }
        }
        return true;
      })
      .map(char => char.id);
  }

  // Helper: Describe a cost for display
  private describeCost(cost: EffectCost): string {
    const count = cost.count || 1;
    switch (cost.type) {
      case 'TRASH_FROM_HAND':
      case 'TRASH_CARD':
        return `Trash ${count} card${count > 1 ? 's' : ''} from hand`;
      case 'TRASH_CHARACTER':
        const traitDesc = cost.traitFilter ? ` ${cost.traitFilter}` : '';
        return `Trash ${count}${traitDesc} Character${count > 1 ? 's' : ''} from field`;
      case 'REST_DON':
      case 'DON':
        return `Rest ${count} DON!!`;
      case 'RETURN_DON':
        return `Return ${count} DON!!`;
      case 'LIFE':
        return `Take ${count} damage`;
      case 'REST_SELF':
        return 'Rest this card';
      case 'REST_CHARACTER':
        return `Rest ${count} Character${count > 1 ? 's' : ''}`;
      default:
        return `Pay cost`;
    }
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

    if (this.hasActiveCantAttackRestriction(attacker)) {
      console.log('[DEBUG ATTACK GSM] Attacker has active CANT_ATTACK restriction');
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
      const hasRush = this.effectEngine.canAttackOnPlayTurn(attacker, this.state.turn, this.state);
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
    const result = this.effectEngine.resolveEffect(this.stripPrepaidCosts(activateEffect), context);
    console.log('[resolveActivateEffect] Effect result:', result);

    // Process childEffects if any
    if (result.childEffects && result.childEffects.length > 0) {
      console.log('[resolveActivateEffect] Processing', result.childEffects.length, 'childEffects');
      this.processChildEffects(result.childEffects, pendingEffect.playerId, pendingEffect.sourceCardId);
    }

    this.reapplyContinuousEffects();

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
    if (!this.effectEngine.canBlock(blocker, this.state)) return false;

    // Check if attacker is unblockable
    if (this.effectEngine.isUnblockable(attacker, this.state)) return false;

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
      if (cardIndex === -1) {
        continue;
      }

      const removedCard = player.hand.splice(cardIndex, 1)[0];
      removedCard.zone = CardZone.TRASH;
      player.trash.push(removedCard);

      // Character counters contribute their printed value only.
      const cardDef = this.effectEngine.getCardDefinition(removedCard.cardId);
      if (cardDef?.type !== 'EVENT') {
        continue;
      }

      const counterEffectIdx = cardDef.effects.findIndex(e => e.trigger === EffectTrigger.COUNTER);
      const counterEffect = counterEffectIdx !== -1 ? cardDef.effects[counterEffectIdx] : undefined;
      if (!counterEffect) {
        continue;
      }

      const conditionsMet = this.checkEffectConditions(counterEffect, playerId, removedCard);
      if (!conditionsMet) {
        continue;
      }

      const primaryAction = counterEffect.effects[0];
      const validTargets = this.getValidTargetsForEventEffect(counterEffect, playerId, removedCard);
      const hasTargetSelection = Boolean(primaryAction?.target);
      const maxTargets = hasTargetSelection
        ? (primaryAction?.target?.maxCount || primaryAction?.target?.count || 1)
        : 0;
      const minTargets = hasTargetSelection
        ? (primaryAction?.target?.optional ? 0 : 1)
        : 0;

      const powerBoostAction = counterEffect.effects.find(e => e.type === EffectType.BUFF_POWER);
      const powerBoost = powerBoostAction?.value || 0;

      if (hasTargetSelection && validTargets.length > 0) {
        counterEffectsNeedingSelection.push({
          id: `counter-${removedCard.id}-${Date.now()}`,
          sourceCardId: removedCard.id,
          playerId: playerId,
          description: counterEffect.description || `Resolve ${primaryAction?.type || 'counter'} effect`,
          validTargets,
          effectType: primaryAction?.type?.toString() || 'UNKNOWN',
          powerBoost,
          maxTargets,
          minTargets,
          conditionsMet,
          effectIndex: counterEffectIdx,
        });
      } else {
        // No target selection needed (or no valid targets). Resolve immediately.
        this.resolveEffectWithEngine(counterEffect, removedCard, player, [], true);
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

    if (!targetId) {
      console.warn('[resolveCombat] No targetId in combat info');
      this.state.currentCombat = undefined;
      return;
    }

    const attacker = this.findCard(attackerId);
    if (!attacker) {
      console.warn('[resolveCombat] Attacker no longer exists:', attackerId);
      this.state.currentCombat = undefined;
      return;
    }

    if (targetType === 'leader') {
      // Damage to leader
      const targetPlayer = this.findCardOwner(targetId!);
      if (targetPlayer) {
        // Check for Double Attack
        let damageMultiplier = 1;
        const hasDoubleAttack = attacker && this.effectEngine.hasDoubleAttack(attacker, this.state);
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

    // If a life trigger was found, pause combat resolution — don't clean up yet.
    // Combat state (including remainingDamage) must be preserved during TRIGGER_STEP.
    if (this.state.phase === GamePhase.TRIGGER_STEP) {
      return;
    }

    // Trigger AFTER_BATTLE
    const afterBattleTrigger: TriggerEvent = {
      type: EffectTrigger.AFTER_BATTLE,
      cardId: attackerId,
      playerId: attacker?.owner,
    };
    this.processTriggers(afterBattleTrigger);

    // Clear temporary keywords granted during combat for ALL cards (Bug 5 fix)
    // Previously only cleared attacker, but defender/blocker may also have temp keywords
    for (const player of Object.values(this.state.players)) {
      for (const card of player.field) {
        card.temporaryKeywords = [];
      }
      if (player.leaderCard) {
        player.leaderCard.temporaryKeywords = [];
      }
    }

    // Clear THIS_BATTLE power buffs from all cards
    this.clearBattleBuffs();

    this.state.currentCombat = undefined;
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
    const hasBanish = attacker && this.effectEngine.hasBanish(attacker, this.state);

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
          // Banish: card goes to trash (no LIFE_ADDED_TO_HAND trigger - Bug 1 fix)
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

            // Store remaining damage for after trigger resolves (Double Attack fix)
            const remaining = damage - i - 1;
            if (remaining > 0 && this.state.currentCombat) {
              this.state.currentCombat.remainingDamage = remaining;
              this.state.currentCombat.remainingDamagePlayerId = playerId;
              this.state.currentCombat.remainingDamageHasBanish = !!hasBanish;
            }
            return; // Pause for trigger resolution
          }

          // Trigger LIFE_ADDED_TO_HAND (only when actually added to hand - Bug 1 fix)
          const lifeEvent: TriggerEvent = {
            type: EffectTrigger.LIFE_ADDED_TO_HAND,
            cardId: lifeCard.id,
            playerId: playerId,
          };
          this.processTriggers(lifeEvent);
        }
      }
    }
  }

  /**
   * Continue dealing remaining damage after a life trigger resolves (Double Attack fix).
   * Returns true if more damage was dealt (may enter another TRIGGER_STEP).
   */
  private continueRemainingDamage(): boolean {
    if (!this.state.currentCombat?.remainingDamage) {
      // No more remaining damage — finalize combat cleanup
      this.finalizeCombatCleanup();
      return false;
    }

    const { remainingDamage, remainingDamagePlayerId } = this.state.currentCombat;
    // Clear before calling takeDamage to avoid infinite loops
    this.state.currentCombat.remainingDamage = undefined;
    this.state.currentCombat.remainingDamagePlayerId = undefined;
    this.state.currentCombat.remainingDamageHasBanish = undefined;

    if (remainingDamagePlayerId) {
      this.takeDamage(remainingDamagePlayerId, remainingDamage, undefined, false);
      // If another trigger was found, stay in TRIGGER_STEP
      if (this.state.phase === GamePhase.TRIGGER_STEP) {
        return true;
      }
      // No more triggers — finalize combat cleanup
      this.finalizeCombatCleanup();
      return true;
    }
    return false;
  }

  /**
   * Finalize combat cleanup after all damage and triggers are resolved.
   */
  private finalizeCombatCleanup(): void {
    if (!this.state.currentCombat) return;

    const { attackerId } = this.state.currentCombat;
    const attacker = this.findCard(attackerId);

    // Trigger AFTER_BATTLE
    const afterBattleTrigger: TriggerEvent = {
      type: EffectTrigger.AFTER_BATTLE,
      cardId: attackerId,
      playerId: attacker?.owner,
    };
    this.processTriggers(afterBattleTrigger);

    // Clear temporary keywords
    for (const player of Object.values(this.state.players)) {
      for (const card of player.field) {
        card.temporaryKeywords = [];
      }
      if (player.leaderCard) {
        player.leaderCard.temporaryKeywords = [];
      }
    }

    this.clearBattleBuffs();
    this.state.currentCombat = undefined;
    if (this.state.phase !== GamePhase.GAME_OVER) {
      this.state.phase = GamePhase.MAIN_PHASE;
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

      this.detachDonFromCard(cardId, player.id);
    }
  }

  private detachDonFromCard(cardId: string, ownerId: string): void {
    const owner = this.state.players[ownerId];
    if (!owner) return;

    owner.donField.forEach(don => {
      if (don.attachedTo === cardId) {
        don.attachedTo = undefined;
        don.state = CardState.ACTIVE;
      }
    });
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

    // Move to draw phase. In OPTCG, deck-out only happens when a required draw cannot be performed.
    this.state.phase = GamePhase.DRAW_PHASE;
    if (player.deck.length === 0) {
      const opponentId = Object.keys(this.state.players).find(id => id !== playerId);
      this.state.winner = opponentId;
      this.state.phase = GamePhase.GAME_OVER;
      return;
    }
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

    // Check for queued extra turn.
    const queuedExtraTurns = player.extraTurns ?? 0;
    if (queuedExtraTurns > 0) {
      player.extraTurns = queuedExtraTurns - 1;
      console.log('[GameStateManager] Player', playerId, 'takes an extra turn. Remaining:', player.extraTurns);
      // Start another turn for the same player
      this.startTurn(playerId);
      return;
    }

    // Find next player (normal turn transition)
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
      const isFrozen = player.leaderCard.keywords?.includes('Frozen') ?? false;
      if (isFrozen) {
        // Frozen: skip untap, remove Frozen (only prevents one untap)
        player.leaderCard.keywords = player.leaderCard.keywords!.filter(k => k !== 'Frozen');
      } else {
        player.leaderCard.state = CardState.ACTIVE;
      }
      player.leaderCard.hasAttacked = false;
      player.leaderCard.activatedThisTurn = false;
    }

    // Untap all field cards and reset turn-based flags
    player.field.forEach(card => {
      const isFrozen = card.keywords?.includes('Frozen') ?? false;
      if (card.state === CardState.RESTED) {
        if (isFrozen) {
          // Frozen: skip untap, remove Frozen (only prevents one untap)
          card.keywords = card.keywords!.filter(k => k !== 'Frozen');
        } else {
          card.state = CardState.ACTIVE;
          card.hasAttacked = false;
        }
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
   * Clear THIS_TURN power buffs and granted effects from all cards at end of turn
   */
  private clearTurnBuffs(): void {
    const keepGrantedEffect = (effect: { duration: string; turnGranted: number }): boolean => {
      if (effect.duration === 'THIS_TURN') return false;
      if (
        (effect.duration === 'UNTIL_END_OF_OPPONENT_TURN' || effect.duration === 'UNTIL_START_OF_YOUR_TURN') &&
        this.state.turn > effect.turnGranted
      ) {
        return false;
      }
      return true;
    };

    for (const player of Object.values(this.state.players)) {
      // Clear from leader
      if (player.leaderCard?.powerBuffs) {
        player.leaderCard.powerBuffs = player.leaderCard.powerBuffs.filter(
          buff => buff.duration !== 'THIS_TURN'
        );
      }
      // Clear granted effects from leader
      if (player.leaderCard?.grantedEffects) {
        player.leaderCard.grantedEffects = player.leaderCard.grantedEffects.filter(
          effect => keepGrantedEffect(effect)
        );
      }
      // Clear from field cards
      for (const card of player.field) {
        if (card.powerBuffs) {
          card.powerBuffs = card.powerBuffs.filter(
            buff => buff.duration !== 'THIS_TURN'
          );
        }
        // Clear granted effects
        if (card.grantedEffects) {
          card.grantedEffects = card.grantedEffects.filter(
            effect => keepGrantedEffect(effect)
          );
        }
      }
    }
  }

  /**
   * Clear THIS_BATTLE power buffs and granted effects from all cards after combat resolves
   */
  private clearBattleBuffs(): void {
    for (const player of Object.values(this.state.players)) {
      // Clear from leader
      if (player.leaderCard?.powerBuffs) {
        player.leaderCard.powerBuffs = player.leaderCard.powerBuffs.filter(
          buff => buff.duration !== 'THIS_BATTLE'
        );
      }
      // Clear granted effects from leader
      if (player.leaderCard?.grantedEffects) {
        player.leaderCard.grantedEffects = player.leaderCard.grantedEffects.filter(
          effect => effect.duration !== 'THIS_BATTLE'
        );
      }
      // Clear from field cards
      for (const card of player.field) {
        if (card.powerBuffs) {
          card.powerBuffs = card.powerBuffs.filter(
            buff => buff.duration !== 'THIS_BATTLE'
          );
        }
        // Clear granted effects
        if (card.grantedEffects) {
          card.grantedEffects = card.grantedEffects.filter(
            effect => effect.duration !== 'THIS_BATTLE'
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
    const actionData = action.data ?? {};

    switch (action.type) {
      case ActionType.PRE_GAME_SELECT:
        return this.handlePreGameSelect(action.playerId, actionData.cardId);

      case ActionType.SKIP_PRE_GAME:
        return this.skipPreGameEffect(action.playerId);

      case ActionType.KEEP_HAND:
        return this.confirmKeepHand(action.playerId);

      case ActionType.MULLIGAN:
        return this.performMulligan(action.playerId);

      case ActionType.PLAY_CARD:
        return this.playCard(action.playerId, actionData.cardId, actionData.zone);

      case ActionType.ATTACH_DON:
        return this.attachDon(action.playerId, actionData.donId, actionData.targetId);

      case ActionType.DECLARE_ATTACK:
        return this.declareAttack(actionData.attackerId, actionData.targetId, actionData.targetType);

      case ActionType.RESOLVE_ATTACK_EFFECT:
        return this.resolveAttackEffect(actionData.effectId, actionData.selectedTargets || []);

      case ActionType.SKIP_ATTACK_EFFECT:
        return this.skipAttackEffect(actionData.effectId);

      case ActionType.RESOLVE_PLAY_EFFECT:
        return this.resolvePlayEffect(actionData.effectId, actionData.selectedTargets || []);

      case ActionType.SKIP_PLAY_EFFECT:
        return this.skipPlayEffect(actionData.effectId);

      case ActionType.RESOLVE_ACTIVATE_EFFECT:
        return this.resolveActivateEffect(actionData.effectId, actionData.selectedTargets || []);

      case ActionType.SKIP_ACTIVATE_EFFECT:
        return this.skipActivateEffect(actionData.effectId);

      case ActionType.USE_COUNTER:
        return this.useCounter(action.playerId, actionData.cardIds || []);

      case ActionType.PASS_COUNTER:
        return this.passCounter(action.playerId);

      case ActionType.SELECT_BLOCKER:
        return this.declareBlocker(action.playerId, actionData.blockerId);

      case ActionType.PASS_PRIORITY:
        // Handle pass blocker during blocker step
        if (this.state.phase === GamePhase.BLOCKER_STEP) {
          return this.passBlocker(action.playerId);
        }
        return false;

      case ActionType.RESOLVE_COMBAT:
        if (
          !this.state.currentCombat ||
          (this.state.phase !== GamePhase.COUNTER_STEP &&
            this.state.phase !== GamePhase.BLOCKER_STEP &&
            this.state.phase !== GamePhase.TRIGGER_STEP)
        ) {
          return false;
        }
        this.resolveCombat();
        return true;

      case ActionType.END_TURN:
        if (this.state.phase !== GamePhase.MAIN_PHASE) {
          return false;
        }
        this.endTurn(action.playerId);
        return true;

      case ActionType.TRIGGER_LIFE:
        // Handle trigger effect activation
        if (actionData.effectId) {
          const changes = this.resolveEffect(actionData.effectId, actionData.targets);
          // Continue dealing remaining damage (Double Attack with multiple triggers)
          this.continueRemainingDamage();
          return changes.length > 0;
        }
        // Pass on trigger - continue to next phase
        if (this.state.phase === GamePhase.TRIGGER_STEP) {
          // Continue dealing remaining damage (Double Attack with multiple triggers)
          if (this.continueRemainingDamage()) {
            return true; // Still in trigger resolution
          }
          this.state.phase = GamePhase.MAIN_PHASE;
        }
        return true;

      case ActionType.ACTIVATE_ABILITY:
        return this.activateAbility(action.playerId, actionData.cardId, actionData.targets);

      case ActionType.RESOLVE_EVENT_EFFECT:
        return this.resolveEventEffect(action.playerId, actionData.effectId, actionData.selectedTargets || []);

      case ActionType.SKIP_EVENT_EFFECT:
        return this.skipEventEffect(action.playerId, actionData.effectId);

      case ActionType.PAY_ADDITIONAL_COST:
        return this.payAdditionalCost(action.playerId, actionData.costId);

      case ActionType.SKIP_ADDITIONAL_COST:
        return this.skipAdditionalCost(action.playerId, actionData.costId);

      case ActionType.RESOLVE_COUNTER_EFFECT:
        return this.resolveCounterEffect(action.playerId, actionData.effectId, actionData.selectedTargets || []);

      case ActionType.SKIP_COUNTER_EFFECT:
        return this.skipCounterEffect(action.playerId, actionData.effectId);

      case ActionType.RESOLVE_DECK_REVEAL:
        return this.resolveDeckReveal(action.playerId, actionData.selectedCardIds);

      case ActionType.SKIP_DECK_REVEAL:
        return this.skipDeckReveal(action.playerId);

      case ActionType.RESOLVE_HAND_SELECT:
        return this.resolveHandSelect(action.playerId, actionData.selectedCardIds);

      case ActionType.SKIP_HAND_SELECT:
        return this.skipHandSelect(action.playerId);

      case ActionType.RESOLVE_FIELD_SELECT:
        return this.resolveFieldSelect(
          action.playerId,
          (actionData.selectedCardIds ?? actionData.selectedIds ?? []) as string[]
        );

      case ActionType.SKIP_FIELD_SELECT:
        return this.skipFieldSelect(action.playerId);

      case ActionType.RESOLVE_CHOICE:
        return this.resolveChoice(action.playerId, actionData.optionId);

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
        // Check if cost has alternatives (e.g., "trash 1 Character OR 1 card from hand")
        if (cost.alternatives && cost.alternatives.length > 0) {
          const isOptional = cost.optional === true;

          // Map alternatives to choice options
          const options: ChoiceOption[] = cost.alternatives.map((alt, idx) => {
            const canPay = this.canPaySingleCost(alt, player);
            const label = this.describeCost(alt);
            return {
              id: `cost-${idx}`,
              label,
              enabled: canPay,
              disabledReason: canPay ? undefined : 'Cannot pay this cost'
            };
          });

          // Add skip option for optional costs
          if (isOptional) {
            options.push({
              id: 'cost-skip',
              label: 'Do not pay this cost (skip effect)',
              enabled: true,
            });
          }

          // Validate at least one option can be paid
          const anyCanPay = options.some(o => o.enabled);
          if (!anyCanPay && !isOptional) {
            console.log('[activateAbility] Cannot pay any cost alternative');
            return false;
          } else if (!anyCanPay && isOptional) {
            console.log('[activateAbility] Cannot pay optional alternatives, skipping');
            return true;
          }

          // Mark as activated BEFORE entering choice step
          if (activateEffect.oncePerTurn) {
            card.activatedThisTurn = true;
          }

          const pendingEffectId = `activate-${card.id}-${Date.now()}`;

          // Add pending effect to effect engine for later execution
          this.effectEngine.addPendingEffect({
            id: pendingEffectId,
            sourceCardId: card.id,
            playerId,
            effect: activateEffect,
            trigger: EffectTrigger.ACTIVATE_MAIN,
            requiresChoice: false,
            priority: 1,
          });

          // Create pending choice effect
          this.state.pendingChoiceEffect = {
            id: `cost-choice-${card.id}-${Date.now()}`,
            sourceCardId: card.id,
            playerId: playerId,
            description: 'Choose which cost to pay',
            choiceType: 'COST_ALTERNATIVE',
            options,
            minSelections: 1,
            maxSelections: 1,
            pendingEffectId: pendingEffectId
          };
          this.state.phase = GamePhase.CHOICE_STEP;

          console.log('[activateAbility] Cost has alternatives, entering CHOICE_STEP with options:', options);
          return true;
        }

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

          const pendingEffectId = `activate-${card.id}-${Date.now()}`;
          this.effectEngine.addPendingEffect({
            id: pendingEffectId,
            sourceCardId: card.id,
            playerId,
            effect: activateEffect,
            trigger: EffectTrigger.ACTIVATE_MAIN,
            requiresChoice: false,
            priority: 1,
          });

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
            pendingEffectId: pendingEffectId,
            sourceCardInstanceId: card.id,
          };

          this.state.pendingHandSelectEffect = pendingEffect;
          this.state.phase = GamePhase.HAND_SELECT_STEP;

          return true; // Effect will be executed after cost is paid
        } else if (cost.type === 'TRASH_CHARACTER') {
          // Trash character(s) from field as cost
          const requiredCount = cost.count || 1;
          const validTargets = this.getValidFieldCharactersForCost(cost, player);

          if (validTargets.length < requiredCount) {
            return false; // Not enough valid characters
          }

          // Mark as activated this turn BEFORE creating pending
          if (activateEffect.oncePerTurn) {
            card.activatedThisTurn = true;
          }

          const traitDesc = cost.traitFilter ? ` ${cost.traitFilter}` : '';

          const pendingEffectId = `activate-${card.id}-${Date.now()}`;

          // Add pending effect to effect engine for later execution
          this.effectEngine.addPendingEffect({
            id: pendingEffectId,
            sourceCardId: card.id,
            playerId,
            effect: activateEffect,
            trigger: EffectTrigger.ACTIVATE_MAIN,
            requiresChoice: false,
            priority: 1,
          });

          // Create pending field select for cost payment
          this.state.pendingFieldSelectEffect = {
            id: `cost-trash-field-${card.id}-${Date.now()}`,
            sourceCardId: card.id,
            playerId,
            description: `Trash ${requiredCount}${traitDesc} Character(s) to activate ${cardDef.name}'s ability`,
            selectAction: 'TRASH',
            validTargetIds: validTargets,
            minSelections: requiredCount,
            maxSelections: requiredCount,
            traitFilter: cost.traitFilter,
            canSkip: false,
            isCostPayment: true,
            pendingEffectId: pendingEffectId,
          };

          this.state.phase = GamePhase.FIELD_SELECT_STEP;
          console.log('[activateAbility] TRASH_CHARACTER cost, entering FIELD_SELECT_STEP with targets:', validTargets);
          return true;
        } else if (cost.type === 'RETURN_DON') {
          // Return DON to DON deck as cost
          const requiredCount = cost.count || 1;
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);

          if (activeDon.length < requiredCount) {
            return false; // Not enough DON
          }

          // Return DON to DON deck
          for (let i = 0; i < requiredCount; i++) {
            const don = activeDon[i];
            const idx = player.donField.indexOf(don);
            if (idx !== -1) {
              player.donField.splice(idx, 1);
              player.donDeck++;
            }
          }
        } else if (cost.type === 'REST_CHARACTER') {
          const requiredCount = cost.count || 1;
          const validTargets = this.getValidFieldCharactersForCost(cost, player, true);
          if (validTargets.length < requiredCount) {
            return false;
          }

          // Mark as activated this turn BEFORE creating pending
          if (activateEffect.oncePerTurn) {
            card.activatedThisTurn = true;
          }

          const traitDesc = cost.traitFilter ? ` ${cost.traitFilter}` : '';
          const pendingEffectId = `activate-${card.id}-${Date.now()}`;

          this.effectEngine.addPendingEffect({
            id: pendingEffectId,
            sourceCardId: card.id,
            playerId,
            effect: activateEffect,
            trigger: EffectTrigger.ACTIVATE_MAIN,
            requiresChoice: false,
            priority: 1,
          });

          this.state.pendingFieldSelectEffect = {
            id: `cost-rest-field-${card.id}-${Date.now()}`,
            sourceCardId: card.id,
            playerId,
            description: `Rest ${requiredCount}${traitDesc} Character(s) to activate ${cardDef.name}'s ability`,
            selectAction: 'REST',
            validTargetIds: validTargets,
            minSelections: requiredCount,
            maxSelections: requiredCount,
            traitFilter: cost.traitFilter,
            canSkip: false,
            isCostPayment: true,
            pendingEffectId: pendingEffectId,
          };

          this.state.phase = GamePhase.FIELD_SELECT_STEP;
          console.log('[activateAbility] REST_CHARACTER cost, entering FIELD_SELECT_STEP with targets:', validTargets);
          return true;
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

    const result = this.effectEngine.resolveEffect(this.stripPrepaidCosts(activateEffect), context);
    console.log('[ActivateAbility] Effect result:', result);

    // Process childEffects if any
    if (result.childEffects && result.childEffects.length > 0) {
      console.log('[ActivateAbility] Processing', result.childEffects.length, 'childEffects');
      this.processChildEffects(result.childEffects, playerId, cardId);
    }

    this.reapplyContinuousEffects();

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
        // Check if cost has alternatives (e.g., "trash 1 Character OR 1 card from hand")
        if (cost.alternatives && cost.alternatives.length > 0) {
          const canPayAny = cost.alternatives.some(alt => this.canPaySingleCost(alt, player));
          if (!canPayAny && !cost.optional) {
            return { canActivate: false, reason: 'Cannot pay any cost option' };
          }
          continue; // Move to next cost
        }

        // Single cost validation using helper
        if (!this.canPaySingleCost(cost, player)) {
          // Special case: REST_SELF needs to check if already rested
          if (cost.type === 'REST_SELF' && card.state === CardState.RESTED) {
            return { canActivate: false, reason: 'Card is already rested' };
          }
          if (!cost.optional) {
            return { canActivate: false, reason: `Cannot pay ${this.describeCost(cost)}` };
          }
        }
      }
    }

    return { canActivate: true };
  }

  /**
   * Get all cards with activatable abilities that can currently be activated
   * Useful for UI to highlight cards with available abilities
   */
  public getActivatableCards(playerId: string): { cardId: string; cardInstanceId: string; effectDescription?: string }[] {
    const activatableCards: { cardId: string; cardInstanceId: string; effectDescription?: string }[] = [];

    // Can only activate during main phase on your turn
    if (this.state.phase !== GamePhase.MAIN_PHASE) return activatableCards;
    if (this.state.activePlayerId !== playerId) return activatableCards;

    const player = this.state.players[playerId];
    if (!player) return activatableCards;

    // Check leader card
    if (player.leaderCard) {
      const result = this.canActivateAbility(playerId, player.leaderCard.id);
      if (result.canActivate) {
        const cardDef = this.effectEngine.getCardDefinition(player.leaderCard.cardId);
        const activateEffect = cardDef?.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
        activatableCards.push({
          cardId: player.leaderCard.cardId,
          cardInstanceId: player.leaderCard.id,
          effectDescription: activateEffect?.description,
        });
      }
    }

    // Check field cards (characters)
    for (const card of player.field) {
      const result = this.canActivateAbility(playerId, card.id);
      if (result.canActivate) {
        const cardDef = this.effectEngine.getCardDefinition(card.cardId);
        const activateEffect = cardDef?.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
        activatableCards.push({
          cardId: card.cardId,
          cardInstanceId: card.id,
          effectDescription: activateEffect?.description,
        });
      }
    }

    // Check stage card
    if (player.stage) {
      const result = this.canActivateAbility(playerId, player.stage.id);
      if (result.canActivate) {
        const cardDef = this.effectEngine.getCardDefinition(player.stage.cardId);
        const activateEffect = cardDef?.effects.find(e => e.trigger === EffectTrigger.ACTIVATE_MAIN);
        activatableCards.push({
          cardId: player.stage.cardId,
          cardInstanceId: player.stage.id,
          effectDescription: activateEffect?.description,
        });
      }
    }

    return activatableCards;
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

    if (
      selectedTargets.length < pendingEffect.minTargets ||
      selectedTargets.length > pendingEffect.maxTargets
    ) {
      console.log('[resolveEventEffect] Invalid target count');
      return false;
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
    const player = this.state.players[playerId];

    if (mainEffect && player) {
      this.resolveEffectWithEngine(mainEffect, sourceCard, player, selectedTargets, true);
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
        if (player.hand.length < pendingCost.amount) {
          return false;
        }

        const pendingEventId = this.state.pendingEventEffects?.[0]?.id;
        this.state.pendingAdditionalCost = undefined;
        this.state.pendingHandSelectEffect = {
          id: `event-cost-${Date.now()}`,
          sourceCardId: pendingCost.sourceCardId,
          playerId,
          description: pendingCost.description,
          selectAction: 'TRASH',
          minSelections: pendingCost.amount,
          maxSelections: pendingCost.amount,
          canSkip: false,
          isCostPayment: true,
          pendingEffectId: pendingEventId,
          sourceCardInstanceId: pendingCost.sourceCardId,
        };
        this.state.phase = GamePhase.HAND_SELECT_STEP;
        return true;
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
        if (
          pendingEvent.conditionsMet &&
          (pendingEvent.maxTargets === 0 || pendingEvent.validTargets.length > 0)
        ) {
          this.state.phase = GamePhase.EVENT_EFFECT_STEP;
        } else {
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

    const pendingEffects = this.state.pendingCounterEffects || [];
    const pendingEffectIndex = pendingEffects.findIndex(e => e.id === effectId);
    if (pendingEffectIndex === -1 || pendingEffects[pendingEffectIndex].playerId !== playerId) {
      return false;
    }
    const pendingEffect = pendingEffects[pendingEffectIndex];

    // Validate targets
    if (!pendingEffect.conditionsMet) {
      console.log('[resolveCounterEffect] Conditions not met, effect fizzles');
      return this.skipCounterEffect(playerId, effectId);
    }

    if (
      selectedTargets.length < pendingEffect.minTargets ||
      selectedTargets.length > pendingEffect.maxTargets
    ) {
      console.log('[resolveCounterEffect] Invalid target count');
      return false;
    }

    const validTargetIds = new Set(pendingEffect.validTargets);
    for (const target of selectedTargets) {
      if (!validTargetIds.has(target)) {
        console.log('[resolveCounterEffect] Invalid target:', target);
        return false;
      }
    }

    const sourceCard = this.findCard(pendingEffect.sourceCardId);
    const player = this.state.players[playerId];
    const cardDef = sourceCard ? this.effectEngine.getCardDefinition(sourceCard.cardId) : undefined;
    // Use stored effectIndex to find the correct counter effect (handles cards with multiple effects)
    const counterEffect = pendingEffect.effectIndex !== undefined && cardDef
      ? cardDef.effects[pendingEffect.effectIndex]
      : cardDef?.effects.find(e => e.trigger === EffectTrigger.COUNTER);

    if (sourceCard && player && counterEffect) {
      this.resolveEffectWithEngine(counterEffect, sourceCard, player, selectedTargets, true);
    }

    this.state.pendingCounterEffects = pendingEffects.filter(e => e.id !== effectId);
    if (this.state.pendingCounterEffects.length > 0) {
      this.state.phase = GamePhase.COUNTER_EFFECT_STEP;
      return true;
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

    if (this.state.phase !== GamePhase.COUNTER_EFFECT_STEP) {
      return false;
    }

    const pendingEffects = this.state.pendingCounterEffects || [];
    const pendingEffectIndex = pendingEffects.findIndex(e => e.id === effectId);
    if (pendingEffectIndex === -1 || pendingEffects[pendingEffectIndex].playerId !== playerId) {
      console.log('[skipCounterEffect] No matching pending effect');
      return false;
    }

    const pendingEffect = pendingEffects[pendingEffectIndex];
    const canSkip =
      !pendingEffect.conditionsMet ||
      pendingEffect.validTargets.length === 0 ||
      pendingEffect.minTargets === 0;

    if (!canSkip) {
      console.log('[skipCounterEffect] Effect is mandatory and has valid targets');
      return false;
    }

    this.state.pendingCounterEffects = pendingEffects.filter(e => e.id !== effectId);
    if (this.state.pendingCounterEffects.length > 0) {
      this.state.phase = GamePhase.COUNTER_EFFECT_STEP;
      return true;
    }

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
   * Continue a pending effect after an additional cost has been paid.
   * Returns true when we transition into PLAY_EFFECT_STEP.
   */
  private continuePendingEffectAfterCost(pendingEffect: PendingEffect, playerId: string): boolean {
    if (pendingEffect.requiresChoice) {
      console.log('[continuePendingEffectAfterCost] Effect requires target selection, entering PLAY_EFFECT_STEP');

      const validTargets = this.getValidTargetsForEffect(pendingEffect.id);
      const effectAction = pendingEffect.effect.effects[0];
      const effectType = effectAction?.type || 'UNKNOWN';
      const maxTargets = effectAction?.target?.count || 1;

      const playEffect: PendingPlayEffect = {
        id: pendingEffect.id,
        sourceCardId: pendingEffect.sourceCardId,
        playerId,
        description: pendingEffect.effect.description || 'Activate ON PLAY ability',
        validTargets,
        requiresChoice: true,
        effectType: effectType.toString(),
        maxTargets,
        minTargets: pendingEffect.effect.isOptional ? 0 : 1
      };

      this.state.pendingPlayEffects = [playEffect];
      this.state.phase = GamePhase.PLAY_EFFECT_STEP;
      return true;
    }

    // Resolve immediately for non-choice effects.
    const sourceCard = this.findCard(pendingEffect.sourceCardId);
    const sourcePlayer = this.state.players[playerId];
    if (sourceCard && sourcePlayer) {
      const context: EffectContext = {
        gameState: this.state,
        sourceCard,
        sourcePlayer,
      };

      console.log('[continuePendingEffectAfterCost] Resolving effect directly:', pendingEffect.effect.id);
      this.effectEngine.resolveEffect(this.stripPrepaidCosts(pendingEffect.effect), context);
      this.reapplyContinuousEffects();
    }

    this.effectEngine.removePendingEffect(pendingEffect.id);
    return false;
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

    // If this was a cost payment for an ON_PLAY effect, continue with effect resolution.
    if (pending.isCostPayment && pending.pendingEffectId) {
      console.log('[resolveHandSelect] Cost paid, continuing with effect:', pending.pendingEffectId);

      // Find the pending effect in the effect engine
      const pendingEffect = this.effectEngine.getPendingEffects().find(e =>
        e.effect.id === pending.pendingEffectId || e.id === pending.pendingEffectId
      );

      if (pendingEffect) {
        this.state.pendingHandSelectEffect = undefined;
        if (this.continuePendingEffectAfterCost(pendingEffect, playerId)) {
          return true;
        }
      }

      // Additional-cost path for event effects.
      const pendingEvent = this.state.pendingEventEffects?.find(e => e.id === pending.pendingEffectId);
      if (pendingEvent) {
        this.state.pendingHandSelectEffect = undefined;
        if (
          pendingEvent.conditionsMet &&
          (pendingEvent.maxTargets === 0 || pendingEvent.validTargets.length > 0)
        ) {
          this.state.phase = GamePhase.EVENT_EFFECT_STEP;
        } else {
          this.clearEventEffectState();
        }
        return true;
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

    // If this was a cost payment, remove the pending effect since user chose not to pay
    if (pending.isCostPayment && pending.pendingEffectId) {
      console.log('[skipHandSelect] Skipping cost payment, removing pending effect');
      // Find and remove the pending effect
      const pendingEffect = this.effectEngine.getPendingEffects().find(e =>
        e.effect.id === pending.pendingEffectId || e.id === pending.pendingEffectId
      );
      if (pendingEffect) {
        this.effectEngine.removePendingEffect(pendingEffect.id);
      }
    }

    // Clear pending and return to main phase
    this.state.pendingHandSelectEffect = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;

    return true;
  }

  /**
   * Handle field character selection (for TRASH_CHARACTER costs)
   */
  public resolveFieldSelect(playerId: string, selectedCardIds: string[] = []): boolean {
    console.log('[resolveFieldSelect] Called:', { playerId, selectedCardIds });

    if (this.state.phase !== GamePhase.FIELD_SELECT_STEP) {
      console.log('[resolveFieldSelect] Wrong phase:', this.state.phase);
      return false;
    }

    const pending = this.state.pendingFieldSelectEffect;
    if (!pending || pending.playerId !== playerId) {
      console.log('[resolveFieldSelect] No pending effect or wrong player');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    const selectedIds = Array.isArray(selectedCardIds) ? selectedCardIds : [];

    // Validate selections
    if (selectedIds.length < pending.minSelections) {
      console.log('[resolveFieldSelect] Not enough selections');
      return false;
    }
    if (selectedIds.length > pending.maxSelections) {
      console.log('[resolveFieldSelect] Too many selections');
      return false;
    }
    if (!selectedIds.every(id => pending.validTargetIds.includes(id))) {
      console.log('[resolveFieldSelect] Invalid card selected');
      return false;
    }

    // Execute the action on selected characters
    for (const cardId of selectedIds) {
      const cardIndex = player.field.findIndex(c => c.id === cardId);
      if (cardIndex === -1) continue;

      const card = player.field[cardIndex];

      switch (pending.selectAction) {
        case 'TRASH':
          this.detachDonFromCard(cardId, player.id);
          player.field.splice(cardIndex, 1);
          card.zone = CardZone.TRASH;
          player.trash.push(card);
          this.processTriggers({
            type: EffectTrigger.TRASH_SELF,
            cardId,
            playerId: player.id,
          });
          this.processTriggers({
            type: EffectTrigger.TRASH_ALLY,
            cardId,
            playerId: player.id,
          });
          console.log('[resolveFieldSelect] Trashed character:', cardId);
          break;
        case 'REST':
          card.state = CardState.RESTED;
          console.log('[resolveFieldSelect] Rested character:', cardId);
          break;
        case 'RETURN_TO_HAND':
          this.detachDonFromCard(cardId, player.id);
          player.field.splice(cardIndex, 1);
          card.zone = CardZone.HAND;
          player.hand.push(card);
          console.log('[resolveFieldSelect] Returned to hand:', cardId);
          break;
        case 'RETURN_TO_DECK':
          this.detachDonFromCard(cardId, player.id);
          player.field.splice(cardIndex, 1);
          card.zone = CardZone.DECK;
          player.deck.push(card);
          console.log('[resolveFieldSelect] Returned to deck:', cardId);
          break;
      }
    }

    // If this was cost payment, continue to effect resolution
    if (pending.isCostPayment && pending.pendingEffectId) {
      const effect = this.effectEngine.getPendingEffects().find(e => e.id === pending.pendingEffectId);

      if (effect) {
        this.state.pendingFieldSelectEffect = undefined;
        if (this.continuePendingEffectAfterCost(effect, playerId)) {
          return true;
        }
      }
    }

    this.state.pendingFieldSelectEffect = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;
    return true;
  }

  /**
   * Skip field character selection (for optional costs)
   */
  public skipFieldSelect(playerId: string): boolean {
    console.log('[skipFieldSelect] Called:', { playerId });

    if (this.state.phase !== GamePhase.FIELD_SELECT_STEP) {
      return false;
    }

    const pending = this.state.pendingFieldSelectEffect;
    if (!pending || pending.playerId !== playerId) {
      return false;
    }

    if (!pending.canSkip) {
      console.log('[skipFieldSelect] Cannot skip - effect is mandatory');
      return false;
    }

    // If this was a cost payment, remove the pending effect
    if (pending.isCostPayment && pending.pendingEffectId) {
      console.log('[skipFieldSelect] Skipping cost payment, removing pending effect');
      const pendingEffect = this.effectEngine.getPendingEffects().find(e =>
        e.effect.id === pending.pendingEffectId || e.id === pending.pendingEffectId
      );
      if (pendingEffect) {
        this.effectEngine.removePendingEffect(pendingEffect.id);
      }
    }

    this.state.pendingFieldSelectEffect = undefined;
    this.state.phase = GamePhase.MAIN_PHASE;
    return true;
  }

  /**
   * Handle choice selection (for cost alternatives and effect options)
   */
  public resolveChoice(playerId: string, optionId: string): boolean {
    console.log('[resolveChoice] Called:', { playerId, optionId });

    if (this.state.phase !== GamePhase.CHOICE_STEP) {
      console.log('[resolveChoice] Wrong phase:', this.state.phase);
      return false;
    }

    const pending = this.state.pendingChoiceEffect;
    if (!pending || pending.playerId !== playerId) {
      console.log('[resolveChoice] No pending choice or wrong player');
      return false;
    }

    const option = pending.options.find(o => o.id === optionId);
    if (!option || !option.enabled) {
      console.log('[resolveChoice] Option not found or disabled');
      return false;
    }

    const player = this.state.players[playerId];
    if (!player) return false;

    switch (pending.choiceType) {
      case 'COST_ALTERNATIVE':
        if (optionId === 'cost-skip') {
          console.log('[resolveChoice] Optional cost skipped');
          if (pending.pendingEffectId) {
            const effectToRemove = this.effectEngine.getPendingEffects().find(e =>
              e.effect.id === pending.pendingEffectId || e.id === pending.pendingEffectId
            );
            if (effectToRemove) {
              this.effectEngine.removePendingEffect(effectToRemove.id);
            }
          }
          this.state.pendingChoiceEffect = undefined;
          this.state.phase = GamePhase.MAIN_PHASE;
          return true;
        }

        // Extract cost index from option id ("cost-0", "cost-1")
        const costIndexMatch = optionId.match(/^cost-(\d+)$/);
        if (!costIndexMatch) {
          console.log('[resolveChoice] Invalid cost option id:', optionId);
          return false;
        }
        const costIndex = parseInt(costIndexMatch[1], 10);
        console.log('[resolveChoice] Selected cost alternative:', costIndex);

        // Find the original pending effect to get the cost alternatives
        const pendingEffect = pending.pendingEffectId ?
          this.effectEngine.getPendingEffects().find(e => e.id === pending.pendingEffectId) : null;

        if (!pendingEffect) {
          console.log('[resolveChoice] Pending effect not found for selected alternative');
          this.state.pendingChoiceEffect = undefined;
          this.state.phase = GamePhase.MAIN_PHASE;
          return true;
        }

        const cost = pendingEffect.effect.costs?.find(c => c.alternatives);
        if (!cost?.alternatives || !cost.alternatives[costIndex]) {
          console.log('[resolveChoice] Could not map selected alternative to a cost');
          return false;
        }

        const selectedCost = cost.alternatives[costIndex];
        const selectedCount = selectedCost.count || 1;
        const continueAfterImmediatePayment = (): boolean => {
          this.state.pendingChoiceEffect = undefined;
          if (this.continuePendingEffectAfterCost(pendingEffect, playerId)) {
            return true;
          }
          this.state.phase = GamePhase.MAIN_PHASE;
          return true;
        };

        // Handle the selected cost
        if (selectedCost.type === 'TRASH_CHARACTER') {
          const validTargets = this.getValidFieldCharactersForCost(selectedCost, player);
          if (validTargets.length < selectedCount) {
            console.log('[resolveChoice] Not enough valid characters to trash');
            return false;
          }
          const traitDesc = selectedCost.traitFilter ? ` ${selectedCost.traitFilter}` : '';

          this.state.pendingChoiceEffect = undefined;
          this.state.pendingFieldSelectEffect = {
            id: `field-cost-${Date.now()}`,
            sourceCardId: pending.sourceCardId,
            playerId: playerId,
            description: `Trash ${selectedCount}${traitDesc} Character(s) to activate effect`,
            selectAction: 'TRASH',
            validTargetIds: validTargets,
            minSelections: selectedCount,
            maxSelections: selectedCount,
            traitFilter: selectedCost.traitFilter,
            canSkip: false, // Already chose to pay, can't skip now
            isCostPayment: true,
            pendingEffectId: pendingEffect.id
          };
          this.state.phase = GamePhase.FIELD_SELECT_STEP;
          return true;
        } else if (selectedCost.type === 'TRASH_FROM_HAND' || selectedCost.type === 'TRASH_CARD') {
          if (player.hand.length < selectedCount) {
            console.log('[resolveChoice] Not enough cards in hand to trash');
            return false;
          }

          this.state.pendingChoiceEffect = undefined;
          this.state.pendingHandSelectEffect = {
            id: `cost-payment-${Date.now()}`,
            sourceCardId: pending.sourceCardId,
            playerId: playerId,
            description: `Trash ${selectedCount} card(s) from your hand to activate effect`,
            selectAction: 'TRASH',
            minSelections: selectedCount,
            maxSelections: selectedCount,
            canSkip: false, // Already chose to pay, can't skip now
            isCostPayment: true,
            pendingEffectId: pendingEffect.id,
            sourceCardInstanceId: pending.sourceCardId,
          };
          this.state.phase = GamePhase.HAND_SELECT_STEP;
          return true;
        } else if (selectedCost.type === 'REST_CHARACTER') {
          const validTargets = this.getValidFieldCharactersForCost(selectedCost, player, true);
          if (validTargets.length < selectedCount) {
            console.log('[resolveChoice] Not enough valid characters to rest');
            return false;
          }
          const traitDesc = selectedCost.traitFilter ? ` ${selectedCost.traitFilter}` : '';

          this.state.pendingChoiceEffect = undefined;
          this.state.pendingFieldSelectEffect = {
            id: `field-cost-${Date.now()}`,
            sourceCardId: pending.sourceCardId,
            playerId: playerId,
            description: `Rest ${selectedCount}${traitDesc} Character(s) to activate effect`,
            selectAction: 'REST',
            validTargetIds: validTargets,
            minSelections: selectedCount,
            maxSelections: selectedCount,
            traitFilter: selectedCost.traitFilter,
            canSkip: false,
            isCostPayment: true,
            pendingEffectId: pendingEffect.id
          };
          this.state.phase = GamePhase.FIELD_SELECT_STEP;
          return true;
        } else if (selectedCost.type === 'REST_DON' || selectedCost.type === 'DON') {
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
          if (activeDon.length < selectedCount) {
            console.log('[resolveChoice] Not enough active DON to rest');
            return false;
          }
          for (let i = 0; i < selectedCount; i++) {
            activeDon[i].state = CardState.RESTED;
          }
          return continueAfterImmediatePayment();
        } else if (selectedCost.type === 'RETURN_DON') {
          const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
          if (activeDon.length < selectedCount) {
            console.log('[resolveChoice] Not enough active DON to return');
            return false;
          }
          for (let i = 0; i < selectedCount; i++) {
            const don = activeDon[i];
            const idx = player.donField.indexOf(don);
            if (idx !== -1) {
              player.donField.splice(idx, 1);
              player.donDeck++;
            }
          }
          return continueAfterImmediatePayment();
        } else if (selectedCost.type === 'LIFE') {
          if (player.lifeCards.length < selectedCount) {
            console.log('[resolveChoice] Not enough life cards to pay cost');
            return false;
          }
          for (let i = 0; i < selectedCount; i++) {
            const lifeCard = player.lifeCards.pop();
            if (lifeCard) {
              lifeCard.zone = CardZone.DECK;
              player.deck.push(lifeCard);
              player.life--;
            }
          }
          return continueAfterImmediatePayment();
        } else if (selectedCost.type === 'REST_SELF') {
          const sourceCard = this.findCard(pending.sourceCardId);
          if (!sourceCard || sourceCard.state === CardState.RESTED) {
            console.log('[resolveChoice] Source card cannot be rested for REST_SELF cost');
            return false;
          }
          sourceCard.state = CardState.RESTED;
          return continueAfterImmediatePayment();
        }

        console.log('[resolveChoice] Unsupported selected cost type:', selectedCost.type);
        return false;

      case 'EFFECT_OPTION':
        // Handle effect option selection (for "Choose one" effects)
        console.log('[resolveChoice] Effect option selected:', optionId);
        // TODO: Implement effect option handling
        break;

      case 'ZONE_SELECTION':
        // Handle zone selection (for "from hand or trash" effects)
        console.log('[resolveChoice] Zone selected:', optionId);
        // TODO: Implement zone selection handling
        break;
    }

    this.state.pendingChoiceEffect = undefined;
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
  public executeEffectAction(action: EffectAction, context: EffectContext, targetIds: string[]): void {
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

      case EffectType.DEBUFF_POWER: {
        // Apply power debuff to targets
        const debuffValue = -(action.value || 0);
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            if (!targetCard.powerBuffs) {
              targetCard.powerBuffs = [];
            }
            targetCard.powerBuffs.push({
              id: `event-debuff-${Date.now()}`,
              sourceCardId: context.sourceCard.id,
              value: debuffValue,
              duration: action.duration === 'UNTIL_END_OF_BATTLE' ? 'THIS_BATTLE' : 'THIS_TURN',
            });
          }
        }
        break;
      }

      case EffectType.RETURN_TO_HAND: {
        // Return target cards to owner's hand
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            const owner = this.state.players[targetCard.owner];
            if (owner) {
              this.detachDonFromCard(targetId, owner.id);

              // Remove from current zone
              if (targetCard.zone === CardZone.FIELD) {
                const index = owner.field.findIndex(c => c.id === targetId);
                if (index !== -1) {
                  owner.field.splice(index, 1);
                }
              } else if (targetCard.zone === CardZone.STAGE && owner.stage?.id === targetId) {
                owner.stage = null;
              }

              // Add to hand
              targetCard.zone = CardZone.HAND;
              targetCard.state = CardState.ACTIVE;
              owner.hand.push(targetCard);
              console.log('[executeEffectAction] Returned to hand:', targetCard.cardId);
            }
          }
        }
        break;
      }

      case EffectType.REST_CHARACTER: {
        // Rest target characters
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard && targetCard.zone === CardZone.FIELD) {
            targetCard.state = CardState.RESTED;
            console.log('[executeEffectAction] Rested:', targetCard.cardId);
          }
        }
        break;
      }

      case EffectType.DRAW_CARDS: {
        // Draw cards for the effect owner
        const drawCount = action.value || 1;
        for (let i = 0; i < drawCount; i++) {
          if (context.sourcePlayer.deck.length > 0) {
            const drawnCard = context.sourcePlayer.deck.shift()!;
            drawnCard.zone = CardZone.HAND;
            context.sourcePlayer.hand.push(drawnCard);
          }
        }
        console.log('[executeEffectAction] Drew', drawCount, 'cards');
        break;
      }

      case EffectType.SEND_TO_DECK_BOTTOM: {
        // Send target cards to bottom of owner's deck
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            const owner = this.state.players[targetCard.owner];
            if (owner) {
              this.detachDonFromCard(targetId, owner.id);

              // Remove from current zone
              if (targetCard.zone === CardZone.FIELD) {
                const index = owner.field.findIndex(c => c.id === targetId);
                if (index !== -1) {
                  owner.field.splice(index, 1);
                }
              }

              // Add to bottom of deck
              targetCard.zone = CardZone.DECK;
              targetCard.state = CardState.ACTIVE;
              owner.deck.push(targetCard);
              console.log('[executeEffectAction] Sent to deck bottom:', targetCard.cardId);
            }
          }
        }
        break;
      }

      case EffectType.ATTACH_DON: {
        // Attach DON to target card
        for (const targetId of targetIds) {
          const targetCard = this.findCard(targetId);
          if (targetCard) {
            const player = context.sourcePlayer;
            // Find an active DON to attach
            const donToAttach = player.donField.find(d => d.state === CardState.ACTIVE && !d.attachedTo);
            if (donToAttach) {
              donToAttach.attachedTo = targetId;
              donToAttach.state = CardState.ATTACHED;
              console.log('[executeEffectAction] Attached DON to:', targetCard.cardId);
            }
          }
        }
        break;
      }

      default:
        // Log unhandled effect types for debugging
        console.log('[executeEffectAction] Unhandled effect type:', action.type);
        console.log('[executeEffectAction] Action details:', JSON.stringify(action, null, 2));
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
