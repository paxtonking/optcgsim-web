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
  isDonTarget?: boolean;    // Valid target for DON attachment (yellow glow)
  isSelected?: boolean;
  isAttacking?: boolean;
  isAttackEffectTarget?: boolean;    // Valid target for ON_ATTACK effect (purple glow)
  isAttackEffectSelected?: boolean;  // Currently selected for ON_ATTACK effect (gold glow)
  isPlayEffectTarget?: boolean;      // Valid target for ON_PLAY effect (blue glow)
  isPlayEffectSelected?: boolean;    // Currently selected for ON_PLAY effect (gold glow)
  isEventEffectTarget?: boolean;     // Valid target for event [Main] effect (orange glow)
  isEventEffectSelected?: boolean;   // Currently selected for event effect (gold glow)
  isCounterEffectTarget?: boolean;   // Valid target for counter effect (cyan glow)
  isCounterEffectSelected?: boolean; // Currently selected for counter effect (gold glow)
  hasCostModified?: boolean;         // Has modified cost from stage effects (gold glow)
  hasActiveEffect?: boolean;         // Stage providing active continuous effect (purple pulse)
  isDon?: boolean;          // This is a DON card (smaller size, different styling)
  attachedDonCount?: number; // Number of DON cards attached to this card
  effectivePower?: number;  // Calculated power including buffs and DON
  buffTotal?: number;       // Total buff amount (positive or negative)
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
  isDonTarget = false,
  isSelected = false,
  isAttacking = false,
  isAttackEffectTarget = false,
  isAttackEffectSelected = false,
  isPlayEffectTarget = false,
  isPlayEffectSelected = false,
  isEventEffectTarget = false,
  isEventEffectSelected = false,
  isCounterEffectTarget = false,
  isCounterEffectSelected = false,
  hasCostModified = false,
  hasActiveEffect = false,
  isDon = false,
  attachedDonCount = 0,
  effectivePower,
  buffTotal = 0,
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
    // DON cards use local image
    if (isDon || card.cardId === 'DON') {
      return '/assets/cardbacks/CardFrontDon.png';
    }
    // Use API URL from environment if set (for production where frontend and backend are separate)
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (cardDef?.imageUrl) {
      const filename = cardDef.imageUrl.split('/').pop();
      // Use different proxy based on the source domain
      if (cardDef.imageUrl.includes('onepiece-cardgame.com')) {
        return `${apiBase}/api/images/official/${filename}`;
      }
      return `${apiBase}/api/images/cards/${filename}`;
    }
    return `${apiBase}/api/images/cards/${card.cardId}.png`;
  };
  const imageUrl = getImageUrl();

  const handleMouseEnter = useCallback(() => {
    onHover?.(card);
  }, [card, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Only stop propagation if we have an onClick handler
    // Otherwise let the click bubble up to parent (e.g., combat modal wrapper)
    if (onClick) {
      e.stopPropagation();
      onClick(card);
    }
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
    isDon ? 'game-card--don' : `game-card--${size}`,
    isRested && 'game-card--rested',
    card.state === 'ATTACHED' && 'game-card--attached',
    isPlayable && 'game-card--playable',
    isTarget && 'game-card--target',
    isDonTarget && 'game-card--don-target',
    isSelected && 'game-card--selected',
    isAttacking && 'game-card--attacking',
    isAttackEffectTarget && 'game-card--attack-effect-target',
    isAttackEffectSelected && 'game-card--attack-effect-selected',
    isPlayEffectTarget && 'game-card--play-effect-target',
    isPlayEffectSelected && 'game-card--play-effect-selected',
    isEventEffectTarget && 'game-card--event-effect-target',
    isEventEffectSelected && 'game-card--event-effect-selected',
    isCounterEffectTarget && 'game-card--counter-effect-target',
    isCounterEffectSelected && 'game-card--counter-effect-selected',
    hasCostModified && 'game-card--cost-modified',
    hasActiveEffect && 'game-card--active-effect',
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
          {(card.power || effectivePower) && faceUp && (
            <div
              className={`game-card__power-badge ${
                buffTotal > 0 ? 'game-card__power-badge--buffed' :
                buffTotal < 0 ? 'game-card__power-badge--debuffed' : ''
              }`}
              title={buffTotal !== 0 ? `Base: ${card.basePower ?? card.power ?? 0}\nBuff: ${buffTotal > 0 ? '+' : ''}${buffTotal}\nDON: +${attachedDonCount * 1000}` : undefined}
            >
              {effectivePower ?? card.power}
            </div>
          )}

          {/* DON count badge for attached DON on this card */}
          {attachedDonCount > 0 && (
            <div className="game-card__don-badge">+{attachedDonCount}</div>
          )}
        </>
      ) : (
        // Card back
        <div className="game-card__back">
          <img
            src={isDon ? "/assets/cardbacks/CardBackDon.png" : "/assets/cardbacks/CardBackRegular.png"}
            alt={isDon ? "DON card back" : "Card back"}
            className="game-card__back-image"
          />
        </div>
      )}

      {/* Selection/target ring */}
      {(isPlayable || isTarget || isSelected || isDonTarget) && (
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
  showLastCard?: boolean; // Show last card in array instead of first (for trash pile)
  onClick?: () => void;
  onCardHover?: (card: GameCardType | null) => void;
  cardDefinitions?: Map<string, CardDefinition>; // For showing proper card images when faceUp
  size?: 'small' | 'normal' | 'large';
}

export const CardPile: React.FC<CardPileProps> = ({
  cards,
  label,
  showCount = true,
  faceUp = false,
  showLastCard = false,
  onClick,
  onCardHover,
  cardDefinitions,
  size = 'normal'
}) => {
  const count = cards.length;
  const topCard = showLastCard ? cards[count - 1] : cards[0];
  const topCardDef = topCard && cardDefinitions ? cardDefinitions.get(topCard.cardId) : undefined;

  const pileClasses = ['card-pile', `card-pile--${size}`].join(' ');

  return (
    <div className={pileClasses} onClick={onClick}>
      <div className="card-pile__stack">
        {/* Show stacked effect */}
        {count > 0 && (
          <>
            {count > 2 && <div className="card-pile__layer card-pile__layer--3" />}
            {count > 1 && <div className="card-pile__layer card-pile__layer--2" />}
            <div className="card-pile__top">
              {faceUp && topCard ? (
                <GameCard
                  card={{ ...topCard, state: CardState.ACTIVE }}
                  cardDef={topCardDef}
                  faceUp={true}
                  size={size}
                  onHover={onCardHover}
                />
              ) : (
                <div className={`game-card game-card--${size} game-card--face-down`}>
                  <div className="game-card__back">
                    <img
                      src="/assets/cardbacks/CardBackRegular.png"
                      alt="Card back"
                      className="game-card__back-image"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {count === 0 && (
          <div className={`card-pile__empty card-pile__empty--${size}`} />
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
