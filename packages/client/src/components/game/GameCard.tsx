import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { GameCard as GameCardType, CardState, CardZone } from '@optcgsim/shared';
import { ClientCardDefinition } from '../../types/card';
import { resolveCardImageUrl } from '../../utils/cardImage';
import './GameBoard.css';

const KEYWORD_CONFIG: Record<string, { abbr: string; className: string }> = {
  'Rush': { abbr: 'R', className: 'game-card__keyword-badge--rush' },
  'Blocker': { abbr: 'B', className: 'game-card__keyword-badge--blocker' },
  'Double Attack': { abbr: 'DA', className: 'game-card__keyword-badge--double-attack' },
  'Banish': { abbr: 'BN', className: 'game-card__keyword-badge--banish' },
  'Unblockable': { abbr: 'UB', className: 'game-card__keyword-badge--unblockable' },
};

interface StatusBadgeConfig {
  abbr: string;
  label: string;
  color: string;
}

const STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  'CantPlayCards': { abbr: '\u2298', label: "Can't Play", color: 'rgba(231, 76, 60, 0.9)' },
  'CantPlayCharacters': { abbr: '\u2298C', label: "Can't Play Characters", color: 'rgba(231, 76, 60, 0.9)' },
  'DisableEffectDraws': { abbr: '\u2298D', label: 'Draws Disabled', color: 'rgba(149, 165, 166, 0.9)' },
  'NoOnPlays': { abbr: '\u2298P', label: 'No On Play', color: 'rgba(149, 165, 166, 0.9)' },
  'ImmuneEffects': { abbr: '\uD83D\uDEE1', label: 'Immune', color: 'rgba(46, 204, 113, 0.9)' },
  'DonEqualization': { abbr: 'EQ', label: 'DON Equalize', color: 'rgba(241, 196, 15, 0.9)' },
};

const DYNAMIC_BADGE_COLORS: Record<string, string> = {
  confusion: 'rgba(230, 126, 34, 0.9)',
  attribute: 'rgba(52, 152, 219, 0.9)',
  lostKeyword: 'rgba(192, 57, 43, 0.9)',
};

const STATUS_BADGE_BASE: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 3px',
  borderRadius: 2,
  color: 'white',
  fontWeight: 'bold',
  lineHeight: 1,
  textAlign: 'center',
};

const STATUS_BADGES_CONTAINER: React.CSSProperties = {
  position: 'absolute',
  bottom: 2,
  left: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  zIndex: 10,
};

interface GameCardProps {
  card: GameCardType;
  cardDef?: ClientCardDefinition;
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
  isDonInactive?: boolean;  // DON is attached but not providing power bonus (opponent's turn)
  attachedDonCount?: number; // Number of DON cards attached to this card
  showDonBonus?: boolean;   // Whether DON bonus applies (owner's turn) - for tooltip display
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
  isDonInactive = false,
  attachedDonCount = 0,
  showDonBonus = true,
  effectivePower,
  buffTotal = 0,
  size = 'normal',
  onHover,
  onClick,
  onDragStart,
  className = ''
}) => {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const isRested = card.state === CardState.RESTED;

  // Get image URL - use cardDef.imageUrl if available, proxy through our API
  const imageUrl = (isDon || card.cardId === 'DON')
    ? '/assets/cardbacks/CardFrontDon.png'
    : resolveCardImageUrl(card.cardId, cardDef?.imageUrl);

  // Preload image in background - keep showing old image until new one is ready
  useEffect(() => {
    if (!imageUrl) return;
    setImageError(false);
    const img = new Image();
    img.onload = () => setLoadedUrl(imageUrl);
    img.onerror = () => { setImageError(true); setLoadedUrl(null); };
    img.src = imageUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [imageUrl]);

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


  // Determine card color for border accent
  const cardColor = cardDef?.color || cardDef?.colors?.[0] || '';
  const colorClass = cardColor ? `game-card--color-${cardColor.toLowerCase().split(' ')[0]}` : '';

  // Build class names
  const classes = [
    'game-card',
    isDon ? 'game-card--don' : `game-card--${size}`,
    isRested && 'game-card--rested',
    card.state === 'ATTACHED' && 'game-card--attached',
    isPlayable && 'game-card--playable',
    isTarget && 'game-card--target',
    isDonTarget && 'game-card--don-target',
    isDonInactive && 'game-card--don-inactive',
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
    faceUp && colorClass,
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

  // Memoize keyword badge computation
  const keywordBadges = useMemo(() => {
    if (card.zone !== CardZone.FIELD && card.zone !== CardZone.LEADER) return null;
    const activeKeywords = new Set<string>();
    for (const kw of (card.keywords || [])) {
      if (kw in KEYWORD_CONFIG) activeKeywords.add(kw);
    }
    for (const kw of (card.temporaryKeywords || [])) {
      if (kw in KEYWORD_CONFIG) activeKeywords.add(kw);
    }
    for (const kw of (card.continuousKeywords || [])) {
      if (kw in KEYWORD_CONFIG) activeKeywords.add(kw);
    }
    for (const eff of (card.grantedEffects || [])) {
      if (eff.effectType === 'GRANT_KEYWORD' && eff.keyword && eff.keyword in KEYWORD_CONFIG) {
        activeKeywords.add(eff.keyword);
      }
    }
    if (activeKeywords.size === 0) return null;
    return Array.from(activeKeywords);
  }, [card.zone, card.keywords, card.temporaryKeywords, card.continuousKeywords, card.grantedEffects]);

  // Compute status effect badges for field/leader cards
  const statusBadges = useMemo(() => {
    if (card.zone !== CardZone.FIELD && card.zone !== CardZone.LEADER) return null;
    const activeStatuses: Array<{ key: string; abbr: string; label: string; color: string }> = [];

    // Check temporaryKeywords for status effects
    for (const kw of (card.temporaryKeywords || [])) {
      if (kw in STATUS_CONFIG) {
        const cfg = STATUS_CONFIG[kw];
        activeStatuses.push({ key: kw, ...cfg });
      }
      // Check for ConfusionTax pattern: "ConfusionTax:N"
      if (kw.startsWith('ConfusionTax:')) {
        const taxVal = kw.split(':')[1];
        activeStatuses.push({ key: kw, abbr: `T${taxVal}`, label: `Tax: Trash ${taxVal}`, color: DYNAMIC_BADGE_COLORS.confusion });
      }
      // Check for Attribute grants: "Attribute:Slash"
      if (kw.startsWith('Attribute:')) {
        const attr = kw.split(':')[1];
        activeStatuses.push({ key: kw, abbr: attr.charAt(0), label: attr, color: DYNAMIC_BADGE_COLORS.attribute });
      }
    }

    // Check restrictions array
    for (const r of (card.restrictions || [])) {
      if (r.type === 'LOSE_KEYWORD') {
        activeStatuses.push({ key: `lose-${r.keyword}`, abbr: `\u2715${(r.keyword || '')[0]}`, label: `Lost ${r.keyword}`, color: DYNAMIC_BADGE_COLORS.lostKeyword });
      }
      if (r.type === 'CONFUSION_TAX') {
        activeStatuses.push({ key: 'confusion-tax', abbr: `T${r.value || '?'}`, label: `Tax: ${r.value}`, color: DYNAMIC_BADGE_COLORS.confusion });
      }
    }

    if (activeStatuses.length === 0) return null;
    return activeStatuses;
  }, [card.zone, card.temporaryKeywords, card.restrictions]);

  return (
    <div
      className={classes}
      data-card-id={card.id}
      data-card-code={card.cardId}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      draggable={faceUp && !!onDragStart}
      onDragStart={handleDragStart}
    >
      {faceUp ? (
        <>
          {/* Card image - show last successfully loaded URL */}
          {!imageError && loadedUrl && (
            <img
              src={loadedUrl}
              alt={cardDef?.name || card.cardId}
              className="game-card__image game-card__image--loaded"
              draggable={false}
            />
          )}

          {/* Placeholder fallback when image fails or first load */}
          {(imageError || !loadedUrl) && (
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
          {(card.power || effectivePower) && faceUp && (() => {
            const donBonusValue = showDonBonus ? attachedDonCount * 1000 : 0;
            const hasPowerModifiers = buffTotal !== 0 || (attachedDonCount > 0 && showDonBonus);
            const tooltipLines = [
              `Base: ${card.basePower ?? card.power ?? 0}`,
              buffTotal !== 0 ? `Buff: ${buffTotal > 0 ? '+' : ''}${buffTotal}` : null,
              attachedDonCount > 0 ? (showDonBonus ? `DON: +${donBonusValue}` : `DON: +${attachedDonCount} (not active)`) : null
            ].filter(Boolean).join('\n');
            return (
              <div
                className={`game-card__power-badge ${
                  buffTotal > 0 ? 'game-card__power-badge--buffed' :
                  buffTotal < 0 ? 'game-card__power-badge--debuffed' : ''
                }`}
                title={hasPowerModifiers ? tooltipLines : undefined}
              >
                {effectivePower ?? card.power}
              </div>
            );
          })()}

          {/* DON count badge for attached DON on this card */}
          {attachedDonCount > 0 && (
            <div className="game-card__don-badge">+{attachedDonCount}</div>
          )}

          {/* Keyword badges for field/leader cards */}
          {keywordBadges && (
            <div className="game-card__keyword-badges" style={{ top: attachedDonCount > 0 ? 18 : 2 }}>
              {keywordBadges.map(kw => {
                const cfg = KEYWORD_CONFIG[kw];
                return (
                  <div
                    key={kw}
                    className={`game-card__keyword-badge ${cfg.className}`}
                    title={kw}
                  >
                    {cfg.abbr}
                  </div>
                );
              })}
            </div>
          )}

          {/* Status effect badges for field/leader cards */}
          {statusBadges && (
            <div className="game-card__status-badges" style={STATUS_BADGES_CONTAINER}>
              {statusBadges.map(status => (
                <div
                  key={status.key}
                  className="game-card__status-badge"
                  style={{ ...STATUS_BADGE_BASE, background: status.color }}
                  title={status.label}
                >
                  {status.abbr}
                </div>
              ))}
            </div>
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
  cardDefinitions?: Map<string, ClientCardDefinition>; // For showing proper card images when faceUp
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
                  key={topCard.id}
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
