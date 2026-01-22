import React from 'react';
import { PlayerState, GameCard as GameCardType } from '@optcgsim/shared';
import { GameCard, CardPile } from './GameCard';
import { LifeBar } from './LifeBar';
import './GameBoard.css';

interface CardDefinition {
  id: string;
  name: string;
  cardType: string;
  color: string;
  cost?: number;
  power?: number;
}

interface PlayerAreaProps {
  player: PlayerState;
  isOpponent: boolean;
  cardDefinitions: Map<string, CardDefinition>;
  playableCards?: Set<string>;
  targetableCards?: Set<string>;
  selectedCard?: GameCardType | null;
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
  onDeckClick?: () => void;
  onTrashClick?: () => void;
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isOpponent,
  cardDefinitions,
  playableCards = new Set(),
  targetableCards = new Set(),
  selectedCard,
  onCardHover,
  onCardClick,
  onDeckClick,
  onTrashClick
}) => {
  const areaClasses = [
    'player-area',
    isOpponent ? 'player-area--opponent' : 'player-area--player'
  ].join(' ');

  // Get characters on field (non-leader)
  const characters = player.field.filter(card => card.zone === 'FIELD');

  return (
    <div className={areaClasses}>
      {/* Playmat background */}
      <div
        className="player-area__playmat"
        style={{
          backgroundImage: `url('/assets/playmats/playmatt.jpg')`
        }}
      />

      {/* Left section: Life & DON */}
      <div className="player-area__left">
        {/* Life Zone */}
        <div className="zone zone--life">
          <span className="zone__label">Life</span>
          <LifeBar
            current={player.lifeCards.length}
            max={5}
          />
          <CardPile
            cards={player.lifeCards}
            label=""
            showCount={false}
            faceUp={false}
          />
        </div>

        {/* DON Zone */}
        <div className="zone zone--don">
          <span className="zone__label">DON!!</span>
          <div className="don-count">{player.donField.length}</div>
          {player.donField.length > 0 && (
            <CardPile
              cards={player.donField}
              label=""
              showCount={false}
              faceUp={true}
            />
          )}
        </div>
      </div>

      {/* Center section: Leader & Characters */}
      <div className="player-area__center">
        {/* Leader Zone */}
        <div className="zone zone--leader">
          <span className="zone__label">Leader</span>
          {player.leaderCard && (
            <GameCard
              card={player.leaderCard}
              cardDef={cardDefinitions.get(player.leaderCard.cardId)}
              faceUp={true}
              isTarget={targetableCards.has(player.leaderCard.id)}
              isSelected={selectedCard?.id === player.leaderCard.id}
              onHover={onCardHover}
              onClick={onCardClick}
            />
          )}
        </div>

        {/* Character Zone */}
        <div className="zone zone--characters">
          <span className="zone__label">Characters</span>
          {characters.map(card => (
            <GameCard
              key={card.id}
              card={card}
              cardDef={cardDefinitions.get(card.cardId)}
              faceUp={true}
              isPlayable={!isOpponent && playableCards.has(card.id)}
              isTarget={targetableCards.has(card.id)}
              isSelected={selectedCard?.id === card.id}
              onHover={onCardHover}
              onClick={onCardClick}
            />
          ))}
        </div>
      </div>

      {/* Right section: Deck & Trash */}
      <div className="player-area__right">
        {/* Stage Card */}
        {player.field.find(c => c.cardId.includes('ST')) && (
          <div className="zone zone--stage">
            <span className="zone__label">Stage</span>
          </div>
        )}

        {/* Deck */}
        <CardPile
          cards={player.deck}
          label="Deck"
          showCount={true}
          faceUp={false}
          onClick={onDeckClick}
        />

        {/* Trash */}
        <CardPile
          cards={player.trash}
          label="Trash"
          showCount={true}
          faceUp={player.trash.length > 0}
          onClick={onTrashClick}
          onCardHover={onCardHover}
        />
      </div>
    </div>
  );
};

// Hand Zone Component (separate for better flexibility)
interface HandZoneProps {
  cards: GameCardType[];
  isOpponent: boolean;
  cardDefinitions: Map<string, CardDefinition>;
  playableCards?: Set<string>;
  selectedCard?: GameCardType | null;
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
}

export const HandZone: React.FC<HandZoneProps> = ({
  cards,
  isOpponent,
  cardDefinitions,
  playableCards = new Set(),
  selectedCard,
  onCardHover,
  onCardClick
}) => {
  const classes = [
    'hand-zone',
    isOpponent && 'hand-zone--opponent'
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="hand-zone__cards">
        {cards.map(card => (
          <GameCard
            key={card.id}
            card={card}
            cardDef={isOpponent ? undefined : cardDefinitions.get(card.cardId)}
            faceUp={!isOpponent}
            isPlayable={!isOpponent && playableCards.has(card.id)}
            isSelected={!isOpponent && selectedCard?.id === card.id}
            onHover={isOpponent ? undefined : onCardHover}
            onClick={isOpponent ? undefined : onCardClick}
          />
        ))}
      </div>
    </div>
  );
};

export default PlayerArea;
