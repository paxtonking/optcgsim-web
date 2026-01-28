import React, { useState } from 'react';
import { PendingPreGameEffect, GameCard } from '@optcgsim/shared';
import { GameCard as GameCardComponent } from './GameCard';
import './GameBoard.css';

interface CardDefinition {
  id: string;
  name: string;
  type?: string;
  colors?: string[];
  cost?: number | null;
  power?: number | null;
  imageUrl?: string;
  traits?: string[];
  effectText?: string;
}

interface PreGameSetupProps {
  effect: PendingPreGameEffect;
  deckCards: GameCard[];
  cardDefinitions: Map<string, CardDefinition>;
  onSelect: (cardId: string) => void;
  onSkip: () => void;
  onHover?: (card: GameCard | null) => void;
}

export const PreGameSetup: React.FC<PreGameSetupProps> = ({
  effect,
  deckCards,
  cardDefinitions,
  onSelect,
  onSkip,
  onHover,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Get valid cards from deck
  const validCards = deckCards.filter(card => effect.validCardIds.includes(card.id));

  const handleCardClick = (card: GameCard) => {
    if (effect.validCardIds.includes(card.id)) {
      setSelectedCardId(card.id);
    }
  };

  const handleConfirm = () => {
    if (selectedCardId) {
      onSelect(selectedCardId);
    }
  };

  return (
    <div className="pre-game-setup-overlay">
      <div className="pre-game-setup-modal">
        <h2 className="pre-game-setup-title">Start of Game Ability</h2>
        <p className="pre-game-setup-description">{effect.description}</p>

        {validCards.length > 0 ? (
          <>
            <p className="pre-game-setup-instruction">
              Select a card to play (up to {effect.count}):
            </p>
            <div className="pre-game-setup-cards">
              {validCards.map(card => {
                const cardDef = cardDefinitions.get(card.cardId);
                const isSelected = selectedCardId === card.id;

                return (
                  <div
                    key={card.id}
                    className={`pre-game-card-wrapper ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleCardClick(card)}
                  >
                    <GameCardComponent
                      card={card}
                      cardDef={cardDef}
                      faceUp={true}
                      onHover={onHover}
                      onClick={() => handleCardClick(card)}
                    />
                    {cardDef && (
                      <p className="pre-game-card-name">{cardDef.name}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="pre-game-setup-no-cards">
            No valid cards found in your deck.
          </p>
        )}

        <div className="pre-game-setup-buttons">
          {selectedCardId && (
            <button
              className="pre-game-btn pre-game-btn-confirm"
              onClick={handleConfirm}
            >
              Play Selected Card
            </button>
          )}
          {effect.optional && (
            <button
              className="pre-game-btn pre-game-btn-skip"
              onClick={onSkip}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreGameSetup;
