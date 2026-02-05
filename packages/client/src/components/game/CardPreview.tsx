import React, { useState, useEffect } from 'react';
import { GameCard as GameCardType } from '@optcgsim/shared';
import { FormattedEffect } from '../common/FormattedEffect';
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
  life?: number | null;
  attribute?: string | null;
  effect?: string | null;
  trigger?: string | null;
  traits?: string[];
  imageUrl?: string;
}

interface ActivateAbilityInfo {
  canActivate: boolean;
  reason?: string;
  effectDescription?: string;
}

interface ActivationModeInfo {
  step: 'select-don' | 'select-target';
}

interface PlayEffectInfo {
  description: string;
  instruction: string;
}

interface CardPreviewProps {
  card: GameCardType | null;
  cardDef?: CardDefinition;
  isHidden?: boolean;
  attachedDonCount?: number;  // Number of DON cards attached (for power calculation)
  showDonBonus?: boolean;     // Whether DON bonus applies (only on card owner's turn)
  combatBuffPower?: number;   // Power from combat effects (e.g., Guard Point +3000)
  activateInfo?: ActivateAbilityInfo;
  onActivateAbility?: () => void;
  activationMode?: ActivationModeInfo | null;
  onCancelActivation?: () => void;
  onSkipActivation?: () => void;  // For "up to" abilities - skip without selecting
  playEffectInfo?: PlayEffectInfo | null;  // For ON_PLAY effects like ATTACH_DON
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  cardDef,
  isHidden = false,
  attachedDonCount = 0,
  showDonBonus = true,
  combatBuffPower = 0,
  activateInfo,
  onActivateAbility,
  activationMode,
  onCancelActivation,
  onSkipActivation,
  playEffectInfo
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset error state when card changes
  useEffect(() => {
    setImageError(false);
  }, [card?.id]);

  if (!card) {
    return (
      <div className="card-preview">
        <div className="card-preview__image-container">
          <div className="card-preview__placeholder">
            Hover over a card to preview
          </div>
        </div>
      </div>
    );
  }

  if (isHidden) {
    return (
      <div className="card-preview">
        <div className="card-preview__image-container">
          <div className="card-preview__placeholder card-preview__hidden">
            Hidden Card
          </div>
        </div>
        <div className="card-preview__info">
          <div className="card-preview__name card-preview__hidden">???</div>
        </div>
      </div>
    );
  }

  // Special handling for DON cards
  const isDonCard = card.cardId === 'DON' || card.zone === 'DON_FIELD' || card.zone === 'DON_DECK';

  if (isDonCard) {
    return (
      <div className="card-preview">
        <div className="card-preview__image-container">
          <img
            src="/assets/cardbacks/CardFrontDon.png"
            alt="DON!!"
            className="card-preview__image"
          />
        </div>
        <div className="card-preview__info">
          <div className="card-preview__name">DON!!</div>
          <div className="card-preview__type">DON Card</div>
          <div className="card-preview__stats">
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">+1000</span>
              <span className="card-preview__stat-label">Power</span>
            </div>
          </div>
          <div className="card-preview__effect">
            Attach to your Leader or Characters to give them +1000 power for each DON!! attached. Can also be used to pay costs for playing cards and activating effects.
          </div>
        </div>
      </div>
    );
  }

  // Get image URL - use cardDef.imageUrl if available
  const getImageUrl = () => {
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

  // Get all colors for display (handles "GREEN RED" format and splits into separate colors)
  const getColors = (): string[] => {
    const rawColors: string[] = [];

    if (cardDef?.colors && cardDef.colors.length > 0) {
      rawColors.push(...cardDef.colors);
    } else if (cardDef?.color) {
      rawColors.push(cardDef.color);
    }

    // Split any combined colors like "GREEN RED" into separate entries
    const splitColors: string[] = [];
    for (const color of rawColors) {
      if (color.includes(' ')) {
        splitColors.push(...color.split(' ').filter(c => c.trim()));
      } else {
        splitColors.push(color);
      }
    }

    return splitColors;
  };

  const colors = getColors();
  const cardType = cardDef?.type || cardDef?.cardType || 'CARD';

  return (
    <div className="card-preview">
      <div className="card-preview__image-container">
        {!imageError ? (
          <img
            src={imageUrl}
            alt={cardDef?.name || card.cardId}
            className="card-preview__image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className="card-preview__placeholder"
            style={{
              backgroundColor: getColorHex(colors[0]),
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
              {cardType}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
              {card.basePower || card.power || cardDef?.power || '?'}
            </div>
            <div style={{ fontSize: '14px', textAlign: 'center' }}>
              {cardDef?.name || card.cardId}
            </div>
          </div>
        )}
      </div>

      <div className="card-preview__info">
        <div className="card-preview__name">{cardDef?.name || card.cardId}</div>
        <div className="card-preview__type">
          {cardType}
          {colors.length > 0 && (
            <span className="card-preview__colors">
              {colors.map((color, i) => (
                <span
                  key={i}
                  className="card-preview__color-dot"
                  style={{ backgroundColor: getColorHex(color) }}
                  title={color}
                />
              ))}
            </span>
          )}
        </div>

        <div className="card-preview__stats">
          {cardDef?.cost != null && (
            <div className="card-preview__stat">
              <span className={`card-preview__stat-value ${card.modifiedCost !== undefined ? 'card-preview__stat-value--modified' : ''}`}>
                {card.modifiedCost !== undefined ? card.modifiedCost : cardDef.cost}
              </span>
              <span className="card-preview__stat-label">Cost</span>
            </div>
          )}
          {(card.basePower != null || card.power != null || cardDef?.power != null) && (() => {
            const basePower = card.basePower ?? card.power ?? cardDef?.power ?? 0;
            // Only add DON bonus if it's the card owner's turn
            const donBonus = showDonBonus ? (attachedDonCount * 1000) : 0;
            const totalPower = basePower + donBonus + combatBuffPower;
            const hasDonBonus = showDonBonus && attachedDonCount > 0;
            const hasCombatBuff = combatBuffPower > 0;
            return (
              <div className={`card-preview__stat ${hasDonBonus ? 'card-preview__stat--don-boosted' : ''} ${hasCombatBuff ? 'card-preview__stat--combat-buffed' : ''}`}>
                <span className="card-preview__stat-value">{totalPower}</span>
                <span className="card-preview__stat-label">Power{hasCombatBuff && ` (+${combatBuffPower})`}</span>
              </div>
            );
          })()}
          {cardDef?.counter && (
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">+{cardDef.counter}</span>
              <span className="card-preview__stat-label">Counter</span>
            </div>
          )}
          {cardDef?.life != null && (
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">{cardDef.life}</span>
              <span className="card-preview__stat-label">Life</span>
            </div>
          )}
        </div>

        {cardDef?.traits && cardDef.traits.length > 0 && (
          <div className="card-preview__traits">
            <span className="card-preview__traits-value">{cardDef.traits.join(' / ')}</span>
            <span className="card-preview__traits-label">Traits</span>
          </div>
        )}

        {/* Formatted Effect Display */}
        {cardDef?.effect && (
          <div className="card-preview__effect-container">
            <FormattedEffect
              effect={cardDef.effect}
              trigger={cardDef.trigger}
              compact={true}
            />
          </div>
        )}

        {/* Play Effect Info - for ON_PLAY effects like ATTACH_DON */}
        {playEffectInfo && (
          <div className="card-preview__play-effect">
            <div className="card-preview__play-effect-header">
              <span className="card-preview__play-effect-icon">&#11088;</span>
              <span className="card-preview__play-effect-title">On Play</span>
            </div>
            <p className="card-preview__play-effect-description">
              {playEffectInfo.description}
            </p>
            <p className="card-preview__play-effect-instruction">
              {playEffectInfo.instruction}
            </p>
          </div>
        )}

        {/* Activation mode UI - show instructions and cancel/skip buttons */}
        {activationMode && onCancelActivation && (
          <div className="card-preview__activate">
            <div className="card-preview__activate-instruction">
              {activationMode.step === 'select-don'
                ? 'Select a rested DON card (or Skip)'
                : 'Select a target (Leader or Character)'}
            </div>
            <div className="card-preview__activate-buttons">
              {activationMode.step === 'select-don' && onSkipActivation && (
                <button
                  className="card-preview__activate-btn card-preview__activate-btn--skip"
                  onClick={onSkipActivation}
                >
                  Skip
                </button>
              )}
              <button
                className="card-preview__activate-btn card-preview__activate-btn--cancel"
                onClick={onCancelActivation}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Activate Ability button - only show when not in activation mode */}
        {!activationMode && activateInfo && onActivateAbility && (
          <div className="card-preview__activate">
            <button
              className={`card-preview__activate-btn ${activateInfo.canActivate ? 'card-preview__activate-btn--active' : 'card-preview__activate-btn--disabled'}`}
              onClick={onActivateAbility}
              disabled={!activateInfo.canActivate}
              title={activateInfo.reason || 'Activate ability'}
            >
              Activate Ability
            </button>
            {!activateInfo.canActivate && activateInfo.reason && (
              <span className="card-preview__activate-reason">{activateInfo.reason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function getColorHex(color?: string): string {
  if (!color) return '#444';
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
  // Handle multi-color like "GREEN RED"
  const firstColor = color.split(' ')[0];
  return colorMap[firstColor] || '#444';
}

export default CardPreview;
