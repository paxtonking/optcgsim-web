/**
 * AIService - AI opponent for One Piece TCG
 *
 * Uses strategy pattern to implement different difficulty levels.
 * Each difficulty has its own decision-making strategy.
 */

import {
  GameState,
  GamePhase,
  PlayerState,
  CardState,
  ActionType,
  CardZone,
} from '@optcgsim/shared';
import { AIDecision, DifficultyLevel } from './types.js';
import { AI_CONFIG } from './config.js';
import { BaseStrategy } from './strategies/BaseStrategy.js';
import { EasyStrategy } from './strategies/EasyStrategy.js';
import { MediumStrategy } from './strategies/MediumStrategy.js';
import { HardStrategy } from './strategies/HardStrategy.js';
import { cardLoaderService } from '../CardLoaderService.js';

export class AIService {
  private playerId: string;
  private difficulty: DifficultyLevel;
  private strategy: BaseStrategy;

  constructor(playerId: string, difficulty: DifficultyLevel = 'medium') {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.strategy = this.createStrategy(difficulty);
  }

  /**
   * Create the appropriate strategy for the difficulty level
   */
  private createStrategy(difficulty: DifficultyLevel): BaseStrategy {
    switch (difficulty) {
      case 'easy':
      case 'basic':
        return new EasyStrategy(this.playerId, difficulty);

      case 'medium':
        return new MediumStrategy(this.playerId, difficulty);

      case 'hard':
        return new HardStrategy(this.playerId, difficulty);

      default:
        return new MediumStrategy(this.playerId, 'medium');
    }
  }

  /**
   * Get the next action the AI should take based on current game state
   */
  public getNextAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    // PRIORITY: Check for pending effects that need resolution BEFORE phase handling
    // These can exist in any phase and must be resolved first
    const pendingEffectAction = this.handlePendingEffects(gameState, player);
    if (pendingEffectAction) {
      return pendingEffectAction;
    }

    // Pre-game setup phase
    if (gameState.phase === GamePhase.PRE_GAME_SETUP) {
      return this.decidePreGameSetup(gameState, player);
    }

    // Mulligan phase
    if (gameState.phase === GamePhase.START_MULLIGAN) {
      return this.strategy.decideMulligan(player);
    }

    // Defensive phases (BLOCKER_STEP, COUNTER_STEP)
    if (gameState.phase === GamePhase.BLOCKER_STEP || gameState.phase === GamePhase.COUNTER_STEP) {
      if (gameState.currentCombat) {
        const attackerId = gameState.currentCombat.attackerId;
        const aiOwnsAttacker = player.field.some(c => c.id === attackerId) ||
                               player.leaderCard?.id === attackerId;

        if (aiOwnsAttacker) {
          return null; // AI is attacker, wait for defender
        } else {
          return this.getDefensiveAction(gameState);
        }
      }
    }

    // Check if it's AI's turn
    if (gameState.activePlayerId !== this.playerId) {
      return this.getDefensiveAction(gameState);
    }

    // Handle different phases
    switch (gameState.phase) {
      case GamePhase.MAIN_PHASE:
        return this.getMainPhaseAction(gameState, player);

      case GamePhase.COMBAT_PHASE:
        return this.getCombatAction(gameState, player);

      case GamePhase.PLAY_EFFECT_STEP:
        return this.getPlayEffectAction(gameState, player);

      case GamePhase.ATTACK_EFFECT_STEP:
        return this.getAttackEffectAction(gameState, player);

      case GamePhase.TRIGGER_STEP:
        // Trigger step - AI should pass if no trigger to activate
        // Use TRIGGER_LIFE with no effectId to pass the trigger
        console.log('[AI] In TRIGGER_STEP, passing trigger');
        return { action: ActionType.TRIGGER_LIFE, data: {} };

      default:
        return null;
    }
  }

  /**
   * Handle any pending effects that need resolution
   * Returns an action if there's a pending effect to handle, null otherwise
   */
  private handlePendingEffects(gameState: GameState, player: PlayerState): AIDecision | null {
    // Check for pending ACTIVATE_MAIN effects (stage abilities, etc.)
    if (gameState.pendingActivateEffects?.length) {
      const myEffect = gameState.pendingActivateEffects.find(e => e.playerId === this.playerId);
      if (myEffect) {
        return this.getActivateEffectAction(gameState, player, myEffect);
      }
    }

    // Check for pending event effects
    if (gameState.pendingEventEffects?.length) {
      const myEffect = gameState.pendingEventEffects.find(e => e.playerId === this.playerId);
      if (myEffect) {
        return this.getEventEffectAction(gameState, player, myEffect);
      }
    }

    // Check for pending counter effects
    if (gameState.pendingCounterEffects?.length) {
      const myEffect = gameState.pendingCounterEffects.find(e => e.playerId === this.playerId);
      if (myEffect) {
        return this.getCounterEffectAction(gameState, player, myEffect);
      }
    }

    // Check for pending deck reveal effects
    if (gameState.pendingDeckRevealEffect && gameState.pendingDeckRevealEffect.playerId === this.playerId) {
      return this.getDeckRevealAction(gameState, player, gameState.pendingDeckRevealEffect);
    }

    // Check for pending hand select effects
    if (gameState.pendingHandSelectEffect && gameState.pendingHandSelectEffect.playerId === this.playerId) {
      return this.getHandSelectAction(gameState, player, gameState.pendingHandSelectEffect);
    }

    // Check for pending field select effects
    if (gameState.pendingFieldSelectEffect && gameState.pendingFieldSelectEffect.playerId === this.playerId) {
      return this.getFieldSelectAction(gameState, player, gameState.pendingFieldSelectEffect);
    }

    // Check for pending choice effects (cost alternatives / choose-one)
    if (gameState.pendingChoiceEffect && gameState.pendingChoiceEffect.playerId === this.playerId) {
      return this.getChoiceAction(gameState, player, gameState.pendingChoiceEffect);
    }

    // Check for pending additional cost decision
    if (gameState.pendingAdditionalCost && gameState.pendingAdditionalCost.playerId === this.playerId) {
      return this.getAdditionalCostAction(gameState, player, gameState.pendingAdditionalCost);
    }

    return null;
  }

  /**
   * Handle ACTIVATE_MAIN effect resolution
   */
  private getActivateEffectAction(_gameState: GameState, _player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending ACTIVATE effect:', pendingEffect.id);

    // If effect has valid hand card IDs, select from them
    if (pendingEffect.validHandCardIds && pendingEffect.validHandCardIds.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(
        pendingEffect.validHandCardIds,
        _gameState,
        pendingEffect.description || 'activate'
      );
      return {
        action: ActionType.RESOLVE_ACTIVATE_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    // No valid targets or optional effect - skip
    return {
      action: ActionType.SKIP_ACTIVATE_EFFECT,
      data: { effectId: pendingEffect.id },
    };
  }

  /**
   * Handle event effect resolution
   */
  private getEventEffectAction(_gameState: GameState, _player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending EVENT effect:', pendingEffect.id);

    if (pendingEffect.validTargets && pendingEffect.validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(
        pendingEffect.validTargets,
        _gameState,
        pendingEffect.description || 'event'
      );
      return {
        action: ActionType.RESOLVE_EVENT_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    return {
      action: ActionType.SKIP_EVENT_EFFECT,
      data: { effectId: pendingEffect.id },
    };
  }

  /**
   * Handle counter effect resolution
   */
  private getCounterEffectAction(_gameState: GameState, _player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending COUNTER effect:', pendingEffect.id);

    if (pendingEffect.validTargets && pendingEffect.validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(
        pendingEffect.validTargets,
        _gameState,
        pendingEffect.description || 'counter'
      );
      return {
        action: ActionType.RESOLVE_COUNTER_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    return {
      action: ActionType.SKIP_COUNTER_EFFECT,
      data: { effectId: pendingEffect.id },
    };
  }

  /**
   * Handle deck reveal effect resolution
   */
  private getDeckRevealAction(_gameState: GameState, _player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending DECK_REVEAL effect');

    // If there are selectable cards, pick the first valid ones
    // selectableCardIds contains cards matching the filter (e.g., trait filter)
    if (pendingEffect.selectableCardIds && pendingEffect.selectableCardIds.length > 0) {
      // Select up to maxSelections (or at least minSelections)
      const selectCount = Math.min(
        pendingEffect.maxSelections || 1,
        pendingEffect.selectableCardIds.length
      );
      const selectedCards = pendingEffect.selectableCardIds.slice(0, selectCount);

      return {
        action: ActionType.RESOLVE_DECK_REVEAL,
        data: { selectedCardIds: selectedCards },
      };
    }

    // No selectable cards or optional effect - skip
    return {
      action: ActionType.SKIP_DECK_REVEAL,
      data: {},
    };
  }

  /**
   * Handle hand select effect resolution (discard, etc.)
   */
  private getHandSelectAction(_gameState: GameState, player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending HAND_SELECT effect');

    // Select cards from hand based on requirement
    const hand = player.hand;
    const selectCount = pendingEffect.minSelections || 1;

    if (hand.length > 0 && selectCount > 0) {
      // For discard effects, select the lowest value cards
      // Simple heuristic: pick cards with lowest cost first
      const sortedHand = [...hand].sort((a, b) => (a.cost || 0) - (b.cost || 0));
      const selectedCards = sortedHand.slice(0, Math.min(selectCount, hand.length)).map(c => c.id);

      return {
        action: ActionType.RESOLVE_HAND_SELECT,
        data: { selectedCardIds: selectedCards },
      };
    }

    // Can't fulfill requirement or optional - skip
    if (pendingEffect.canSkip) {
      return {
        action: ActionType.SKIP_HAND_SELECT,
        data: {},
      };
    }

    // Forced to select but no cards - return empty selection
    return {
      action: ActionType.RESOLVE_HAND_SELECT,
      data: { selectedCardIds: [] },
    };
  }

  /**
   * Handle field select effect resolution (trash/rest from field)
   */
  private getFieldSelectAction(_gameState: GameState, player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending FIELD_SELECT effect');

    const validTargetIds: string[] = pendingEffect.validTargetIds || [];
    const minSelections: number = pendingEffect.minSelections || 0;
    const maxSelections: number = pendingEffect.maxSelections || minSelections;

    if (validTargetIds.length === 0) {
      if (pendingEffect.canSkip) {
        return { action: ActionType.SKIP_FIELD_SELECT, data: {} };
      }
      return { action: ActionType.RESOLVE_FIELD_SELECT, data: { selectedCardIds: [] } };
    }

    // Prefer lower-cost cards when selecting sacrifices from field.
    const sorted = [...validTargetIds].sort((a, b) => {
      const cardA = player.field.find(c => c.id === a);
      const cardB = player.field.find(c => c.id === b);
      return (cardA?.cost || 0) - (cardB?.cost || 0);
    });

    const selectedCount = Math.min(maxSelections, sorted.length);
    const selectedCardIds = sorted.slice(0, selectedCount);

    if (selectedCardIds.length < minSelections) {
      if (pendingEffect.canSkip) {
        return { action: ActionType.SKIP_FIELD_SELECT, data: {} };
      }
      return { action: ActionType.RESOLVE_FIELD_SELECT, data: { selectedCardIds: [] } };
    }

    return {
      action: ActionType.RESOLVE_FIELD_SELECT,
      data: { selectedCardIds },
    };
  }

  /**
   * Handle choice effect resolution (cost alternatives / choose one)
   */
  private getChoiceAction(_gameState: GameState, _player: PlayerState, pendingEffect: any): AIDecision {
    console.log('[AI] Handling pending CHOICE effect');

    const options: Array<{ id: string; enabled: boolean }> = pendingEffect.options || [];
    const enabledOptions = options.filter(option => option.enabled);

    if (enabledOptions.length === 0) {
      // No enabled options - pick the first option anyway (or skip if available)
      const skipOption = options.find(option => option.id === 'cost-skip');
      const fallback = skipOption || options[0];
      return {
        action: ActionType.RESOLVE_CHOICE,
        data: { optionId: fallback?.id || 'cost-skip' },
      };
    }

    // Prefer paying a real option over skipping when possible.
    const selected = enabledOptions.find(option => option.id !== 'cost-skip') || enabledOptions[0];
    return {
      action: ActionType.RESOLVE_CHOICE,
      data: { optionId: selected.id },
    };
  }

  /**
   * Handle additional cost decision
   */
  private getAdditionalCostAction(_gameState: GameState, player: PlayerState, pendingCost: any): AIDecision {
    console.log('[AI] Handling pending ADDITIONAL_COST:', pendingCost.costType);

    const costId = pendingCost.id;

    // Evaluate whether paying the cost is worthwhile
    if (pendingCost.costType === 'REST_DON') {
      // Pay REST_DON if we have spare active DON
      const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE && !d.attachedTo);
      if (activeDon.length > (pendingCost.amount || 1)) {
        return {
          action: ActionType.PAY_ADDITIONAL_COST,
          data: { costId },
        };
      }
    } else if (pendingCost.costType === 'TRASH_CARD') {
      // Pay TRASH_CARD if we have enough hand cards to spare
      if (player.hand.length > 2) {
        return {
          action: ActionType.PAY_ADDITIONAL_COST,
          data: { costId },
        };
      }
    }

    // Default: skip optional costs (conservative play)
    return {
      action: ActionType.SKIP_ADDITIONAL_COST,
      data: { costId },
    };
  }

  /**
   * Pre-game setup (e.g., Imu's stage play)
   */
  private decidePreGameSetup(gameState: GameState, _player: PlayerState): AIDecision | null {
    const pendingEffects = gameState.pendingPreGameEffects || [];
    const myEffect = pendingEffects.find(e => e.playerId === this.playerId);

    if (!myEffect) return null;

    if (myEffect.validCardIds && myEffect.validCardIds.length > 0) {
      return {
        action: ActionType.PRE_GAME_SELECT,
        data: { cardId: myEffect.validCardIds[0] },
      };
    }

    return {
      action: ActionType.SKIP_PRE_GAME,
      data: {},
    };
  }

  /**
   * Main phase action
   */
  private getMainPhaseAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const activeDon = player.donField.filter(d => d.state === CardState.ACTIVE).length;

    // 1. Try to play cards
    const cardToPlay = this.strategy.selectCardToPlay(player, activeDon, gameState);
    if (cardToPlay) {
      // Determine correct zone based on card type
      const cardDef = cardLoaderService.getCard(cardToPlay.cardId);
      let zone: CardZone = CardZone.FIELD;
      if (cardDef?.type === 'EVENT') {
        zone = CardZone.EVENT;
      } else if (cardDef?.type === 'STAGE') {
        zone = CardZone.STAGE;
      }
      return {
        action: ActionType.PLAY_CARD,
        data: { cardId: cardToPlay.id, zone },
      };
    }

    // 2. Attach DON
    const donAttachment = this.strategy.selectDonAttachment(player, gameState);
    if (donAttachment) {
      return {
        action: ActionType.ATTACH_DON,
        data: donAttachment,
      };
    }

    // 3. Declare attacks
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);
    if (readyAttackers.length > 0) {
      const target = this.strategy.selectAttackTarget(gameState, player, readyAttackers[0]);
      return {
        action: ActionType.DECLARE_ATTACK,
        data: target,
      };
    }

    // 4. End turn
    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Combat phase action
   */
  private getCombatAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const readyAttackers = this.getReadyAttackers(player, gameState.turn);

    if (readyAttackers.length > 0) {
      const target = this.strategy.selectAttackTarget(gameState, player, readyAttackers[0]);
      return {
        action: ActionType.DECLARE_ATTACK,
        data: target,
      };
    }

    return { action: ActionType.END_TURN, data: {} };
  }

  /**
   * Handle play effect step
   */
  private getPlayEffectAction(gameState: GameState, player: PlayerState): AIDecision | null {
    const pendingEffect = gameState.pendingPlayEffects?.[0];
    if (!pendingEffect || pendingEffect.playerId !== this.playerId) return null;

    const validTargets = pendingEffect.validTargets || [];

    // Handle ATTACH_DON effects
    if (pendingEffect.effectType === 'ATTACH_DON') {
      const restedDon = player.donField.filter(d => d.state === CardState.RESTED && !d.attachedTo);

      if (restedDon.length === 0) {
        return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
      }

      const donId = restedDon[0].id;
      const targetId = player.leaderCard?.id || player.field[0]?.id;

      if (!targetId) {
        return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
      }

      return {
        action: ActionType.RESOLVE_PLAY_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets: [donId, targetId] },
      };
    }

    // Handle REST_DON effects (e.g., "rest up to 1 DON")
    if (pendingEffect.effectType === 'REST_DON') {
      // If no valid targets (all DON already rested), skip
      if (validTargets.length === 0) {
        console.log('[AI] REST_DON effect has no valid targets, skipping');
        return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
      }

      // Select DON to rest (pick first available)
      const maxTargets = pendingEffect.maxTargets || 1;
      const selectedTargets = validTargets.slice(0, maxTargets);
      return {
        action: ActionType.RESOLVE_PLAY_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    // Use strategy for target selection
    if (validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(validTargets, gameState, pendingEffect.effectType);
      return {
        action: ActionType.RESOLVE_PLAY_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    // Skip optional effects with no targets (minTargets === 0 or undefined means optional)
    if (!pendingEffect.minTargets || pendingEffect.minTargets === 0) {
      console.log('[AI] Optional effect with no valid targets, skipping');
      return { action: ActionType.SKIP_PLAY_EFFECT, data: { effectId: pendingEffect.id } };
    }

    return {
      action: ActionType.RESOLVE_PLAY_EFFECT,
      data: { effectId: pendingEffect.id, selectedTargets: [] },
    };
  }

  /**
   * Handle attack effect step
   */
  private getAttackEffectAction(gameState: GameState, _player: PlayerState): AIDecision | null {
    const pendingEffect = gameState.pendingAttackEffects?.[0];
    if (!pendingEffect || pendingEffect.playerId !== this.playerId) return null;

    const validTargets = pendingEffect.validTargets || [];

    if (validTargets.length > 0) {
      const selectedTargets = this.strategy.selectEffectTargets(validTargets, gameState, pendingEffect.description);
      return {
        action: ActionType.RESOLVE_ATTACK_EFFECT,
        data: { effectId: pendingEffect.id, selectedTargets },
      };
    }

    if (!pendingEffect.requiresChoice) {
      return { action: ActionType.SKIP_ATTACK_EFFECT, data: { effectId: pendingEffect.id } };
    }

    return {
      action: ActionType.RESOLVE_ATTACK_EFFECT,
      data: { effectId: pendingEffect.id, selectedTargets: [] },
    };
  }

  /**
   * Handle defensive actions
   */
  private getDefensiveAction(gameState: GameState): AIDecision | null {
    const player = gameState.players[this.playerId];
    if (!player) return null;

    switch (gameState.phase) {
      case GamePhase.COUNTER_STEP:
        return this.strategy.decideCounter(gameState, player);

      case GamePhase.BLOCKER_STEP:
        return this.strategy.decideBlock(gameState, player);

      case GamePhase.TRIGGER_STEP:
        return { action: ActionType.TRIGGER_LIFE, data: {} };

      default:
        return null;
    }
  }

  /**
   * Get characters ready to attack
   */
  private getReadyAttackers(player: PlayerState, currentTurn: number): any[] {
    // First turn rule: neither player can attack on their first personal turn
    if (player.turnCount === 1) {
      return [];
    }

    return player.field.filter(card => {
      if (card.state !== CardState.ACTIVE) return false;
      if (card.hasAttacked) return false;

      // Check if can attack (Rush or not played this turn)
      if (card.turnPlayed === currentTurn) {
        // Use runtime keywords (card.keywords) not static card definition
        // This respects conditional Rush that may not be active
        if (!card.keywords?.includes('Rush')) return false;
      }

      return true;
    });
  }

  /**
   * Get AI player ID
   */
  public getPlayerId(): string {
    return this.playerId;
  }

  /**
   * Get AI difficulty
   */
  public getDifficulty(): string {
    return this.difficulty;
  }

  /**
   * Get think delay for this difficulty
   */
  public getThinkDelay(): number {
    return AI_CONFIG[this.difficulty].thinkDelay;
  }
}

// Factory function to create AI players
export function createAIPlayer(difficulty: DifficultyLevel = 'medium'): AIService {
  const aiPlayerId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return new AIService(aiPlayerId, difficulty);
}

// Re-export types
export type { AIDecision } from './types.js';
