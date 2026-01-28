import React, { useState, useCallback } from 'react';
import { PendingDeckRevealEffect, GameCard as GameCardType } from '@optcgsim/shared';
import { GameCard } from './GameCard';
import './GameBoard.css';

interface CardDefinition {
  id: string;
  name: string;
  type?: string;
  cardType?: string;
  color?: string;
  colors?: string[];
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  imageUrl?: string;
  traits?: string[];
}

interface DeckRevealModalProps {
  effect: PendingDeckRevealEffect;
  revealedCards: GameCardType[];  // Actual card objects from game state
  cardDefinitions: Map<string, CardDefinition>;
  onSelect: (selectedCardIds: string[]) => void;
  onSkip: () => void;
  onCardHover: (card: GameCardType | null) => void;
}

export const DeckRevealModal: React.FC<DeckRevealModalProps> = ({
  effect,
  revealedCards,
  cardDefinitions,
  onSelect,
  onSkip,
  onCardHover
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleCardClick = useCallback((card: GameCardType) => {
    if (!effect.selectableCardIds.includes(card.id)) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else if (next.size < effect.maxSelections) {
        next.add(card.id);
      }
      return next;
    });
  }, [effect.selectableCardIds, effect.maxSelections]);

  const handleConfirm = useCallback(() => {
    onSelect(Array.from(selectedIds));
  }, [selectedIds, onSelect]);

  const hasSelectableCards = effect.selectableCardIds.length > 0;
  const canConfirm = selectedIds.size >= effect.minSelections;

  // Get button text based on state
  const getConfirmButtonText = () => {
    if (selectedIds.size > 0) {
      return effect.selectAction === 'ADD_TO_HAND' ? 'Add to Hand' :
             effect.selectAction === 'PLAY_TO_FIELD' ? 'Play to Field' :
             'Add to Life';
    }
    return 'Confirm';
  };

  // Get remainder action description
  const getRemainderText = () => {
    switch (effect.remainderAction) {
      case 'TRASH': return 'will be sent to trash';
      case 'DECK_BOTTOM': return 'will be placed at bottom of deck';
      case 'SHUFFLE_INTO_DECK': return 'will be shuffled into deck';
      default: return 'will be discarded';
    }
  };

  return (
    <div className="deck-reveal-modal">
      <div className="deck-reveal-modal__overlay" />
      <div className="deck-reveal-modal__content">
        <h3 className="deck-reveal-modal__title">
          {effect.description}
        </h3>

        {effect.traitFilter && (
          <p className="deck-reveal-modal__filter-info">
            Looking for: <span className="deck-reveal-modal__trait">{`{${effect.traitFilter}}`}</span> type cards
          </p>
        )}

        <div className="deck-reveal-modal__cards">
          {revealedCards.map(card => {
            const isSelectable = effect.selectableCardIds.includes(card.id);
            const isSelected = selectedIds.has(card.id);
            const cardDef = cardDefinitions.get(card.cardId);

            return (
              <div
                key={card.id}
                className={`deck-reveal-modal__card-wrapper ${!isSelectable ? 'deck-reveal-modal__card-wrapper--dimmed' : ''}`}
              >
                <GameCard
                  card={card}
                  cardDef={cardDef}
                  faceUp={true}
                  isEventEffectTarget={isSelectable && !isSelected}
                  isEventEffectSelected={isSelected}
                  onClick={isSelectable ? handleCardClick : undefined}
                  onHover={onCardHover}
                  size="normal"
                />
                {!isSelectable && cardDef && (
                  <div className="deck-reveal-modal__card-label">
                    {effect.excludeNames?.includes(cardDef.name) ? 'Excluded' : 'No match'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!hasSelectableCards && (
          <p className="deck-reveal-modal__no-matches">
            No matching cards found
          </p>
        )}

        {hasSelectableCards && (
          <p className="deck-reveal-modal__selection-info">
            {selectedIds.size === 0
              ? `Select up to ${effect.maxSelections} card${effect.maxSelections > 1 ? 's' : ''}`
              : `Selected: ${selectedIds.size}/${effect.maxSelections}`
            }
          </p>
        )}

        <p className="deck-reveal-modal__remainder-info">
          Remaining cards {getRemainderText()}
        </p>

        <div className="deck-reveal-modal__buttons">
          <button
            className="action-btn action-btn--use-effect"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {getConfirmButtonText()}
          </button>
          {effect.minSelections === 0 && (
            <button
              className="action-btn action-btn--skip-effect"
              onClick={onSkip}
            >
              Send All to Trash
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeckRevealModal;
