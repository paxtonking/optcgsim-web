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
  PowerBuff,
  BuffDuration,
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
  life?: number;  // Life count for leaders (4 or 5)
  effectText?: string;  // Raw effect text for parsing leader restrictions, etc.
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
  private buffIdCounter = 0;

  constructor() {}

  // ============================================
  // BUFF TRACKING HELPERS
  // ============================================

  private generateBuffId(): string {
    return `buff-${++this.buffIdCounter}`;
  }

  /**
   * Map EffectDuration to BuffDuration
   */
  private mapDurationToBuff(duration?: EffectDuration): BuffDuration {
    switch (duration) {
      case EffectDuration.UNTIL_END_OF_TURN:
        return 'THIS_TURN';
      case EffectDuration.UNTIL_END_OF_BATTLE:
        return 'THIS_BATTLE';
      case EffectDuration.PERMANENT:
      case EffectDuration.WHILE_ON_FIELD:
        return 'PERMANENT';
      case EffectDuration.INSTANT:
      default:
        // Default to THIS_TURN for "during this turn" effects
        return 'THIS_TURN';
    }
  }

  /**
   * Add a power buff to a card with proper tracking
   */
  private addPowerBuff(
    card: GameCard,
    value: number,
    duration: BuffDuration,
    sourceCardId: string,
    gameState: GameState
  ): void {
    if (!card.powerBuffs) {
      card.powerBuffs = [];
    }

    const buff: PowerBuff = {
      id: this.generateBuffId(),
      sourceCardId,
      value,
      duration,
      appliedTurn: gameState.turn,
      appliedCombatId: gameState.currentCombat ? `${gameState.turn}-${gameState.currentCombat.attackerId}` : undefined,
    };

    card.powerBuffs.push(buff);
  }

  /**
   * Calculate effective power including base power, buffs, and DON
   */
  public getEffectivePower(card: GameCard, gameState: GameState, player: PlayerState): number {
    const base = card.basePower ?? card.power ?? 0;

    // Sum active buffs
    const buffTotal = (card.powerBuffs || [])
      .filter(buff => this.isBuffActive(buff, gameState))
      .reduce((sum, buff) => sum + buff.value, 0);

    // DON bonus (+1000 per attached DON)
    const donCount = this.getAttachedDonCount(card, player);
    const donBonus = donCount * 1000;

    return base + buffTotal + donBonus;
  }

  /**
   * Check if a buff is still active based on its duration
   */
  public isBuffActive(buff: PowerBuff, gameState: GameState): boolean {
    if (buff.duration === 'PERMANENT') return true;

    if (buff.duration === 'THIS_TURN') {
      return buff.appliedTurn === gameState.turn;
    }

    if (buff.duration === 'THIS_BATTLE') {
      const currentCombatId = gameState.currentCombat
        ? `${gameState.turn}-${gameState.currentCombat.attackerId}`
        : undefined;
      return buff.appliedCombatId === currentCombatId;
    }

    return false;
  }

  /**
   * Clear expired buffs from a card
   */
  public clearExpiredBuffs(card: GameCard, gameState: GameState): void {
    if (!card.powerBuffs) return;
    card.powerBuffs = card.powerBuffs.filter(buff => this.isBuffActive(buff, gameState));
  }

  // ============================================
  // CARD DEFINITION MANAGEMENT
  // ============================================

  public loadCardDefinitions(cards: CardDefinition[]): void {
    // Check for duplicates and warn
    const seen = new Set<string>();
    const duplicates: string[] = [];

    cards.forEach(card => {
      if (seen.has(card.id)) {
        duplicates.push(card.id);
      }
      seen.add(card.id);
      this.cardDefinitions.set(card.id, card);
    });

    if (duplicates.length > 0) {
      console.warn('[EffectEngine] WARNING: Duplicate card IDs found:', duplicates);
      console.warn('[EffectEngine] Later definitions will overwrite earlier ones.');
    }

    console.log(`[EffectEngine] Loaded ${this.cardDefinitions.size} card definitions`);
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
        const pendingEffect = {
          id: `pending-${++this.effectIdCounter}`,
          sourceCardId: card.id,
          playerId: player.id,
          effect,
          trigger: event.type,
          requiresChoice: this.effectRequiresChoice(effect),
          priority: effect.isOptional ? 0 : 1,
        };
        console.log(`[EffectEngine] Creating PendingEffect - card: ${card.cardId}, cardOwner: ${player.id}, eventPlayerId: ${event.playerId}, trigger: ${event.type}, requiresChoice: ${pendingEffect.requiresChoice}`);
        triggered.push(pendingEffect);
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

    // ON_PLAY triggers should only fire for the card that was just played
    if (effect.trigger === EffectTrigger.ON_PLAY) {
      if (event.cardId !== sourceCard.id) return false;
    }

    // Check DON! requirements for DON_X triggers
    if (effect.trigger === EffectTrigger.DON_X && effect.triggerValue) {
      const attachedDon = this.getAttachedDonCount(sourceCard, player);
      if (attachedDon < effect.triggerValue) return false;
    }

    // YOUR_TURN trigger - only fires for the card owner when it's their turn
    if (effect.trigger === EffectTrigger.YOUR_TURN) {
      if (gameState.activePlayerId !== player.id) return false;
    }

    // OPPONENT_TURN trigger - only fires for the card owner when it's opponent's turn
    if (effect.trigger === EffectTrigger.OPPONENT_TURN) {
      if (gameState.activePlayerId === player.id) return false;
    }

    // ON_PLAY_FROM_TRIGGER - only fires for the card that was just played via Trigger ability
    if (effect.trigger === EffectTrigger.ON_PLAY_FROM_TRIGGER) {
      if (event.cardId !== sourceCard.id) return false;
    }

    // AFTER_KO_CHARACTER - fires for all cards on field when any character is KO'd
    // The source card should NOT be the KO'd card (use ON_KO for that)
    if (effect.trigger === EffectTrigger.AFTER_KO_CHARACTER) {
      // This fires for cards that care about other characters being KO'd
      // Don't require the source card to be the KO'd card
    }

    // ANY_CHARACTER_KOD - fires for all cards when any character is KO'd (yours or opponent's)
    if (effect.trigger === EffectTrigger.ANY_CHARACTER_KOD) {
      // This fires for any card on the field when ANY character is KO'd
    }

    // LIFE_ADDED_TO_HAND - fires when a life card is added to hand
    if (effect.trigger === EffectTrigger.LIFE_ADDED_TO_HAND) {
      // Only fires for cards owned by the player who received the life card
      if (event.playerId !== player.id) return false;
    }

    // HIT_LEADER - fires when the leader takes damage
    if (effect.trigger === EffectTrigger.HIT_LEADER) {
      // Only fires for cards owned by the player whose leader was hit
      if (event.targetId) {
        // targetId is the leader that was hit
        const hitPlayer = Object.values(gameState.players).find(p => p.leaderCard?.id === event.targetId);
        if (hitPlayer && hitPlayer.id !== player.id) return false;
      }
    }

    // DON_TAP - fires when DON is rested/tapped to pay costs
    if (effect.trigger === EffectTrigger.DON_TAP) {
      // Only fires for the player who tapped the DON
      if (event.playerId !== player.id) return false;
    }

    // ATTACH_DON - fires when DON is attached to a character
    if (effect.trigger === EffectTrigger.ATTACH_DON) {
      // Can fire for the card receiving the DON or other cards watching
      // If the effect is on the card receiving DON, check cardId
      if (event.targetId && event.targetId === sourceCard.id) {
        // This is the card receiving the DON - allow trigger
      } else if (event.playerId !== player.id) {
        // For other cards watching, only trigger for the player who attached
        return false;
      }
    }

    // PRE_KO - fires before a character would be KO'd (allows prevention effects)
    if (effect.trigger === EffectTrigger.PRE_KO) {
      // Only fires for the card that is about to be KO'd
      if (event.cardId !== sourceCard.id) return false;
    }

    // OPPONENT_PLAYS_EVENT - fires when opponent plays an Event card
    if (effect.trigger === EffectTrigger.OPPONENT_PLAYS_EVENT) {
      // Only fires for cards owned by the opponent of the event player
      if (event.playerId === player.id) return false;
    }

    // OPPONENT_DEPLOYS - fires when opponent deploys a character
    if (effect.trigger === EffectTrigger.OPPONENT_DEPLOYS) {
      // Only fires for cards owned by the opponent of the deploying player
      if (event.playerId === player.id) return false;
    }

    // OPPONENT_ACTIVATES_BLOCKER - fires when opponent activates a Blocker
    if (effect.trigger === EffectTrigger.OPPONENT_ACTIVATES_BLOCKER) {
      // Only fires for cards owned by the opponent of the blocking player
      if (event.playerId === player.id) return false;
    }

    // OPPONENT_CHARACTER_KOD - fires when an opponent's character is KO'd
    if (effect.trigger === EffectTrigger.OPPONENT_CHARACTER_KOD) {
      // The KO'd card should belong to the opponent
      if (event.playerId === player.id) return false;
    }

    // KO_ALLY - fires when your own character is KO'd
    if (effect.trigger === EffectTrigger.KO_ALLY) {
      // The KO'd card should belong to you
      if (event.playerId !== player.id) return false;
      // Don't trigger for the card that was KO'd itself
      if (event.cardId === sourceCard.id) return false;
    }

    // DON_RETURNED - fires when DON is returned to DON deck
    if (effect.trigger === EffectTrigger.DON_RETURNED) {
      // Only fires for the player whose DON was returned
      if (event.playerId !== player.id) return false;
    }

    // LIFE_REACHES_ZERO - fires when life reaches zero
    if (effect.trigger === EffectTrigger.LIFE_REACHES_ZERO) {
      // Only fires for the player whose life reached zero
      if (event.playerId !== player.id) return false;
    }

    // ANY_HIT_LEADER - fires when any leader takes damage (yours or opponent's)
    if (effect.trigger === EffectTrigger.ANY_HIT_LEADER) {
      // This fires for any card on the field when any leader is hit
      // No additional filtering needed - always fires for matching cards
    }

    // TRASH_X - fires when trashing cards (as cost or effect)
    if (effect.trigger === EffectTrigger.TRASH_X) {
      // Only fires for the player who trashed the cards
      if (event.playerId !== player.id) return false;
    }

    // TRASH_SELF - fires when this card is trashed
    if (effect.trigger === EffectTrigger.TRASH_SELF) {
      // Only fires for the card that was trashed
      if (event.cardId !== sourceCard.id) return false;
    }

    // TRASH_ALLY - fires when an ally (your character) is trashed
    if (effect.trigger === EffectTrigger.TRASH_ALLY) {
      // The trashed card should belong to you
      if (event.playerId !== player.id) return false;
      // Don't trigger for the card that was trashed itself
      if (event.cardId === sourceCard.id) return false;
    }

    // CARD_DRAWN - fires when drawing a card
    if (effect.trigger === EffectTrigger.CARD_DRAWN) {
      // Only fires for the player who drew the card
      if (event.playerId !== player.id) return false;
    }

    // DEPLOYED_FROM_HAND - fires when a card is played from hand
    if (effect.trigger === EffectTrigger.DEPLOYED_FROM_HAND) {
      // Only fires for the player who deployed the card
      if (event.playerId !== player.id) return false;
    }

    // WHILE_RESTED - continuous effect while this card is rested
    if (effect.trigger === EffectTrigger.WHILE_RESTED) {
      // Only active when the source card is rested
      if (sourceCard.state !== CardState.RESTED) return false;
    }

    // MANDATORY - mandatory effect that must activate
    if (effect.trigger === EffectTrigger.MANDATORY) {
      // No additional checks - always matches if the effect conditions are met
    }

    // HAND_EMPTY - fires when hand becomes empty
    if (effect.trigger === EffectTrigger.HAND_EMPTY) {
      // Only fires for the player whose hand became empty
      if (event.playerId !== player.id) return false;
      // Verify hand is actually empty
      if (player.hand.length > 0) return false;
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

      case ConditionType.DON_ATTACHED_OR_MORE:
        // Check if the source card has X or more DON attached (for [DON!! x1] etc.)
        const attachedDonCount = this.getAttachedDonCount(context.sourceCard, sourcePlayer);
        return attachedDonCount >= (condition.value || 0);

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

      // Leader conditions
      case ConditionType.LEADER_HAS_TRAIT:
        return this.leaderHasTrait(sourcePlayer, condition.traits || []);

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
    console.log('[resolveEffect] Called with effect:', {
      id: effect.id,
      trigger: effect.trigger,
      effectTypes: effect.effects.map(e => e.type),
      selectedTargets: context.selectedTargets,
    });

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
    console.log('[resolveAction] Processing action type:', action.type, 'with selectedTargets:', context.selectedTargets);

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
      case EffectType.BUFF_SELF: {
        const buffDuration = this.mapDurationToBuff(action.duration);
        this.addPowerBuff(
          context.sourceCard,
          action.value || 0,
          buffDuration,
          context.sourceCard.id,
          gameState
        );
        changes.push({
          type: 'POWER_CHANGED',
          cardId: context.sourceCard.id,
          value: action.value,
        });
        break;
      }

      case EffectType.BUFF_POWER:
      case EffectType.BUFF_ANY: {
        const buffDuration = this.mapDurationToBuff(action.duration);
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            this.addPowerBuff(
              card,
              action.value || 0,
              buffDuration,
              context.sourceCard.id,
              gameState
            );
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: action.value,
            });
          }
        });
        break;
      }

      case EffectType.BUFF_COMBAT:
        // Combat buff - applies to target for duration of battle only
        // Track both in effectBuffPower (for combat resolution) and as buff (for display)
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            // Add to combat buff tracking for combat resolution
            if (gameState.currentCombat) {
              gameState.currentCombat.effectBuffPower =
                (gameState.currentCombat.effectBuffPower || 0) + (action.value || 0);
            }
            // Also add as a tracked buff for display purposes
            this.addPowerBuff(
              card,
              action.value || 0,
              'THIS_BATTLE',
              context.sourceCard.id,
              gameState
            );
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: action.value,
            });
          }
        });
        break;

      case EffectType.DEBUFF_POWER: {
        const debuffDuration = this.mapDurationToBuff(action.duration);
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            // Add negative buff for debuff
            this.addPowerBuff(
              card,
              -(action.value || 0),
              debuffDuration,
              context.sourceCard.id,
              gameState
            );
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: -(action.value || 0),
            });
          }
        });
        break;
      }

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

      case EffectType.SET_BASE_POWER:
        // Set base power to a specific value (e.g., "base power becomes 7000")
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            const newPower = action.value || 0;
            card.power = newPower;
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: newPower,
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
        // Mill YOUR OWN deck - "Trash X cards from the top of your deck"
        for (let i = 0; i < (action.value || 1); i++) {
          if (sourcePlayer.deck.length > 0) {
            const milledCard = sourcePlayer.deck.shift()!;
            milledCard.zone = CardZone.TRASH;
            sourcePlayer.trash.push(milledCard);
            changes.push({
              type: 'CARD_MOVED',
              cardId: milledCard.id,
              from: 'DECK',
              to: 'TRASH',
            });
          }
        }
        break;

      case EffectType.DISCARD_FROM_HAND:
        // Discard cards from hand to trash
        // If targets specified, discard those specific cards
        // Otherwise, this typically requires player choice (handled by UI)
        if (targets.length > 0) {
          targets.forEach(targetId => {
            const cardIndex = sourcePlayer.hand.findIndex(c => c.id === targetId);
            if (cardIndex !== -1) {
              const card = sourcePlayer.hand.splice(cardIndex, 1)[0];
              card.zone = CardZone.TRASH;
              sourcePlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: card.id,
                from: 'HAND',
                to: 'TRASH',
              });
            }
          });
        } else {
          // Random discard if no targets specified (fallback)
          for (let i = 0; i < (action.value || 1); i++) {
            if (sourcePlayer.hand.length > 0) {
              const card = sourcePlayer.hand.pop()!;
              card.zone = CardZone.TRASH;
              sourcePlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: card.id,
                from: 'HAND',
                to: 'TRASH',
              });
            }
          }
        }
        break;

      case EffectType.LOOK_AT_TOP_DECK:
        // Look at the top X cards of deck
        // This reveals the card IDs to the player for decision making
        // The actual UI presentation is handled by the client
        const lookCount = action.value || 1;
        const cardsToLook: string[] = [];

        for (let i = 0; i < Math.min(lookCount, sourcePlayer.deck.length); i++) {
          const card = sourcePlayer.deck[i];
          cardsToLook.push(card.id);
        }

        // Store the revealed cards in the game state for the UI to access
        // The client will show these cards to the player
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: cardsToLook.length,
          cardId: cardsToLook.join(','), // Comma-separated list of revealed card IDs
        });
        break;

      case EffectType.SEARCH_AND_SELECT:
        // "Look at X cards from deck, select matching cards, trash the rest"
        // This effect is handled by GameStateManager.setupDeckRevealEffect()
        // The EffectEngine just signals that this effect requires UI interaction
        console.log('[EffectEngine] SEARCH_AND_SELECT effect - handled by GameStateManager');
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: action.value || 3, // lookCount
        });
        break;

      case EffectType.SEARCH_DECK:
        // "Look at top X cards, select 1 matching filter to add to hand, put rest at bottom"
        // Similar to SEARCH_AND_SELECT but specifically:
        // - Adds selected card to hand (not play to field)
        // - Puts rest at bottom of deck (not trash)
        // This is handled by GameStateManager.setupDeckRevealEffect() with different params
        console.log('[EffectEngine] SEARCH_DECK effect - handled by GameStateManager');
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: action.value || 5, // lookCount (default 5 for search effects)
        });
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

      case EffectType.ADD_DON:
        // Add DON from DON deck to field (rested state)
        // This is typically used by card effects like "Add up to 1 DON!! card from your DON!! deck and rest it"
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

      case EffectType.ATTACH_DON:
        // Attach rested DON cards to a target (Leader or Character)
        // selectedTargets should be [targetCardId] - DON cards are auto-selected
        console.log('[ATTACH_DON] Processing with selectedTargets:', context.selectedTargets);
        if (context.selectedTargets && context.selectedTargets.length >= 1) {
          const targetCardId = context.selectedTargets[0];

          // Find the target card
          const targetCard = this.findCard(gameState, targetCardId);
          if (!targetCard) {
            console.log('[ATTACH_DON] Target card not found:', targetCardId);
            break;
          }

          console.log('[ATTACH_DON] Target:', targetCardId, 'Zone:', targetCard.zone);

          // Determine DON count based on target type (leader: 2, character: 1)
          const donReq = action.donCountByTarget || { leader: 2, character: 1 };
          const donToAttach = targetCard.zone === CardZone.LEADER
            ? donReq.leader
            : donReq.character;

          console.log('[ATTACH_DON] DON to attach:', donToAttach);

          // Find available rested DON cards (auto-select)
          const availableDon = sourcePlayer.donField.filter(
            d => d.state === CardState.RESTED && !d.attachedTo
          );

          if (availableDon.length < donToAttach) {
            console.log('[ATTACH_DON] Not enough rested DON. Need:', donToAttach, 'Have:', availableDon.length);
            break;
          }

          // Validate target ownership
          if (targetCard.owner !== sourcePlayer.id ||
              (targetCard.zone !== CardZone.FIELD && targetCard.zone !== CardZone.LEADER)) {
            console.log('[ATTACH_DON] Target validation failed');
            break;
          }

          // Attach DON cards (up to donToAttach count)
          for (let i = 0; i < donToAttach && i < availableDon.length; i++) {
            const donCard = availableDon[i];
            donCard.attachedTo = targetCardId;
            donCard.state = CardState.ATTACHED;

            console.log('[ATTACH_DON] Attached DON:', donCard.id, 'to target:', targetCardId);

            changes.push({
              type: 'DON_CHANGED',
              playerId: sourcePlayer.id,
              cardId: donCard.id,
            });
          }

          console.log('[ATTACH_DON] Successfully attached', donToAttach, 'DON to:', targetCard.id);
        } else {
          console.log('[ATTACH_DON] No target selected');
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

      // ============ COST MODIFICATION EFFECTS ============
      case EffectType.REDUCE_COST:
        // Reduce cost for matching cards in hand
        this.applyCostModification(
          gameState,
          action,
          context,
          -(action.value || 0)
        );
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: -(action.value || 0),
        });
        break;

      case EffectType.INCREASE_COST:
        // Increase cost for matching cards in hand
        this.applyCostModification(
          gameState,
          action,
          context,
          action.value || 0
        );
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: action.value || 0,
        });
        break;

      // ============ STAGE ABILITY EFFECTS ============
      case EffectType.GRANT_RUSH_VS_CHARACTERS:
        // Grant ability to attack characters on the turn played (limited Rush)
        this.applyRushVsCharacters(gameState, action, context);
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: 0,
        });
        break;

      // ============ COMBAT RESTRICTION EFFECTS ============
      case EffectType.CANT_BE_BLOCKED:
        // Make target(s) unblockable for this battle
        // Uses temporaryKeywords which are cleared after combat resolves
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            card.temporaryKeywords.push('Unblockable');
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 0,
            });
          }
        });
        break;

      // ============ PLAY FROM HAND EFFECTS ============
      case EffectType.PLAY_FROM_HAND:
        // Play a card from hand to field
        // targets should contain the card ID from hand that was selected
        targets.forEach(targetId => {
          const handIndex = sourcePlayer.hand.findIndex(c => c.id === targetId);
          if (handIndex === -1) {
            console.warn('[PLAY_FROM_HAND] Card not found in hand:', targetId);
            return;
          }

          const cardToPlay = sourcePlayer.hand[handIndex];
          const cardDef = this.getCardDefinition(cardToPlay.cardId);

          // Remove from hand
          sourcePlayer.hand.splice(handIndex, 1);

          // Play to appropriate zone based on card type
          if (cardDef?.type === 'CHARACTER') {
            cardToPlay.zone = CardZone.FIELD;
            cardToPlay.state = CardState.ACTIVE;
            cardToPlay.turnPlayed = gameState.turn;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.field.push(cardToPlay);
            console.log('[PLAY_FROM_HAND] Played character to field:', cardToPlay.cardId);
          } else if (cardDef?.type === 'STAGE') {
            // Replace existing stage if any
            if (sourcePlayer.stage) {
              sourcePlayer.stage.zone = CardZone.TRASH;
              sourcePlayer.trash.push(sourcePlayer.stage);
            }
            cardToPlay.zone = CardZone.STAGE;
            cardToPlay.state = CardState.ACTIVE;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.stage = cardToPlay;
            console.log('[PLAY_FROM_HAND] Played stage:', cardToPlay.cardId);
          }

          changes.push({
            type: 'CARD_MOVED',
            cardId: targetId,
            from: CardZone.HAND,
            to: cardDef?.type === 'STAGE' ? CardZone.STAGE : CardZone.FIELD,
          });
        });
        break;

      // ============================================
      // DON!! ACTIVATION
      // ============================================
      case EffectType.ACTIVE_DON:
        // Activate (un-rest) DON cards
        // Value indicates how many DON to activate
        const donToActivate = action.value || 1;
        let donActivated = 0;

        for (const don of sourcePlayer.donField) {
          if (donActivated >= donToActivate) break;
          if (don.state === CardState.RESTED) {
            don.state = CardState.ACTIVE;
            donActivated++;
            changes.push({
              type: 'DON_CHANGED',
              cardId: don.id,
              playerId: sourcePlayer.id,
              value: 'ACTIVATED',
            });
          }
        }
        console.log(`[ACTIVE_DON] Activated ${donActivated} DON cards`);
        break;

      // ============================================
      // PLAY FROM TRASH
      // ============================================
      case EffectType.PLAY_FROM_TRASH:
        // Play a card from trash to field
        targets.forEach(targetId => {
          const trashIndex = sourcePlayer.trash.findIndex(c => c.id === targetId);
          if (trashIndex === -1) {
            console.warn('[PLAY_FROM_TRASH] Card not found in trash:', targetId);
            return;
          }

          const cardToPlay = sourcePlayer.trash[trashIndex];
          const cardDef = this.getCardDefinition(cardToPlay.cardId);

          // Remove from trash
          sourcePlayer.trash.splice(trashIndex, 1);

          // Play to appropriate zone based on card type
          if (cardDef?.type === 'CHARACTER') {
            cardToPlay.zone = CardZone.FIELD;
            // Check if should be rested (some effects play rested)
            cardToPlay.state = action.playRested ? CardState.RESTED : CardState.ACTIVE;
            cardToPlay.turnPlayed = gameState.turn;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.field.push(cardToPlay);
            console.log('[PLAY_FROM_TRASH] Played character to field:', cardToPlay.cardId);
          } else if (cardDef?.type === 'STAGE') {
            // Replace existing stage if any
            if (sourcePlayer.stage) {
              sourcePlayer.stage.zone = CardZone.TRASH;
              sourcePlayer.trash.push(sourcePlayer.stage);
            }
            cardToPlay.zone = CardZone.STAGE;
            cardToPlay.state = CardState.ACTIVE;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.stage = cardToPlay;
            console.log('[PLAY_FROM_TRASH] Played stage:', cardToPlay.cardId);
          }

          changes.push({
            type: 'CARD_MOVED',
            cardId: targetId,
            from: CardZone.TRASH,
            to: cardDef?.type === 'STAGE' ? CardZone.STAGE : CardZone.FIELD,
          });
        });
        break;

      // ============================================
      // PLAY FROM DECK
      // ============================================
      case EffectType.PLAY_FROM_DECK:
        // Play a card from deck to field
        targets.forEach(targetId => {
          const deckIndex = sourcePlayer.deck.findIndex(c => c.id === targetId);
          if (deckIndex === -1) {
            console.warn('[PLAY_FROM_DECK] Card not found in deck:', targetId);
            return;
          }

          const cardToPlay = sourcePlayer.deck[deckIndex];
          const cardDef = this.getCardDefinition(cardToPlay.cardId);

          // Remove from deck
          sourcePlayer.deck.splice(deckIndex, 1);

          // Play to appropriate zone based on card type
          if (cardDef?.type === 'CHARACTER') {
            cardToPlay.zone = CardZone.FIELD;
            // Check if should be rested (some effects play rested)
            cardToPlay.state = action.playRested ? CardState.RESTED : CardState.ACTIVE;
            cardToPlay.turnPlayed = gameState.turn;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.field.push(cardToPlay);
            console.log('[PLAY_FROM_DECK] Played character to field:', cardToPlay.cardId);
          } else if (cardDef?.type === 'STAGE') {
            // Replace existing stage if any
            if (sourcePlayer.stage) {
              sourcePlayer.stage.zone = CardZone.TRASH;
              sourcePlayer.trash.push(sourcePlayer.stage);
            }
            cardToPlay.zone = CardZone.STAGE;
            cardToPlay.state = CardState.ACTIVE;
            cardToPlay.owner = sourcePlayer.id;
            sourcePlayer.stage = cardToPlay;
            console.log('[PLAY_FROM_DECK] Played stage:', cardToPlay.cardId);
          }

          changes.push({
            type: 'CARD_MOVED',
            cardId: targetId,
            from: CardZone.DECK,
            to: cardDef?.type === 'STAGE' ? CardZone.STAGE : CardZone.FIELD,
          });
        });
        break;

      // ============================================
      // CANT_ATTACK - Prevents a card from attacking
      // ============================================
      case EffectType.CANT_ATTACK:
        // Add restriction flag to target cards
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.restrictions) card.restrictions = [];
            card.restrictions.push({
              type: 'CANT_ATTACK',
              until: action.duration === EffectDuration.UNTIL_END_OF_OPPONENT_TURN
                ? 'END_OF_OPPONENT_TURN'
                : action.duration === EffectDuration.UNTIL_END_OF_TURN
                  ? 'END_OF_TURN'
                  : 'PERMANENT',
              turnApplied: gameState.turn,
            });
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'CANT_ATTACK',
            });
            console.log('[CANT_ATTACK] Added attack restriction to:', targetId);
          }
        });
        break;

      // ============================================
      // IMMUNE_KO - Protection from KO effects
      // ============================================
      case EffectType.IMMUNE_KO:
        // This is a passive/conditional effect that's checked during KO resolution
        // Just mark the card as having this protection
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.immunities) card.immunities = [];
            card.immunities.push({
              type: 'KO',
              source: action.immuneFrom || 'ALL', // e.g., 'OPPONENT_CHARACTERS', 'ALL'
              condition: action.condition,
            });
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'IMMUNE_KO',
            });
            console.log('[IMMUNE_KO] Added KO immunity to:', targetId);
          }
        });
        break;

      // ============================================
      // LOOK_AT_LIFE - Look at cards in Life pile
      // ============================================
      case EffectType.LOOK_AT_LIFE:
        // Look at top card(s) of Life pile
        // This reveals the card IDs to the player
        const lifeCount = action.value || 1;
        const lifeCardsToLook: string[] = [];

        for (let i = 0; i < Math.min(lifeCount, sourcePlayer.lifeCards.length); i++) {
          const card = sourcePlayer.lifeCards[i];
          lifeCardsToLook.push(card.id);
        }

        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: lifeCardsToLook.length,
          cardId: lifeCardsToLook.join(','),
        });
        console.log(`[LOOK_AT_LIFE] Looking at ${lifeCardsToLook.length} life cards`);
        break;

      // ============================================
      // TRASH_LIFE - Trash cards from Life pile
      // ============================================
      case EffectType.TRASH_LIFE:
        // Trash card(s) from Life pile
        const trashFromLifeCount = action.value || 1;

        // If targets specified, trash those specific cards
        if (targets.length > 0) {
          targets.forEach(targetId => {
            const lifeIndex = sourcePlayer.lifeCards.findIndex(c => c.id === targetId);
            if (lifeIndex !== -1) {
              const card = sourcePlayer.lifeCards.splice(lifeIndex, 1)[0];
              card.zone = CardZone.TRASH;
              sourcePlayer.trash.push(card);
              sourcePlayer.life--;
              changes.push({
                type: 'CARD_MOVED',
                cardId: targetId,
                from: CardZone.LIFE,
                to: CardZone.TRASH,
              });
              console.log('[TRASH_LIFE] Trashed from life:', targetId);
            }
          });
        } else {
          // Trash from top of life
          for (let i = 0; i < Math.min(trashFromLifeCount, sourcePlayer.lifeCards.length); i++) {
            const card = sourcePlayer.lifeCards.shift()!;
            card.zone = CardZone.TRASH;
            sourcePlayer.trash.push(card);
            sourcePlayer.life--;
            changes.push({
              type: 'CARD_MOVED',
              cardId: card.id,
              from: CardZone.LIFE,
              to: CardZone.TRASH,
            });
            console.log('[TRASH_LIFE] Trashed from life:', card.id);
          }
        }
        break;

      // ============================================
      // DEBUFF_COST - Reduce opponent's character cost
      // ============================================
      case EffectType.DEBUFF_COST:
        // Reduce cost of target characters (for KO effects that check cost)
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card && card.cost !== undefined) {
            const reduction = action.value || 1;
            // Store the modified cost
            if (card.modifiedCost === undefined) {
              card.modifiedCost = card.cost;
            }
            card.modifiedCost = Math.max(0, card.modifiedCost - reduction);
            changes.push({
              type: 'COST_CHANGED',
              cardId: targetId,
              value: -reduction,
            });
            console.log(`[DEBUFF_COST] Reduced cost of ${targetId} by ${reduction} (now ${card.modifiedCost})`);
          }
        });
        break;

      // ============================================
      // CAN_ATTACK_ACTIVE - Allow attacking active characters
      // ============================================
      case EffectType.CAN_ATTACK_ACTIVE:
        // Grant the ability to attack active (non-rested) characters
        // This is typically a DON!! x1 passive ability
        if (context.sourceCard) {
          if (!context.sourceCard.temporaryKeywords) context.sourceCard.temporaryKeywords = [];
          if (!context.sourceCard.temporaryKeywords.includes('CanAttackActive')) {
            context.sourceCard.temporaryKeywords.push('CanAttackActive');
          }
          changes.push({
            type: 'EFFECT_APPLIED',
            cardId: context.sourceCard.id,
            value: 'CAN_ATTACK_ACTIVE',
          });
          console.log('[CAN_ATTACK_ACTIVE] Granted to:', context.sourceCard.id);
        }
        break;

      // ============================================
      // DRAW_FROM_TRASH - Add card from trash to hand
      // ============================================
      case EffectType.DRAW_FROM_TRASH:
        // Move selected cards from trash to hand
        targets.forEach(targetId => {
          const trashIndex = sourcePlayer.trash.findIndex(c => c.id === targetId);
          if (trashIndex !== -1) {
            const card = sourcePlayer.trash.splice(trashIndex, 1)[0];
            card.zone = CardZone.HAND;
            sourcePlayer.hand.push(card);
            changes.push({
              type: 'CARD_MOVED',
              cardId: targetId,
              from: CardZone.TRASH,
              to: CardZone.HAND,
            });
            console.log('[DRAW_FROM_TRASH] Moved to hand:', targetId);
          }
        });
        break;

      // ============================================
      // OPPONENT_DISCARD - Force opponent to discard
      // ============================================
      case EffectType.OPPONENT_DISCARD:
        // Force opponent to discard cards from hand
        // Note: The actual selection UI is handled by GameStateManager
        const discardCount = action.value || 1;
        const opponentPlayer = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (opponentPlayer && opponentPlayer.hand.length > 0) {
          // If targets are specified, discard those specific cards
          if (targets.length > 0) {
            targets.forEach(targetId => {
              const handIndex = opponentPlayer.hand.findIndex(c => c.id === targetId);
              if (handIndex !== -1) {
                const card = opponentPlayer.hand.splice(handIndex, 1)[0];
                card.zone = CardZone.TRASH;
                opponentPlayer.trash.push(card);
                changes.push({
                  type: 'CARD_MOVED',
                  cardId: targetId,
                  from: CardZone.HAND,
                  to: CardZone.TRASH,
                  playerId: opponentPlayer.id,
                });
                console.log('[OPPONENT_DISCARD] Opponent discarded:', targetId);
              }
            });
          } else {
            // Random/forced discard from end of hand
            for (let i = 0; i < Math.min(discardCount, opponentPlayer.hand.length); i++) {
              const card = opponentPlayer.hand.pop()!;
              card.zone = CardZone.TRASH;
              opponentPlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: card.id,
                from: CardZone.HAND,
                to: CardZone.TRASH,
                playerId: opponentPlayer.id,
              });
              console.log('[OPPONENT_DISCARD] Opponent discarded:', card.id);
            }
          }
        }
        break;

      // ============================================
      // OPPONENT_RETURN_DON - Opponent returns DON to deck
      // ============================================
      case EffectType.OPPONENT_RETURN_DON:
        const returnDonCount = action.value || 1;
        const oppPlayer = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (oppPlayer && oppPlayer.donField && oppPlayer.donField.length > 0) {
          const donToReturn = Math.min(returnDonCount, oppPlayer.donField.length);
          // Return DON from field to deck
          for (let i = 0; i < donToReturn; i++) {
            const donCard = oppPlayer.donField.pop();
            if (donCard) {
              oppPlayer.donDeck = (oppPlayer.donDeck || 0) + 1;
            }
          }

          changes.push({
            type: 'DON_CHANGED',
            playerId: oppPlayer.id,
            value: -donToReturn,
          });
          console.log('[OPPONENT_RETURN_DON] Opponent returned', donToReturn, 'DON to deck');
        }
        break;

      // ============================================
      // IMMUNE_EFFECTS - Cannot be affected by opponent effects
      // ============================================
      case EffectType.IMMUNE_EFFECTS:
        if (context.sourceCard) {
          if (!context.sourceCard.temporaryKeywords) context.sourceCard.temporaryKeywords = [];
          if (!context.sourceCard.temporaryKeywords.includes('ImmuneEffects')) {
            context.sourceCard.temporaryKeywords.push('ImmuneEffects');
          }
          changes.push({
            type: 'EFFECT_APPLIED',
            cardId: context.sourceCard.id,
            value: 'IMMUNE_EFFECTS',
          });
          console.log('[IMMUNE_EFFECTS] Card', context.sourceCard.id, 'is now immune to opponent effects');
        }
        break;

      // ============================================
      // REVEAL_HAND - Opponent reveals hand cards
      // ============================================
      case EffectType.REVEAL_HAND:
        const revealPlayer = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (revealPlayer) {
          // Reveal cards to the source player (in a real implementation, this would update UI state)
          // Store which cards should be revealed for UI display
          const revealedCardIds = targets.length > 0 ? targets : revealPlayer.hand.map(c => c.id);
          changes.push({
            type: 'EFFECT_APPLIED',
            playerId: revealPlayer.id,
            value: `REVEAL_HAND:${revealedCardIds.join(',')}`,
          });
          console.log('[REVEAL_HAND] Opponent revealed', revealedCardIds.length, 'cards');
        }
        break;

      // ============================================
      // SILENCE - Negate effects of target card
      // ============================================
      case EffectType.SILENCE:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            // Add silenced keyword to disable the card's effects
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('Silenced')) {
              card.temporaryKeywords.push('Silenced');
            }
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'SILENCED',
            });
            console.log('[SILENCE] Card', targetId, 'effects negated');
          }
        });
        break;

      // ============================================
      // PREVENT_KO - Replacement effect to prevent KO
      // ============================================
      case EffectType.PREVENT_KO:
        // This is a replacement effect - when a protected character would be KO'd,
        // this card can be trashed instead. We mark the source card as a "KO protector"
        // and store which cards it protects. The actual replacement logic is handled
        // in GameStateManager when processing KO events.
        if (context.sourceCard) {
          // Mark this card as providing KO protection
          if (!context.sourceCard.temporaryKeywords) context.sourceCard.temporaryKeywords = [];
          if (!context.sourceCard.temporaryKeywords.includes('KOProtector')) {
            context.sourceCard.temporaryKeywords.push('KOProtector');
          }

          // Store protection info on the card (which cards it protects)
          // The target filter from the effect determines what cards are protected
          changes.push({
            type: 'EFFECT_APPLIED',
            cardId: context.sourceCard.id,
            value: 'PREVENT_KO',
          });
          console.log('[PREVENT_KO] Card', context.sourceCard.id, 'can protect characters from KO');
        }
        break;

      // ============================================
      // SWAP_POWER - Swap base power between characters
      // ============================================
      case EffectType.SWAP_POWER:
        if (targets.length >= 2) {
          const card1 = this.findCard(gameState, targets[0]);
          const card2 = this.findCard(gameState, targets[1]);
          if (card1 && card2 && card1.power !== undefined && card2.power !== undefined) {
            // Swap the base power
            const temp = card1.power;
            card1.power = card2.power;
            card2.power = temp;
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targets[0],
              value: card1.power,
            });
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targets[1],
              value: card2.power,
            });
            console.log('[SWAP_POWER] Swapped power between', targets[0], 'and', targets[1]);
          }
        }
        break;

      // ============================================
      // REDIRECT_ATTACK - Change attack target
      // ============================================
      case EffectType.REDIRECT_ATTACK:
        if (targets.length > 0 && gameState.currentCombat) {
          const newTarget = targets[0];
          gameState.currentCombat.targetId = newTarget;
          changes.push({
            type: 'EFFECT_APPLIED',
            value: `REDIRECT_ATTACK:${newTarget}`,
          });
          console.log('[REDIRECT_ATTACK] Attack redirected to', newTarget);
        }
        break;

      // ============================================
      // REST_DON - Rest opponent's DON cards
      // ============================================
      case EffectType.REST_DON:
        const restDonCount = action.value || 1;
        const donOwner = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (donOwner && donOwner.donField) {
          let rested = 0;
          for (const don of donOwner.donField) {
            if (don.state === CardState.ACTIVE && rested < restDonCount) {
              don.state = CardState.RESTED;
              rested++;
              changes.push({
                type: 'DON_CHANGED',
                cardId: don.id,
                value: -1,
              });
            }
          }
          console.log('[REST_DON] Rested', rested, 'opponent DON cards');
        }
        break;

      // ============================================
      // REORDER_LIFE - Look at and reorder all Life cards
      // ============================================
      case EffectType.REORDER_LIFE:
        // This requires UI interaction to reorder cards
        // For now, just mark it as a pending selection
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: 'REORDER_LIFE',
        });
        console.log('[REORDER_LIFE] Player can reorder Life cards');
        break;

      // ============================================
      // PREVENT_LIFE_ADD - Cannot add Life to hand
      // ============================================
      case EffectType.PREVENT_LIFE_ADD:
        if (context.sourceCard) {
          if (!context.sourceCard.temporaryKeywords) context.sourceCard.temporaryKeywords = [];
          context.sourceCard.temporaryKeywords.push('PreventLifeAdd');
          changes.push({
            type: 'EFFECT_APPLIED',
            cardId: context.sourceCard.id,
            value: 'PREVENT_LIFE_ADD',
          });
          console.log('[PREVENT_LIFE_ADD] Cannot add Life cards to hand this turn');
        }
        break;

      // ============================================
      // IMMUNE_KO_UNTIL - Cannot be K.O.'d until end of turn
      // ============================================
      case EffectType.IMMUNE_KO_UNTIL:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('ImmuneKO')) {
              card.temporaryKeywords.push('ImmuneKO');
            }
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'IMMUNE_KO_UNTIL',
            });
          }
        });
        console.log('[IMMUNE_KO_UNTIL] Cards protected from KO until end of turn');
        break;

      // ============================================
      // CANT_BE_RESTED - Cannot be rested
      // ============================================
      case EffectType.CANT_BE_RESTED:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('CantBeRested')) {
              card.temporaryKeywords.push('CantBeRested');
            }
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'CANT_BE_RESTED',
            });
          }
        });
        console.log('[CANT_BE_RESTED] Cards cannot be rested');
        break;

      // ============================================
      // BUFF_OTHER - Buff characters other than self
      // ============================================
      case EffectType.BUFF_OTHER: {
        const buffDuration = this.mapDurationToBuff(action.duration);
        targets.forEach(targetId => {
          // Skip self
          if (targetId === context.sourceCard.id) return;
          const card = this.findCard(gameState, targetId);
          if (card) {
            this.addPowerBuff(
              card,
              action.value || 0,
              buffDuration,
              context.sourceCard.id,
              gameState
            );
            changes.push({
              type: 'POWER_CHANGED',
              cardId: targetId,
              value: action.value,
            });
          }
        });
        console.log('[BUFF_OTHER] Buffed other characters by', action.value);
        break;
      }

      // ============================================
      // BUFF_FIELD - Buff all matching characters on field
      // ============================================
      case EffectType.BUFF_FIELD: {
        const buffDuration = this.mapDurationToBuff(action.duration);
        // Get all characters on player's field that match the filter
        let fieldCards = [...sourcePlayer.field];
        if (action.target?.filters) {
          fieldCards = this.applyFilters(fieldCards, action.target.filters, context);
        }

        fieldCards.forEach(card => {
          this.addPowerBuff(
            card,
            action.value || 0,
            buffDuration,
            context.sourceCard.id,
            gameState
          );
          changes.push({
            type: 'POWER_CHANGED',
            cardId: card.id,
            value: action.value,
          });
        });
        console.log('[BUFF_FIELD] Buffed', fieldCards.length, 'field characters by', action.value);
        break;
      }

      // ============================================
      // SEND_TO_DECK_TOP - Send card to top of deck
      // ============================================
      case EffectType.SEND_TO_DECK_TOP:
        targets.forEach(targetId => {
          const result = this.sendToDeckTop(gameState, targetId);
          changes.push(...result);
        });
        break;

      // ============================================
      // DRAW_AND_TRASH - Draw cards then discard
      // ============================================
      case EffectType.DRAW_AND_TRASH: {
        const drawCount = action.value || 1;
        const trashCount = (action as any).trashCount || 1;

        // Draw cards first
        for (let i = 0; i < drawCount; i++) {
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

        // If targets specified for trash, use those; otherwise pending selection
        if (targets.length > 0) {
          targets.slice(0, trashCount).forEach(targetId => {
            const cardIndex = sourcePlayer.hand.findIndex(c => c.id === targetId);
            if (cardIndex !== -1) {
              const card = sourcePlayer.hand.splice(cardIndex, 1)[0];
              card.zone = CardZone.TRASH;
              sourcePlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: card.id,
                from: 'HAND',
                to: 'TRASH',
              });
            }
          });
        }
        console.log('[DRAW_AND_TRASH] Drew', drawCount, 'cards, trash', trashCount);
        break;
      }

      // ============================================
      // OPPONENT_TRASH_CARDS - Force opponent to trash from field
      // ============================================
      case EffectType.OPPONENT_TRASH_CARDS: {
        const oppPlayer = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (oppPlayer) {
          targets.forEach(targetId => {
            const fieldIndex = oppPlayer.field.findIndex(c => c.id === targetId);
            if (fieldIndex !== -1) {
              const card = oppPlayer.field.splice(fieldIndex, 1)[0];
              card.zone = CardZone.TRASH;
              oppPlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: targetId,
                from: CardZone.FIELD,
                to: CardZone.TRASH,
                playerId: oppPlayer.id,
              });
              console.log('[OPPONENT_TRASH_CARDS] Trashed from opponent field:', targetId);
            }
          });
        }
        break;
      }

      // ============================================
      // OPPONENT_TRASH_FROM_HAND - Force opponent to trash from hand
      // ============================================
      case EffectType.OPPONENT_TRASH_FROM_HAND: {
        const trashCount = action.value || 1;
        const oppPlayer = Object.values(gameState.players).find(p => p.id !== sourcePlayer.id);
        if (oppPlayer && oppPlayer.hand.length > 0) {
          // If targets specified, trash those; otherwise from end of hand
          if (targets.length > 0) {
            targets.forEach(targetId => {
              const handIndex = oppPlayer.hand.findIndex(c => c.id === targetId);
              if (handIndex !== -1) {
                const card = oppPlayer.hand.splice(handIndex, 1)[0];
                card.zone = CardZone.TRASH;
                oppPlayer.trash.push(card);
                changes.push({
                  type: 'CARD_MOVED',
                  cardId: targetId,
                  from: CardZone.HAND,
                  to: CardZone.TRASH,
                  playerId: oppPlayer.id,
                });
                console.log('[OPPONENT_TRASH_FROM_HAND] Opponent trashed:', targetId);
              }
            });
          } else {
            for (let i = 0; i < Math.min(trashCount, oppPlayer.hand.length); i++) {
              const card = oppPlayer.hand.pop()!;
              card.zone = CardZone.TRASH;
              oppPlayer.trash.push(card);
              changes.push({
                type: 'CARD_MOVED',
                cardId: card.id,
                from: CardZone.HAND,
                to: CardZone.TRASH,
                playerId: oppPlayer.id,
              });
              console.log('[OPPONENT_TRASH_FROM_HAND] Opponent trashed:', card.id);
            }
          }
        }
        break;
      }

      // ============================================
      // BECOME_BLOCKER - Grant Blocker keyword
      // ============================================
      case EffectType.BECOME_BLOCKER:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('Blocker')) {
              card.temporaryKeywords.push('Blocker');
            }
            changes.push({
              type: 'KEYWORD_ADDED',
              cardId: targetId,
              value: 'Blocker',
            });
          }
        });
        console.log('[BECOME_BLOCKER] Granted Blocker to', targets.length, 'cards');
        break;

      // ============================================
      // UNBLOCKABLE - Grant Unblockable keyword
      // ============================================
      case EffectType.UNBLOCKABLE:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('Unblockable')) {
              card.temporaryKeywords.push('Unblockable');
            }
            changes.push({
              type: 'KEYWORD_ADDED',
              cardId: targetId,
              value: 'Unblockable',
            });
          }
        });
        console.log('[UNBLOCKABLE] Granted Unblockable to', targets.length, 'cards');
        break;

      // ============================================
      // RETURN_DON - Return DON to DON deck
      // ============================================
      case EffectType.RETURN_DON: {
        const returnCount = action.value || 1;
        let returned = 0;

        // Return DON from field to DON deck
        while (returned < returnCount && sourcePlayer.donField.length > 0) {
          // Prefer returning rested DON first
          const donIndex = sourcePlayer.donField.findIndex(d => d.state === CardState.RESTED)
            ?? sourcePlayer.donField.length - 1;

          if (donIndex >= 0) {
            sourcePlayer.donField.splice(donIndex, 1);
            sourcePlayer.donDeck = (sourcePlayer.donDeck || 0) + 1;
            returned++;
          } else {
            break;
          }
        }

        changes.push({
          type: 'DON_CHANGED',
          playerId: sourcePlayer.id,
          value: -returned,
        });
        console.log('[RETURN_DON] Returned', returned, 'DON to deck');
        break;
      }

      // ============================================
      // IMMUNE_COMBAT - Immune to battle damage
      // ============================================
      case EffectType.IMMUNE_COMBAT:
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          if (card) {
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            if (!card.temporaryKeywords.includes('ImmuneCombat')) {
              card.temporaryKeywords.push('ImmuneCombat');
            }
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'IMMUNE_COMBAT',
            });
          }
        });
        console.log('[IMMUNE_COMBAT] Granted combat immunity to', targets.length, 'cards');
        break;

      // ============================================
      // GRANT_EFFECT - Grant an effect to target card
      // ============================================
      case EffectType.GRANT_EFFECT:
        // This grants a temporary effect definition to a card
        // The effect is stored via temporaryKeywords as a marker
        targets.forEach(targetId => {
          const card = this.findCard(gameState, targetId);
          const grantedEffect = (action as any).grantedEffect;
          if (card && grantedEffect) {
            // Store granted effect marker in temporaryKeywords
            if (!card.temporaryKeywords) card.temporaryKeywords = [];
            card.temporaryKeywords.push(`GrantedEffect:${grantedEffect.id || 'effect'}`);
            changes.push({
              type: 'EFFECT_APPLIED',
              cardId: targetId,
              value: 'GRANT_EFFECT',
            });
          }
        });
        console.log('[GRANT_EFFECT] Granted effect to', targets.length, 'cards');
        break;

      // ============================================
      // TAKE_ANOTHER_TURN - Extra turn after current
      // ============================================
      case EffectType.TAKE_ANOTHER_TURN:
        // Set a flag indicating the player gets an extra turn
        // Store in temporaryKeywords on the player's leader as marker
        if (sourcePlayer.leaderCard) {
          if (!sourcePlayer.leaderCard.temporaryKeywords) sourcePlayer.leaderCard.temporaryKeywords = [];
          sourcePlayer.leaderCard.temporaryKeywords.push('ExtraTurn');
        }
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: 'EXTRA_TURN',
        });
        console.log('[TAKE_ANOTHER_TURN] Player', sourcePlayer.id, 'will take another turn');
        break;

      // ============================================
      // WIN_GAME - Immediately win the game
      // ============================================
      case EffectType.WIN_GAME:
        // Set game over state with source player as winner
        gameState.phase = GamePhase.GAME_OVER;
        gameState.winner = sourcePlayer.id;
        changes.push({
          type: 'EFFECT_APPLIED',
          playerId: sourcePlayer.id,
          value: 'WIN_GAME',
        });
        console.log('[WIN_GAME] Player', sourcePlayer.id, 'wins by card effect!');
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
    // Check permanent Unblockable keyword
    if (this.hasKeyword(card, 'Unblockable')) return true;
    // Also check temporary keywords granted by effects (e.g., CANT_BE_BLOCKED)
    return card.temporaryKeywords?.includes('Unblockable') || false;
  }

  // ============================================
  // COST HANDLING
  // ============================================

  public canPayCosts(costs: any[], context: EffectContext): boolean {
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

  private leaderHasTrait(player: PlayerState, traits: string[]): boolean {
    if (!player.leaderCard) return false;
    const leaderDef = this.cardDefinitions.get(player.leaderCard.cardId);
    if (!leaderDef) return false;
    return traits.some(t => leaderDef.traits.includes(t));
  }

  /**
   * Apply cost modification to matching cards in hand
   */
  private applyCostModification(
    gameState: GameState,
    action: EffectAction,
    context: EffectContext,
    delta: number
  ): void {
    // Determine which player's hand to modify based on target type
    const targetType = action.target?.type;
    let targetPlayer: PlayerState | undefined;

    if (targetType === TargetType.OPPONENT_HAND) {
      targetPlayer = this.getOpponent(gameState, context.sourcePlayer.id);
    } else {
      targetPlayer = context.sourcePlayer;
    }

    if (!targetPlayer) return;

    // Get filter criteria from the action
    const filters = action.target?.filters || [];

    for (const card of targetPlayer.hand) {
      const def = this.cardDefinitions.get(card.cardId);
      if (!def) continue;

      // Check if card matches filters
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => def.traits.includes(t))) {
            matches = false;
            break;
          }
        }
        if (filter.property === 'COLOR') {
          const colors = filter.value as string[];
          if (!colors.some(c => def.colors.includes(c))) {
            matches = false;
            break;
          }
        }
      }

      if (matches && def.cost !== null) {
        card.modifiedCost = Math.max(0, (card.modifiedCost ?? def.cost) + delta);
      }
    }
  }

  /**
   * Apply Rush vs Characters ability to matching cards
   * These cards can attack enemy characters on the turn they are played
   */
  private applyRushVsCharacters(
    _gameState: GameState,
    action: EffectAction,
    context: EffectContext
  ): void {
    const player = context.sourcePlayer;
    const filters = action.target?.filters || [];

    for (const card of player.field) {
      const def = this.cardDefinitions.get(card.cardId);
      if (!def) continue;

      // Check if card matches filters
      let matches = true;
      for (const filter of filters) {
        if (filter.property === 'TRAIT') {
          const traits = filter.value as string[];
          if (!traits.some(t => def.traits.includes(t))) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        card.hasRushVsCharacters = true;
      }
    }
  }

  /**
   * Check if a card can attack characters despite being played this turn
   * (granted by stage effects like Corrida Coliseum)
   */
  public canAttackCharactersOnPlayTurn(card: GameCard): boolean {
    return card.hasRushVsCharacters === true;
  }

  private effectRequiresChoice(effect: CardEffectDefinition): boolean {
    return effect.effects.some(action => {
      // ATTACH_DON always requires target selection (leader or character)
      if (action.type === EffectType.ATTACH_DON) {
        return true;
      }
      // KO effects targeting opponent's characters require choice
      const koEffectTypes = [EffectType.KO_CHARACTER, EffectType.KO_COST_OR_LESS, EffectType.KO_POWER_OR_LESS];
      if (koEffectTypes.includes(action.type as EffectType) && action.target?.type === TargetType.OPPONENT_CHARACTER) {
        return true;
      }
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

  private sendToDeckTop(gameState: GameState, cardId: string): StateChange[] {
    const changes: StateChange[] = [];
    const owner = this.findCardOwner(gameState, cardId);
    if (!owner) return changes;

    // Check various zones
    const zones: { array: GameCard[]; name: string }[] = [
      { array: owner.field, name: 'FIELD' },
      { array: owner.hand, name: 'HAND' },
      { array: owner.trash, name: 'TRASH' },
    ];

    for (const zone of zones) {
      const idx = zone.array.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const card = zone.array.splice(idx, 1)[0];
        card.zone = CardZone.DECK;
        owner.deck.unshift(card); // Add to top of deck

        changes.push({
          type: 'CARD_MOVED',
          cardId: cardId,
          from: zone.name,
          to: 'DECK_TOP',
        });
        console.log('[sendToDeckTop] Moved card', cardId, 'from', zone.name, 'to DECK_TOP');
        break;
      }
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

      case TargetType.YOUR_STAGE:
        targets = sourcePlayer.stage ? [sourcePlayer.stage] : [];
        break;

      case TargetType.OPPONENT_STAGE:
        targets = opponent?.stage ? [opponent.stage] : [];
        break;

      default:
        targets = [];
    }

    // Apply filters
    if (action.target.filters) {
      targets = this.applyFilters(targets, action.target.filters, context);
    }

    return targets.map(c => c.id);
  }

  /**
   * Resolve dynamic filter values for cost/power comparisons.
   * These allow effect filters to reference game state values dynamically.
   *
   * Supported dynamic values:
   * - DON_COUNT: Total DON cards on field (including attached)
   * - ACTIVE_DON_COUNT: Only active (untapped) DON cards
   * - TRASH_COUNT: Number of cards in trash
   * - HAND_COUNT: Number of cards in hand
   * - FIELD_COUNT: Number of characters on field
   * - LIFE_COUNT: Number of life cards remaining
   * - DECK_COUNT: Number of cards in deck
   * - OPPONENT_FIELD_COUNT: Number of opponent's characters
   * - OPPONENT_HAND_COUNT: Number of cards in opponent's hand
   * - OPPONENT_LIFE_COUNT: Opponent's remaining life
   */
  private resolveDynamicValue(value: string | number | string[], context: EffectContext): number {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const { sourcePlayer, gameState } = context;

      // Get opponent for opponent-related values
      const opponentId = Object.keys(gameState.players).find(id => id !== sourcePlayer.id);
      const opponent = opponentId ? gameState.players[opponentId] : null;

      switch (value) {
        // Player's DON values
        case 'DON_COUNT':
          return sourcePlayer.donField.length;
        case 'ACTIVE_DON_COUNT':
          return sourcePlayer.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo).length;

        // Player's zone counts
        case 'TRASH_COUNT':
          return sourcePlayer.trash.length;
        case 'HAND_COUNT':
          return sourcePlayer.hand.length;
        case 'FIELD_COUNT':
          return sourcePlayer.field.length;
        case 'LIFE_COUNT':
          return sourcePlayer.lifeCards.length;
        case 'DECK_COUNT':
          return sourcePlayer.deck.length;

        // Opponent's zone counts
        case 'OPPONENT_FIELD_COUNT':
          return opponent?.field.length ?? 0;
        case 'OPPONENT_HAND_COUNT':
          return opponent?.hand.length ?? 0;
        case 'OPPONENT_LIFE_COUNT':
          return opponent?.lifeCards.length ?? 0;

        default:
          // Try to parse as number if not a known dynamic value
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed)) return parsed;
      }
    }

    return 0;
  }

  private applyFilters(cards: GameCard[], filters: TargetFilter[], context?: EffectContext): GameCard[] {
    return cards.filter(card => {
      const def = this.cardDefinitions.get(card.cardId);
      if (!def) return false;

      return filters.every(filter => {
        switch (filter.property) {
          case 'COST':
            const cardCost = def.cost || 0;
            // Resolve dynamic value if context provided
            const costValue = context ? this.resolveDynamicValue(filter.value, context) : (filter.value as number);
            if (filter.operator === 'OR_LESS' || filter.operator === 'LESS_THAN_OR_EQUAL') return cardCost <= costValue;
            if (filter.operator === 'OR_MORE') return cardCost >= costValue;
            if (filter.operator === 'EQUALS') return cardCost === costValue;
            break;

          case 'POWER':
            const power = card.power || def.power || 0;
            const powerValue = context ? this.resolveDynamicValue(filter.value, context) : (filter.value as number);
            if (filter.operator === 'OR_LESS' || filter.operator === 'LESS_THAN_OR_EQUAL') return power <= powerValue;
            if (filter.operator === 'OR_MORE') return power >= powerValue;
            if (filter.operator === 'EQUALS') return power === powerValue;
            break;

          case 'COLOR':
            const colors = Array.isArray(filter.value) ? filter.value as string[] : [filter.value as string];
            if (filter.operator === 'CONTAINS') {
              return colors.some(c => def.colors.includes(c));
            }
            break;

          case 'TRAIT':
            const traits = Array.isArray(filter.value) ? filter.value as string[] : [filter.value as string];
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

  /**
   * Get valid hand cards for a PLAY_FROM_HAND effect
   * Used by GameStateManager to populate pendingActivateEffect
   */
  public getValidHandCardsForEffect(
    effect: CardEffectDefinition,
    gameState: GameState,
    sourceCard: GameCard,
    sourcePlayer: PlayerState
  ): string[] {
    // Find the PLAY_FROM_HAND action in the effect
    const playFromHandAction = effect.effects.find(e => e.type === EffectType.PLAY_FROM_HAND);
    if (!playFromHandAction?.target?.filters) {
      // No filters, all hand cards are valid
      return sourcePlayer.hand.map(c => c.id);
    }

    const context: EffectContext = {
      gameState,
      sourceCard,
      sourcePlayer,
    };

    // Apply filters to hand cards
    const validCards = this.applyFilters(sourcePlayer.hand, playFromHandAction.target.filters, context);
    return validCards.map(c => c.id);
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

  public removeActiveEffectsBySource(sourceCardId: string): void {
    this.activeEffects = this.activeEffects.filter(
      effect => effect.sourceCardId !== sourceCardId
    );
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
