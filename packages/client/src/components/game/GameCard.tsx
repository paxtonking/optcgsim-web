import React, { useState, useCallback, useEffect } from 'react';
import { GameCard as GameCardType, CardState } from '@optcgsim/shared';
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
}

interface GameCardProps {
  card: GameCardType;
  cardDef?: CardDefinition;
  faceUp: boolean;
  isPlayable?: boolean;
  isTarget?: boolean;
  isSelected?: boolean;
  isAttacking?: boolean;
  size?: 'small' | 'normal' | 'large';
  onHover?: (card: GameCardType | null) => void;
  onClick?: (card: GameCardType) => void;
  onDragStart?: (card: GameCardType) => void;
  className?: string;
}

export const GameCard: React.FC<GameCardProps> = ({
  card,
  cardDef,
  faceUp,
  isPlayable = false,
  isTarget = false,
  isSelected = false,
  isAttacking = false,
  size = 'normal',
  onHover,
  onClick,
  onDragStart,
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset image state when card changes
  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [card.id, cardDef?.imageUrl]);

  const isRested = card.state === CardState.RESTED;

  // Get image URL - use cardDef.imageUrl if available, proxy through our API
  const getImageUrl = () => {
    if (cardDef?.imageUrl) {
      const filename = cardDef.imageUrl.split('/').pop();
      // Use different proxy based on the source domain
      if (cardDef.imageUrl.includes('onepiece-cardgame.com')) {
        return `/api/images/official/${filename}`;
      }
      return `/api/images/cards/${filename}`;
    }
    return `/api/images/cards/${card.cardId}.png`;
  };
  const imageUrl = getImageUrl();

  const handleMouseEnter = useCallback(() => {
    onHover?.(card);
  }, [card, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback(() => {
    onClick?.(card);
  }, [card, onClick]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('cardId', card.id);
    onDragStart?.(card);
  }, [card, onDragStart]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Build class names
  const classes = [
    'game-card',
    `game-card--${size}`,
    isRested && 'game-card--rested',
    isPlayable && 'game-card--playable',
    isTarget && 'game-card--target',
    isSelected && 'game-card--selected',
    isAttacking && 'game-card--attacking',
    !faceUp && 'game-card--face-down',
    className
  ].filter(Boolean).join(' ');

  // Get card color for placeholder
  const getCardColor = () => {
    const colorMap: Record<string, string> = {
      'Red': '#c0392b',
      'RED': '#c0392b',
      'Blue': '#2980b9',
      'BLUE': '#2980b9',
      'Green': '#27ae60',
      'GREEN': '#27ae60',
      'Purple': '#8e44ad',
      'PURPLE': '#8e44ad',
      'Black': '#2c3e50',
      'BLACK': '#2c3e50',
      'Yellow': '#f39c12',
      'YELLOW': '#f39c12'
    };
    // Handle colors array or single color
    const color = cardDef?.colors?.[0] || cardDef?.color;
    if (!color) return '#444';
    // Handle multi-color like "GREEN RED"
    const firstColor = color.split(' ')[0];
    return colorMap[firstColor] || '#444';
  };

  return (
    <div
      className={classes}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      draggable={faceUp && !!onDragStart}
      onDragStart={handleDragStart}
    >
      {faceUp ? (
        <>
          {/* Card image */}
          {!imageError && (
            <img
              src={imageUrl}
              alt={cardDef?.name || card.cardId}
              className={`game-card__image ${imageLoaded ? 'game-card__image--loaded' : ''}`}
              onError={handleImageError}
              onLoad={handleImageLoad}
              draggable={false}
            />
          )}

          {/* Placeholder fallback when image fails or is loading */}
          {(imageError || !imageLoaded) && (
            <div
              className="game-card__placeholder"
              style={{ backgroundColor: getCardColor() }}
            >
              <div className="game-card__placeholder-content">
                <span className="game-card__placeholder-type">
                  {cardDef?.type || cardDef?.cardType || 'CARD'}
                </span>
                {(card.power || cardDef?.power) && (
                  <span className="game-card__placeholder-power">
                    {card.power || cardDef?.power}
                  </span>
                )}
                <span className="game-card__placeholder-name">
                  {cardDef?.name || card.cardId}
                </span>
                {cardDef?.cost != null && (
                  <span className="game-card__placeholder-cost">
                    {cardDef.cost}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Power overlay for characters on field */}
          {card.power && faceUp && (
            <div className="game-card__power-badge">
              {card.power}
            </div>
          )}

          {/* DON count badge for attached DON */}
          {card.attachedTo && (
            <div className="game-card__attached-badge">+1</div>
          )}
        </>
      ) : (
        // Card back
        <div className="game-card__back">
          <div className="game-card__back-design" />
        </div>
      )}

      {/* Selection/target ring */}
      {(isPlayable || isTarget || isSelected) && (
        <div className="game-card__ring" />
      )}
    </div>
  );
};

// Stacked card pile component (for deck, trash, life)
interface CardPileProps {
  cards: GameCardType[];
  label: string;
  showCount?: boolean;
  faceUp?: boolean;
  onClick?: () => void;
  onCardHover?: (card: GameCardType | null) => void;
}

export const CardPile: React.FC<CardPileProps> = ({
  cards,
  label,
  showCount = true,
  faceUp = false,
  onClick,
  onCardHover
}) => {
  const count = cards.length;

  return (
    <div className="card-pile" onClick={onClick}>
      <div className="card-pile__stack">
        {/* Show stacked effect */}
        {count > 0 && (
          <>
            {count > 2 && <div className="card-pile__layer card-pile__layer--3" />}
            {count > 1 && <div className="card-pile__layer card-pile__layer--2" />}
            <div className="card-pile__top">
              {faceUp && cards[0] ? (
                <GameCard
                  card={cards[0]}
                  faceUp={true}
                  size="small"
                  onHover={onCardHover}
                />
              ) : (
                <div className="game-card game-card--small game-card--face-down">
                  <div className="game-card__back">
                    <div className="game-card__back-design" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {count === 0 && (
          <div className="card-pile__empty" />
        )}
      </div>
      {showCount && (
        <div className="card-pile__count">{count}</div>
      )}
      <div className="card-pile__label">{label}</div>
    </div>
  );
};

export default GameCard;
