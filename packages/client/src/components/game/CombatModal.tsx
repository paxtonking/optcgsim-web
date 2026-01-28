import React, { useMemo } from 'react';
import { GameState, GameCard as GameCardType, GamePhase } from '@optcgsim/shared';
import { GameCard } from './GameCard';
import './CombatModal.css';

interface CardDefinition {
  id: string;
  name: string;
  type?: string;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  imageUrl?: string;
  keywords?: string[];  // Detected from effect text: [Blocker], [Rush], etc.
  effect?: string | null;  // Raw effect text for checking [Counter] effects
}

interface CombatModalProps {
  gameState: GameState;
  playerId: string;
  cardDefinitions: Map<string, CardDefinition>;
  isDefender: boolean;
  pinnedCard?: GameCardType | null;
  isAttackerUnblockable?: boolean;  // True if attacker has Unblockable (permanent or temporary)
  onUseCounter: (cardIds: string[]) => void;
  onPassCounter: () => void;
  onSelectBlocker: (blockerId: string) => void;
  onPassBlocker: () => void;
  onCardHover?: (card: GameCardType | null) => void;
}

export const CombatModal: React.FC<CombatModalProps> = ({
  gameState,
  playerId,
  cardDefinitions,
  isDefender,
  pinnedCard,
  isAttackerUnblockable = false,
  onUseCounter,
  onPassCounter,
  onSelectBlocker,
  onPassBlocker,
  onCardHover
}) => {
  const combat = gameState.currentCombat;

  if (!combat) return null;

  // Find attacker card
  const attacker = useMemo(() => {
    for (const player of Object.values(gameState.players)) {
      const fieldCard = player.field.find(c => c.id === combat.attackerId);
      if (fieldCard) return { card: fieldCard, player };
      if (player.leaderCard?.id === combat.attackerId) {
        return { card: player.leaderCard, player };
      }
    }
    return null;
  }, [gameState, combat.attackerId]);

  // Find target card
  const target = useMemo(() => {
    // First, try to find by targetId if available
    if (combat.targetId) {
      for (const player of Object.values(gameState.players)) {
        // Check if it's the leader
        if (player.leaderCard?.id === combat.targetId) {
          return { card: player.leaderCard, player };
        }
        // Check field cards
        const fieldCard = player.field.find(c => c.id === combat.targetId);
        if (fieldCard) return { card: fieldCard, player };
      }
    }

    // For leader attacks without targetId, find the defender's leader
    // The defender is the player who does NOT own the attacker
    if (combat.targetType === 'leader' && attacker) {
      for (const player of Object.values(gameState.players)) {
        if (player.id !== attacker.player.id && player.leaderCard) {
          return { card: player.leaderCard, player };
        }
      }
    }

    return null;
  }, [gameState, combat.targetId, combat.targetType, attacker]);

  // Get defender player (the one being attacked)
  const defenderPlayer = useMemo(() => {
    if (!attacker) return null;
    const attackerPlayerId = attacker.player.id;
    return Object.values(gameState.players).find(p => p.id !== attackerPlayerId);
  }, [gameState, attacker]);

  // Find available blockers
  const availableBlockers = useMemo(() => {
    if (!defenderPlayer || gameState.phase !== GamePhase.BLOCKER_STEP) return [];
    return defenderPlayer.field.filter(card => {
      if (card.state !== 'ACTIVE') return false;
      const def = cardDefinitions.get(card.cardId);
      return def?.keywords?.includes('Blocker');
    });
  }, [defenderPlayer, gameState.phase, cardDefinitions]);

  // Count available DON for event counter cost checking
  const activeDonCount = useMemo(() => {
    if (!defenderPlayer) return 0;
    return defenderPlayer.donField.filter(d => d.state === 'ACTIVE' && !d.attachedTo).length;
  }, [defenderPlayer]);

  // Find available counter cards
  // Includes: 1) Character cards with counter value (free), 2) Event cards with [Counter] effect (costs DON)
  const availableCounters = useMemo(() => {
    if (!defenderPlayer || gameState.phase !== GamePhase.COUNTER_STEP) return [];
    return defenderPlayer.hand.filter(card => {
      const def = cardDefinitions.get(card.cardId);
      if (!def) return false;

      // Character cards with counter value (free to use)
      if (def.counter !== undefined && def.counter !== null && def.counter > 0) {
        return true;
      }

      // Event cards with [Counter] effect (require DON cost payment)
      if (def.type === 'EVENT' && def.effect?.toLowerCase().includes('[counter]')) {
        // Check if player has enough active DON to pay the event's cost
        const eventCost = def.cost || 0;
        return activeDonCount >= eventCost;
      }

      return false;
    });
  }, [defenderPlayer, gameState.phase, cardDefinitions, activeDonCount]);

  // Calculate powers
  const attackPower = combat.attackPower || 0;

  // Defender power includes base power + attached DON (+1000 each)
  const defenderAttachedDon = defenderPlayer?.donField.filter(d => d.attachedTo === target?.card.id).length || 0;
  const defenderBasePower = (target?.card.power || 0) + (defenderAttachedDon * 1000);

  const counterPower = combat.counterPower || 0;
  const effectBuffPower = combat.effectBuffPower || 0;
  const totalDefenderPower = defenderBasePower + counterPower + effectBuffPower;

  // Determine phase text
  const phaseText = gameState.phase === GamePhase.BLOCKER_STEP
    ? 'Blocker Step'
    : 'Counter Step';

  const isAttackerWinning = attackPower >= totalDefenderPower;

  return (
    <div className="combat-modal-overlay">
      <div className="combat-modal">
        <div className="combat-modal__header">
          <h2 className="combat-modal__title">Combat - {phaseText}</h2>
          {combat.isBlocked && (
            <span className="combat-modal__blocked-badge">BLOCKED</span>
          )}
        </div>

        <div className="combat-modal__content">
          {/* Attacker Side */}
          <div className="combat-modal__side combat-modal__side--attacker">
            <div className="combat-modal__label">
              <span className="combat-modal__owner">
                {attacker?.player.id === playerId ? 'YOU' : 'OPPONENT'}
              </span>
              <span className="combat-modal__role">Attacker</span>
            </div>
            {attacker && (
              <>
                <div className="combat-modal__card-upright">
                  <GameCard
                    card={{ ...attacker.card, state: 'ACTIVE' as any }}
                    cardDef={cardDefinitions.get(attacker.card.cardId)}
                    faceUp={true}
                    size="large"
                    onHover={onCardHover}
                  />
                </div>
                <div className="combat-modal__power combat-modal__power--attacker">
                  {attackPower}
                </div>
              </>
            )}
          </div>

          {/* VS Indicator */}
          <div className="combat-modal__vs">
            <span className="combat-modal__vs-text">VS</span>
            <div className={`combat-modal__result ${isAttackerWinning ? 'combat-modal__result--attacker' : 'combat-modal__result--defender'}`}>
              {isAttackerWinning ? 'Attack succeeds' : 'Attack blocked'}
            </div>
          </div>

          {/* Defender Side */}
          <div className="combat-modal__side combat-modal__side--defender">
            <div className="combat-modal__label">
              <span className="combat-modal__owner">
                {target?.player.id === playerId ? 'YOU' : 'OPPONENT'}
              </span>
              <span className="combat-modal__role">
                {combat.targetType === 'leader' ? 'Leader' : 'Target'}
              </span>
            </div>
            {target && (
              <>
                <div className="combat-modal__card-upright">
                  <GameCard
                    card={{ ...target.card, state: 'ACTIVE' as any }}
                    cardDef={cardDefinitions.get(target.card.cardId)}
                    faceUp={true}
                    size="large"
                    onHover={onCardHover}
                  />
                </div>
                <div className="combat-modal__power combat-modal__power--defender">
                  {defenderBasePower}
                  {counterPower > 0 && (
                    <span className="combat-modal__counter-bonus"> +{counterPower}</span>
                  )}
                  {effectBuffPower > 0 && (
                    <span className="combat-modal__effect-bonus"> +{effectBuffPower}</span>
                  )}
                  {(counterPower > 0 || effectBuffPower > 0) && (
                    <span className="combat-modal__total"> = {totalDefenderPower}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions - Only show for defender */}
        {isDefender && (
          <div className="combat-modal__actions">
            {gameState.phase === GamePhase.BLOCKER_STEP && (
              <>
                <div className="combat-modal__instruction">
                  {isAttackerUnblockable
                    ? 'Attacker cannot be blocked! Click Skip to continue.'
                    : 'Click a character in your field below to select a blocker'}
                </div>
                <div className="combat-modal__action-buttons">
                  {!isAttackerUnblockable && (
                    <button
                      className="combat-modal__btn combat-modal__btn--block"
                      disabled={!pinnedCard || !availableBlockers.find(b => b.id === pinnedCard.id)}
                      onClick={() => {
                        if (pinnedCard && availableBlockers.find(b => b.id === pinnedCard.id)) {
                          onSelectBlocker(pinnedCard.id);
                        }
                      }}
                    >
                      Block
                    </button>
                  )}
                  <button
                    className="combat-modal__btn combat-modal__btn--skip"
                    onClick={() => {
                      onPassBlocker();
                    }}
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

            {gameState.phase === GamePhase.COUNTER_STEP && (
              <>
                <div className="combat-modal__instruction">
                  Click a card in your hand below to select a counter
                </div>
                {/* DON display for event counter costs */}
                <div className="combat-modal__don-area">
                  <div className="combat-modal__don-label">
                    Available DON: {activeDonCount}
                  </div>
                  <div className="combat-modal__don-cards">
                    {defenderPlayer?.donField
                      .filter(d => d.state === 'ACTIVE' && !d.attachedTo)
                      .slice(0, 10)  // Show max 10 DON indicators
                      .map(don => (
                        <div key={don.id} className="combat-modal__don-card" title="Active DON" />
                      ))}
                  </div>
                </div>
                <div className="combat-modal__action-buttons">
                  <button
                    className="combat-modal__btn combat-modal__btn--counter"
                    disabled={!pinnedCard || !availableCounters.find(c => c.id === pinnedCard.id)}
                    onClick={() => {
                      if (pinnedCard && availableCounters.find(c => c.id === pinnedCard.id)) {
                        onUseCounter([pinnedCard.id]);
                      }
                    }}
                  >
                    Counter
                  </button>
                  <button
                    className="combat-modal__btn combat-modal__btn--skip"
                    onClick={() => {
                      onPassCounter();
                    }}
                  >
                    Skip
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Waiting message for attacker */}
        {!isDefender && (
          <div className="combat-modal__waiting">
            Waiting for opponent to respond...
          </div>
        )}
      </div>
    </div>
  );
};

export default CombatModal;
