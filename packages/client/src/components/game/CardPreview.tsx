import React, { useState, useEffect } from 'react';
import { GameCard as GameCardType } from '@optcgsim/shared';
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
  attribute?: string | null;
  effect?: string | null;
  trigger?: string | null;
  imageUrl?: string;
}

interface CardPreviewProps {
  card: GameCardType | null;
  cardDef?: CardDefinition;
  isHidden?: boolean;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  cardDef,
  isHidden = false
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

  // Get image URL - use cardDef.imageUrl if available
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

  // Get color for display and placeholder
  const getColor = () => {
    const color = cardDef?.colors?.[0] || cardDef?.color;
    return color || '';
  };

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
              backgroundColor: getColorHex(getColor()),
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
              {card.power || cardDef?.power || '?'}
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
          {cardType} {getColor() && `- ${getColor()}`}
        </div>

        <div className="card-preview__stats">
          {cardDef?.cost != null && (
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">{cardDef.cost}</span>
              <span className="card-preview__stat-label">Cost</span>
            </div>
          )}
          {(card.power || cardDef?.power) && (
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">{card.power || cardDef?.power}</span>
              <span className="card-preview__stat-label">Power</span>
            </div>
          )}
          {cardDef?.counter && (
            <div className="card-preview__stat">
              <span className="card-preview__stat-value">+{cardDef.counter}</span>
              <span className="card-preview__stat-label">Counter</span>
            </div>
          )}
        </div>

        {cardDef?.effect && (
          <div className="card-preview__effect">{cardDef.effect}</div>
        )}

        {cardDef?.trigger && (
          <div className="card-preview__effect" style={{ marginTop: '8px' }}>
            <strong>Trigger: </strong>{cardDef.trigger}
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
