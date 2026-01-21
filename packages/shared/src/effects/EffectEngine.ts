// Effect Engine - Core logic for processing card effects
import {
  EffectTrigger,
  EffectType,
  TargetType,
  ConditionType,
  EffectDuration,
  CardEffectDefinition,
  EffectAction,
  EffectCondition,
  ActiveEffect,
  PendingEffect,
  EffectResolutionResult,
  StateChange,
  TargetFilter,
} from './types';

import {
  GameState,
  PlayerState,
  GameCard,
  CardZone,
  CardState,
  GamePhase,
} from '../types/game';

// Card definition with effects (from database)
export interface CardDefinition {
  id: string;
  name: string;
  type: 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE';
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  traits: string[];
  effects: CardEffectDefinition[];
  keywords: string[];
}

// Effect context for resolving effects
export interface EffectContext {
  gameState: GameState;
  sourceCard: GameCard;
  sourcePlayer: PlayerState;
  triggeringEvent?: TriggerEvent;
  selectedTargets?: string[];
  attackContext?: AttackContext;
}

export interface TriggerEvent {
  type: EffectTrigger;
  cardId?: string;
  playerId?: string;
  targetId?: string;
  value?: number;
}

export interface AttackContext {
  attackerId: string;
  targetId: string;
  attackPower: number;
  counterPower: number;
  isBlocked: boolean;
  blockerId?: string;
}

export class EffectEngine {
  private cardDefinitions: Map<string, CardDefinition> = new Map();
  private activeEffects: ActiveEffect[] = [];
  private pendingEffects: PendingEffect[] = [];
  private effectIdCounter = 0;

  constructor() {}

  // ============================================
  // CARD DEFINITION MANAGEMENT
  // ============================================

  public loadCardDefinitions(cards: CardDefinition[]): void {
    cards.forEach(card => {
      this.cardDefinitions.set(card.id, card);
    });
  }

  public getCardDefinition(cardId: string): CardDefinition | undefined {
    return this.cardDefinitions.get(cardId);
  }

  // ============================================
  // TRIGGER DETECTION
  // ============================================

  public checkTriggers(
    gameState: GameState,
    event: TriggerEvent
  ): PendingEffect[] {
    const triggered: PendingEffect[] = [];

    // Check all cards on the field for matching triggers
    Object.values(gameState.players).forEach(player => {
      // Check leader
      if (player.leaderCard) {
        const leaderEffects = this.getTriggeredEffects(
          player.leaderCard,
          player,
          event,
          gameState
        );
        triggered.push(...leaderEffects);
      }

      // Check field cards
      player.field.forEach(card => {
        const cardEffects = this.getTriggeredEffects(card, player, event, gameState);
        triggered.push(...cardEffects);
      });

      // Check hand for counter effects
      if (event.type === EffectTrigger.COUNTER) {
        player.hand.forEach(card => {
          const cardEffects = this.getTriggeredEffects(card, player, event, gameState);
          triggered.push(...cardEffects);
        });
      }

      // Check life cards for trigger effects
      if (event.type === EffectTrigger.TRIGGER) {
        player.lifeCards.forEach(card => {
          if (card.faceUp) {
            const cardEffects = this.getTriggeredEffects(card, player, event, gameState);
            triggered.push(...cardEffects);
          }
        });
      }
    });

    // Sort by priority (mandatory effects first)
    return triggered.sort((a, b) => b.priority - a.priority);
  }

  private getTriggeredEffects(
    card: GameCard,
    player: PlayerState,
    event: TriggerEvent,
    gameState: GameState
  ): PendingEffect[] {
    const definition = this.cardDefinitions.get(card.cardId);
    if (!definition) return [];

    const triggered: PendingEffect[] = [];

    definition.effects.forEach(effect => {
      if (this.doesTriggerMatch(effect, event, card, player, gameState)) {
        triggered.push({
          id: `pending-${++this.effectIdCounter}`,
          sourceCardId: card.id,
          playerId: player.id,
          effect,
          trigger: event.type,
          requiresChoice: this.effectRequiresChoice(effect),
          priority: effect.isOptional ? 0 : 1,
        });
      }
    });

    return triggered;
  }

  private doesTriggerMatch(
    effect: CardEffectDefinition,
    event: TriggerEvent,
    sourceCard: GameCard,
    player: PlayerState,
    gameState: GameState
  ): boolean {
    // Check if trigger type matches
    if (effect.trigger !== event.type) return false;

    // Check DON! requirements for DON_X triggers
    if (effect.trigger === EffectTrigger.DON_X && effect.triggerValue) {
      const attachedDon = this.getAttachedDonCount(sourceCard, player);
      if (attachedDon < effect.triggerValue) return false;
    }

    // Check conditions
    if (effect.conditions) {
      const context: EffectContext = {
        gameState,
        sourceCard,
        sourcePlayer: player,
        triggeringEvent: event,
      };

      for (const condition of effect.conditions) {
        if (!this.checkCondition(condition, context)) {
          return false;
        }
      }
    }

    return true;
  }

  // ============================================
  // CONDITION CHECKING
  // ============================================

  public checkCondition(condition: EffectCondition, context: EffectContext): boolean {
    const { gameState, sourcePlayer } = context;
    const opponent = this.getOpponent(gameState, sourcePlayer.id);

    switch (condition.type) {
      // DON! conditions
      case ConditionType.DON_COUNT_OR_MORE:
        return sourcePlayer.donField.filter(d => d.state === CardState.ACTIVE).length >= (condition.value || 0);

      case ConditionType.DON_COUNT_OR_LESS:
        return sourcePlayer.donField.filter(d => d.state === CardState.ACTIVE).length <= (condition.value || 0);

      // Life conditions
      case ConditionType.LIFE_COUNT_OR_MORE:
        return sourcePlayer.life >= (condition.value || 0);

      case ConditionType.LIFE_COUNT_OR_LESS:
        return sourcePlayer.life <= (condition.value || 0);

      case ConditionType.LESS_LIFE_THAN_OPPONENT:
        return opponent ? sourcePlayer.life < opponent.life : false;

      case ConditionType.MORE_LIFE_THAN_OPPONENT:
        return opponent ? sourcePlayer.life > opponent.life : false;

      // Hand conditions
      case ConditionType.HAND_COUNT_OR_MORE:
        return sourcePlayer.hand.length >= (condition.value || 0);

      case ConditionType.HAND_COUNT_OR_LESS:
        return sourcePlayer.hand.length <= (condition.value || 0);

      case ConditionType.HAND_EMPTY:
        return sourcePlayer.hand.length === 0;

      // Field conditions
      case ConditionType.CHARACTER_COUNT_OR_MORE:
        return sourcePlayer.field.length >= (condition.value || 0);

      case ConditionType.CHARACTER_COUNT_OR_LESS:
        return sourcePlayer.field.length <= (condition.value || 0);

      case ConditionType.HAS_CHARACTER_WITH_TRAIT:
        return this.hasCharacterWithTrait(sourcePlayer, condition.traits || []);

      case ConditionType.HAS_CHARACTER_WITH_NAME:
        return this.hasCharacterWithName(sourcePlayer, condition.names || []);

      // Turn conditions
      case ConditionType.YOUR_TURN:
        return gameState.activePlayerId === sourcePlayer.id;

      case ConditionType.OPPONENT_TURN:
        return gameState.activePlayerId !== sourcePlayer.id;

      // Trash conditions
      case ConditionType.TRASH_COUNT_OR_MORE:
        return sourcePlayer.trash.length >= (condition.value || 0);

      // State conditions
      case ConditionType.IS_RESTED:
        return context.sourceCard.state === CardState.RESTED;

      case ConditionType.IS_ACTIVE:
        return context.sourceCard.state === CardState.ACTIVE;

      default:
        return true;
    }
  }

  // ============================================
  // EFFECT RESOLUTION
  // ============================================

  public resolveEffect(
    effect: CardEffectDefinition,
    context: EffectContext
  ): EffectResolutionResult {
    const changes: StateChange[] = [];
    const childEffects: PendingEffect[] = [];

    // Check if costs can be paid
    if (effect.costs) {
      const canPayCosts = this.canPayCosts(effect.costs, context);
      if (!canPayCosts) {
        return {
          success: false,
          effectId: effect.id,
          changes: [],
          error: 'Cannot pay effect costs',
        };
      }

      // Pay costs
      const costChanges = this.payCosts(effect.costs, context);
      changes.push(...costChanges);
    }

    // Resolve each effect action
    for (const action of effect.effects) {
      const result = this.resolveAction(action, context);
      changes.push(...result.changes);
      if (result.childEffects) {
        childEffects.push(...result.childEffects);
      }
    }

    // Track active effect if it has duration
    const hasDuration = effect.effects.some(
      e => e.duration && e.duration !== EffectDuration.INSTANT
    );

    if (hasDuration) {
      this.activeEffects.push({
        id: `active-${++this.effectIdCounter}`,
        sourceCardId: context.sourceCard.id,
        sourcePlayerId: context.sourcePlayer.id,
        effectDefinition: effect,
        appliedAt: context.gameState.turn,
        targetIds: context.selectedTargets,
      });
    }

    return {
      success: true,
      effectId: effect.id,
      changes,
      childEffects: childEffects.length > 0 ? childEffects : undefined,
    };
  }

  private resolveAction(
    action: EffectAction,
    context: EffectContext
  ): { changes: StateChange[]; childEffects?: PendingEffect[] } {
    const changes: StateChange[] = [];
    const { gameState, sourcePlayer } = context;
    const targets = context.selectedTargets || [];

    switch (action.type) {
      // ============ KEYWORD EFFECTS ============
      case EffectType.RUSH:
        // Card can attack immediately
        if (context.sourceCard.turnPlayed === gameState.turn) {
          context.sourceCard.hasAttacked = false;
        }
        changes.push({
          type: 'KEYWORD_ADDED',
          cardId: context.sourceCard.id,
          value: 'Rush',
        });
        break;

      case EffectType.BLOCKER:
        changes.push({
          type: 'KEYWORD_ADDED',
          cardId: context.sourceCard.id,
          value: 'Blocker',
        });
        break;

      case EffectType.DOUBLE_ATTACK:
        changes.push({
          type: 'KEYWORD_ADDED',
          cardId: context.sourceCard.id,
          value: 'Double Attack',
        });
        break;

      case EffectType.BANISH:
        changes.push({
          type: 'KEYWORD_ADDED',
          cardId: context.sourceCard.id,
          value: 'Banish',
        });
        break;

      // ============ POWER EFFECTS ============
      case EffectType.BUFF_SELF:
        context.sourceCard.power = (context.sourceCard.power || 0) + (action.value || 0);
        changes.push({
          type: 'POWER_CHANGED',
          cardId: context.sourceCard.id,
          value: action.value,
        });
        break;

      case EffectType.BUFF_POWER:
      case EffectType.BUFF_ANY:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            card.power = (card.power || 0) + (action.value || 0);
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: action.value,
            });
          }
        });
        break;

      case EffectType.DEBUFF_POWER:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            card.power = Math.max(0, (card.power || 0) - (action.value || 0));
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: -(action.value || 0),
            });
          }
        });
        break;

      case EffectType.SET_POWER_ZERO:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            card.power = 0;
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: 0,
            });
          }
        });
        break;

      // ============ DRAW EFFECTS ============
      case EffectType.DRAW_CARDS:
        for (let i = 0; i < (action.value || 1); i++) {
          if (sourcePlayer.deck.length > 0) {
            const drawnCard = sourcePlayer.deck.shift()!;
            drawnCard.zone = CardZone.HAND;
            sourcePlayer.hand.push(drawnCard);
            changes.push({
              type: 'CARD_MOVED',
              cardId: drawnCard.id,
              from: 'DECK',
              to: 'HAND',
            });
            changes.push({
              type: 'PLAYER_DREW',
              playerId: sourcePlayer.id,
              value: 1,
            });
          }
        }
        break;

      case EffectType.MILL_DECK:
        const opponent = this.getOpponent(gameState, sourcePlayer.id);
        if (opponent) {
          for (let i = 0; i < (action.value || 1); i++) {
            if (opponent.deck.length > 0) {
              const milledCard = opponent.deck.shift()!;
              milledCard.zone = CardZone.TRASH;
              opponent.trash.push(milledCard);
              changes.push({
                type: 'CARD_MOVED',
                cardId: milledCard.id,
                from: 'DECK',
                to: 'TRASH',
              });
            }
          }
        }
        break;

      // ============ DON! EFFECTS ============
      case EffectType.GAIN_ACTIVE_DON:
        for (let i = 0; i < (action.value || 1); i++) {
          if (sourcePlayer.donDeck > 0) {
            sourcePlayer.donDeck--;
            const newDon: GameCard = {
              id: `${sourcePlayer.id}-don-${Date.now()}-${i}`,
              cardId: 'DON',
              zone: CardZone.DON_FIELD,
              state: CardState.ACTIVE,
              owner: sourcePlayer.id,
            };
            sourcePlayer.donField.push(newDon);
            changes.push({
              type: 'DON_CHANGED',
              playerId: sourcePlayer.id,
              value: 1,
            });
          }
        }
        break;

      case EffectType.GAIN_RESTED_DON:
        for (let i = 0; i < (action.value || 1); i++) {
          if (sourcePlayer.donDeck > 0) {
            sourcePlayer.donDeck--;
            const newDon: GameCard = {
              id: `${sourcePlayer.id}-don-${Date.now()}-${i}`,
              cardId: 'DON',
              zone: CardZone.DON_FIELD,
              state: CardState.RESTED,
              owner: sourcePlayer.id,
            };
            sourcePlayer.donField.push(newDon);
            changes.push({
              type: 'DON_CHANGED',
              playerId: sourcePlayer.id,
              value: 1,
            });
          }
        }
        break;

      // ============ KO EFFECTS ============
      case EffectType.KO_CHARACTER:
        targets.forEach(targetId => {
          const result = this.koCard(gameState, targetId);
          changes.push(...result);
        });
        break;

      case EffectType.KO_COST_OR_LESS:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card && (card.cost || 0) <= (action.value || 0)) {
            const result = this.koCard(gameState, targetId);
            changes.push(...result);
          }
        });
        break;

      case EffectType.KO_POWER_OR_LESS:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card && (card.power || 0) <= (action.value || 0)) {
            const result = this.koCard(gameState, targetId);
            changes.push(...result);
          }
        });
        break;

      // ============ CARD MOVEMENT ============
      case EffectType.RETURN_TO_HAND:
        targets.forEach(targetId => {
          const result = this.returnToHand(gameState, targetId);
          changes.push(...result);
        });
        break;

      case EffectType.SEND_TO_DECK_BOTTOM:
        targets.forEach(targetId => {
          const result = this.sendToDeckBottom(gameState, targetId);
          changes.push(...result);
        });
        break;

      case EffectType.SEND_TO_TRASH:
        targets.forEach(targetId => {
          const result = this.sendToTrash(gameState, targetId);
          changes.push(...result);
        });
        break;

      // ============ REST/ACTIVATE ============
      case EffectType.REST_CHARACTER:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card && card.state === CardState.ACTIVE) {
            card.state = CardState.RESTED;
            changes.push({
              type: 'CARD_MOVED', // Using for state change
              cardId: targetId,
              from: 'ACTIVE',
              to: 'RESTED',
            });
          }
        });
        break;

      case EffectType.ACTIVATE_CHARACTER:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card && card.state === CardState.RESTED) {
            card.state = CardState.ACTIVE;
            changes.push({
              type: 'CARD_MOVED',
              cardId: targetId,
              from: 'RESTED',
              to: 'ACTIVE',
            });
          }
        });
        break;

      case EffectType.FREEZE:
        // Card can't be activated at start of next turn
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            card.state = CardState.RESTED;
            // Mark as frozen (can't untap)
            if (!card.keywords) card.keywords = [];
            card.keywords.push('Frozen');
            changes.push({
              type: 'KEYWORD_ADDED',
              cardId: targetId,
              value: 'Frozen',
            });
          }
        });
        break;

      // ============ LIFE EFFECTS ============
      case EffectType.ADD_TO_LIFE:
        for (let i = 0; i < (action.value || 1); i++) {
          if (sourcePlayer.deck.length > 0) {
            const card = sourcePlayer.deck.shift()!;
            card.zone = CardZone.LIFE;
            card.faceUp = false;
            sourcePlayer.lifeCards.push(card);
            sourcePlayer.life++;
            changes.push({
              type: 'LIFE_CHANGED',
              playerId: sourcePlayer.id,
              value: 1,
            });
          }
        }
        break;

      case EffectType.TAKE_LIFE:
        const targetPlayer = action.target?.type === TargetType.OPPONENT_LIFE
          ? this.getOpponent(gameState, sourcePlayer.id)
          : sourcePlayer;

        if (targetPlayer) {
          for (let i = 0; i < (action.value || 1); i++) {
            if (targetPlayer.lifeCards.length > 0) {
              const lifeCard = targetPlayer.lifeCards.pop()!;
              lifeCard.zone = CardZone.HAND;
              targetPlayer.hand.push(lifeCard);
              targetPlayer.life--;
              changes.push({
                type: 'LIFE_CHANGED',
                playerId: targetPlayer.id,
                value: -1,
              });
            }
          }
        }
        break;

      // ============ GRANT EFFECTS ============
      case EffectType.GRANT_KEYWORD:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.keywords) card.keywords = [];
            card.keywords.push(action.keyword || '');
            changes.push({
              type: 'KEYWORD_ADDED',
              cardId: targetId,
              value: action.keyword,
            });
          }
        });
        break;

      default:
        console.warn(`Unhandled effect type: ${action.type}`);
    }

    return { changes };
  }

  // ============================================
  // KEYWORD ABILITY CHECKING
  // ============================================

  public hasKeyword(card: GameCard, keyword: string): boolean {
    if (!card.keywords) return false;
    return card.keywords.includes(keyword);
  }

  public canAttackOnPlayTurn(card: GameCard, currentTurn: number): boolean {
    // Check if card has Rush keyword
    if (this.hasKeyword(card, 'Rush')) {
      return true;
    }

    // Cards can normally only attack if they weren't played this turn
    return card.turnPlayed !== currentTurn;
  }

  public canBlock(card: GameCard): boolean {
    // Card must have Blocker keyword and be active
    return this.hasKeyword(card, 'Blocker') && card.state === CardState.ACTIVE;
  }

  public hasBanish(card: GameCard): boolean {
    return this.hasKeyword(card, 'Banish');
  }

  public hasDoubleAttack(card: GameCard): boolean {
    return this.hasKeyword(card, 'Double Attack');
  }

  public isUnblockable(card: GameCard): boolean {
    return this.hasKeyword(card, 'Unblockable');
  }

  // ============================================
  // COST HANDLING
  // ============================================

  private canPayCosts(costs: any[], context: EffectContext): boolean {
    for (const cost of costs) {
      switch (cost.type) {
        case 'DON':
          const activeDon = context.sourcePlayer.donField.filter(
            d => d.state === CardState.ACTIVE
          );
          if (activeDon.length < (cost.count || 0)) return false;
          break;

        case 'TRASH_CARD':
          if (context.sourcePlayer.hand.length < (cost.count || 0)) return false;
          break;

        case 'LIFE':
          if (context.sourcePlayer.life < (cost.count || 0)) return false;
          break;
      }
    }
    return true;
  }

  private payCosts(costs: any[], context: EffectContext): StateChange[] {
    const changes: StateChange[] = [];

    for (const cost of costs) {
      switch (cost.type) {
        case 'DON':
          for (let i = 0; i < (cost.count || 0); i++) {
            const don = context.sourcePlayer.donField.find(
              d => d.state === CardState.ACTIVE
            );
            if (don) {
              don.state = CardState.RESTED;
              changes.push({
                type: 'DON_CHANGED',
                playerId: context.sourcePlayer.id,
                cardId: don.id,
              });
            }
          }
          break;
      }
    }

    return changes;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getOpponent(gameState: GameState, playerId: string): PlayerState | undefined {
    return Object.values(gameState.players).find(p => p.id !== playerId);
  }

  private findCard(gameState: GameState, cardId: string): GameCard | undefined {
    for (const player of Object.values(gameState.players)) {
      const allCards = [
        ...player.hand,
        ...player.field,
        ...player.trash,
        ...player.deck,
        ...player.lifeCards,
        ...player.donField,
        player.leaderCard,
      ].filter(Boolean) as GameCard[];

      const card = allCards.find(c => c.id === cardId);
      if (card) return card;
    }
    return undefined;
  }

  private findCardOwner(gameState: GameState, cardId: string): PlayerState | undefined {
    for (const player of Object.values(gameState.players)) {
      const allCards = [
        ...player.hand,
        ...player.field,
        ...player.trash,
        ...player.deck,
        ...player.lifeCards,
        ...player.donField,
        player.leaderCard,
      ].filter(Boolean) as GameCard[];

      if (allCards.some(c => c.id === cardId)) {
        return player;
      }
    }
    return undefined;
  }

  private getAttachedDonCount(card: GameCard, player: PlayerState): number {
    return player.donField.filter(d => d.attachedTo === card.id).length;
  }

  private hasCharacterWithTrait(player: PlayerState, traits: string[]): boolean {
    return player.field.some(card => {
      const def = this.cardDefinitions.get(card.cardId);
      return def && traits.some(t => def.traits.includes(t));
    });
  }

  private hasCharacterWithName(player: PlayerState, names: string[]): boolean {
    return player.field.some(card => {
      const def = this.cardDefinitions.get(card.cardId);
      return def && names.includes(def.name);
    });
  }

  private effectRequiresChoice(effect: CardEffectDefinition): boolean {
    return effect.effects.some(action => {
      return action.target && action.target.count !== undefined;
    });
  }

  // ============================================
  // CARD OPERATIONS
  // ============================================

  private koCard(gameState: GameState, cardId: string): StateChange[] {
    const changes: StateChange[] = [];
    const owner = this.findCardOwner(gameState, cardId);
    if (!owner) return changes;

    const fieldIndex = owner.field.findIndex(c => c.id === cardId);
    if (fieldIndex !== -1) {
      const card = owner.field.splice(fieldIndex, 1)[0];
      card.zone = CardZone.TRASH;
      owner.trash.push(card);

      // Detach DON!
      owner.donField.forEach(don => {
        if (don.attachedTo === cardId) {
          don.attachedTo = undefined;
          don.state = CardState.ACTIVE;
        }
      });

      changes.push({
        type: 'CARD_DESTROYED',
        cardId: cardId,
        playerId: owner.id,
      });
    }

    return changes;
  }

  private returnToHand(gameState: GameState, cardId: string): StateChange[] {
    const changes: StateChange[] = [];
    const owner = this.findCardOwner(gameState, cardId);
    if (!owner) return changes;

    const fieldIndex = owner.field.findIndex(c => c.id === cardId);
    if (fieldIndex !== -1) {
      const card = owner.field.splice(fieldIndex, 1)[0];
      card.zone = CardZone.HAND;
      card.state = CardState.ACTIVE;
      owner.hand.push(card);

      changes.push({
        type: 'CARD_MOVED',
        cardId: cardId,
        from: 'FIELD',
        to: 'HAND',
      });
    }

    return changes;
  }

  private sendToDeckBottom(gameState: GameState, cardId: string): StateChange[] {
    const changes: StateChange[] = [];
    const owner = this.findCardOwner(gameState, cardId);
    if (!owner) return changes;

    // Check field
    let cardIndex = owner.field.findIndex(c => c.id === cardId);
    let sourceZone = 'FIELD';

    if (cardIndex === -1) {
      cardIndex = owner.hand.findIndex(c => c.id === cardId);
      sourceZone = 'HAND';
    }

    if (cardIndex !== -1) {
      const sourceArray = sourceZone === 'FIELD' ? owner.field : owner.hand;
      const card = sourceArray.splice(cardIndex, 1)[0];
      card.zone = CardZone.DECK;
      owner.deck.push(card);

      changes.push({
        type: 'CARD_MOVED',
        cardId: cardId,
        from: sourceZone,
        to: 'DECK_BOTTOM',
      });
    }

    return changes;
  }

  private sendToTrash(gameState: GameState, cardId: string): StateChange[] {
    const changes: StateChange[] = [];
    const owner = this.findCardOwner(gameState, cardId);
    if (!owner) return changes;

    // Check various zones
    const zones: { array: GameCard[]; name: string }[] = [
      { array: owner.field, name: 'FIELD' },
      { array: owner.hand, name: 'HAND' },
    ];

    for (const zone of zones) {
      const idx = zone.array.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const card = zone.array.splice(idx, 1)[0];
        card.zone = CardZone.TRASH;
        owner.trash.push(card);

        changes.push({
          type: 'CARD_MOVED',
          cardId: cardId,
          from: zone.name,
          to: 'TRASH',
        });
        break;
      }
    }

    return changes;
  }

  // ============================================
  // VALID TARGET CALCULATION
  // ============================================

  public getValidTargets(
    action: EffectAction,
    context: EffectContext
  ): string[] {
    const { gameState, sourcePlayer } = context;
    const opponent = this.getOpponent(gameState, sourcePlayer.id);
    let targets: GameCard[] = [];

    if (!action.target) return [];

    switch (action.target.type) {
      case TargetType.YOUR_CHARACTER:
        targets = sourcePlayer.field;
        break;

      case TargetType.OPPONENT_CHARACTER:
        targets = opponent?.field || [];
        break;

      case TargetType.ANY_CHARACTER:
        targets = [...sourcePlayer.field, ...(opponent?.field || [])];
        break;

      case TargetType.YOUR_LEADER:
        targets = sourcePlayer.leaderCard ? [sourcePlayer.leaderCard] : [];
        break;

      case TargetType.OPPONENT_LEADER:
        targets = opponent?.leaderCard ? [opponent.leaderCard] : [];
        break;

      case TargetType.YOUR_HAND:
        targets = sourcePlayer.hand;
        break;

      case TargetType.YOUR_TRASH:
        targets = sourcePlayer.trash;
        break;

      case TargetType.OPPONENT_TRASH:
        targets = opponent?.trash || [];
        break;

      case TargetType.YOUR_DON:
        targets = sourcePlayer.donField;
        break;

      default:
        targets = [];
    }

    // Apply filters
    if (action.target.filters) {
      targets = this.applyFilters(targets, action.target.filters);
    }

    return targets.map(c => c.id);
  }

  private applyFilters(cards: GameCard[], filters: TargetFilter[]): GameCard[] {
    return cards.filter(card => {
      const def = this.cardDefinitions.get(card.cardId);
      if (!def) return false;

      return filters.every(filter => {
        switch (filter.property) {
          case 'COST':
            const costValue = filter.value as number;
            if (filter.operator === 'OR_LESS') return (def.cost || 0) <= costValue;
            if (filter.operator === 'OR_MORE') return (def.cost || 0) >= costValue;
            if (filter.operator === 'EQUALS') return def.cost === costValue;
            break;

          case 'POWER':
            const power = card.power || def.power || 0;
            const powerValue = filter.value as number;
            if (filter.operator === 'OR_LESS') return power <= powerValue;
            if (filter.operator === 'OR_MORE') return power >= powerValue;
            if (filter.operator === 'EQUALS') return power === powerValue;
            break;

          case 'COLOR':
            const colors = filter.value as string[];
            if (filter.operator === 'CONTAINS') {
              return colors.some(c => def.colors.includes(c));
            }
            break;

          case 'TRAIT':
            const traits = filter.value as string[];
            if (filter.operator === 'CONTAINS') {
              return traits.some(t => def.traits.includes(t));
            }
            break;

          case 'TYPE':
            if (filter.operator === 'EQUALS') {
              return def.type === filter.value;
            }
            break;

          case 'STATE':
            if (filter.operator === 'EQUALS') {
              return card.state === filter.value;
            }
            break;
        }

        return true;
      });
    });
  }

  // ============================================
  // ACTIVE EFFECT MANAGEMENT
  // ============================================

  public cleanupExpiredEffects(gameState: GameState): StateChange[] {
    const changes: StateChange[] = [];
    const currentTurn = gameState.turn;

    this.activeEffects = this.activeEffects.filter(effect => {
      const shouldRemove = this.shouldRemoveEffect(effect, gameState, currentTurn);
      if (shouldRemove) {
        changes.push({
          type: 'EFFECT_REMOVED',
          cardId: effect.sourceCardId,
          value: effect.id,
        });
      }
      return !shouldRemove;
    });

    return changes;
  }

  private shouldRemoveEffect(
    effect: ActiveEffect,
    gameState: GameState,
    currentTurn: number
  ): boolean {
    const duration = effect.effectDefinition.effects[0]?.duration;
    if (!duration || duration === EffectDuration.PERMANENT) return false;

    switch (duration) {
      case EffectDuration.UNTIL_END_OF_TURN:
        return currentTurn > effect.appliedAt;

      case EffectDuration.UNTIL_END_OF_BATTLE:
        return gameState.phase !== GamePhase.COMBAT_PHASE;

      case EffectDuration.WHILE_ON_FIELD:
        const card = this.findCard(gameState, effect.sourceCardId);
        return !card || card.zone !== CardZone.FIELD;

      default:
        return false;
    }
  }

  public getActiveEffects(): ActiveEffect[] {
    return [...this.activeEffects];
  }

  public getPendingEffects(): PendingEffect[] {
    return [...this.pendingEffects];
  }

  public addPendingEffect(effect: PendingEffect): void {
    this.pendingEffects.push(effect);
  }

  public removePendingEffect(effectId: string): void {
    this.pendingEffects = this.pendingEffects.filter(e => e.id !== effectId);
  }
}

// Export singleton for convenience
export const effectEngine = new EffectEngine();
