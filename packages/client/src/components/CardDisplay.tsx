import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../types/card';
import { COLOR_HEX, type CardColor } from '../types/card';

interface CardDisplayProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  showCount?: number;
  onClick?: () => void;
  onRightClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}

export function CardDisplay({
  card,
  size = 'md',
  showCount,
  onClick,
  onRightClick,
  disabled = false,
  selected = false,
}: CardDisplayProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const sizeClasses = {
    sm: 'w-24 h-32',
    md: 'w-40 h-56',
    lg: 'w-48 h-64',
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onRightClick?.();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Calculate preview position to keep it on screen
  const getPreviewPosition = () => {
    const previewWidth = 640; // approximate width of CardPreview
    const previewHeight = 720; // approximate height of CardPreview
    const offset = 20; // offset from cursor

    let x = mousePos.x + offset;
    let y = mousePos.y - previewHeight / 2;

    // Check right edge - if preview would go off screen, show on left of cursor
    if (x + previewWidth > window.innerWidth) {
      x = mousePos.x - previewWidth - offset;
    }

    // Check bottom edge
    if (y + previewHeight > window.innerHeight) {
      y = window.innerHeight - previewHeight - 10;
    }

    // Check top edge
    if (y < 10) {
      y = 10;
    }

    return { x, y };
  };

  const colorBorder = card.colors.length > 0
    ? COLOR_HEX[card.colors[0] as CardColor] || '#6B7280'
    : '#6B7280';

  const previewPos = getPreviewPosition();

  return (
    <div
      className={`
        relative rounded-lg overflow-hidden cursor-pointer transition-all
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:z-10'}
        ${selected ? 'ring-2 ring-yellow-400' : ''}
      `}
      style={{ borderColor: colorBorder, borderWidth: '2px' }}
      onClick={() => onClick?.()}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
    >
      {!imageError ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center p-1 text-center">
          <span className="text-xs text-gray-400 truncate w-full">{card.id}</span>
          <span className="text-xs text-white truncate w-full">{card.name}</span>
        </div>
      )}

      {/* Count badge */}
      {showCount !== undefined && showCount > 0 && (
        <div className="absolute top-1 right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {showCount}
        </div>
      )}

      {/* Cost badge */}
      {card.cost !== null && (
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs font-bold rounded px-1">
          {card.cost}
        </div>
      )}

      {/* Power badge */}
      {card.power !== null && (
        <div className="absolute bottom-1 right-1 bg-black/70 text-yellow-400 text-xs font-bold rounded px-1">
          {card.power}
        </div>
      )}

      {/* Hover preview - rendered via portal to avoid clipping */}
      {isHovered && size !== 'lg' && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            left: previewPos.x,
            top: previewPos.y,
            zIndex: 9999,
          }}
        >
          <CardPreview card={card} />
        </div>,
        document.body
      )}
    </div>
  );
}

interface CardPreviewProps {
  card: Card;
}

export function CardPreview({ card }: CardPreviewProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700 p-6 max-w-2xl">
      <div className="flex gap-6">
        {!imageError ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-72 h-[400px] object-cover rounded-lg"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-72 h-[400px] bg-gray-800 rounded-lg flex items-center justify-center">
            <span className="text-gray-500 text-lg">{card.id}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-lg">{card.name}</h3>
          <p className="text-gray-400 text-sm">{card.id}</p>
          <p className="text-gray-400 text-sm">{card.setName}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {card.colors.map(color => (
              <span
                key={color}
                className="px-2.5 py-1 rounded text-sm font-medium text-white"
                style={{ backgroundColor: COLOR_HEX[color as CardColor] || '#6B7280' }}
              >
                {color}
              </span>
            ))}
            <span className="px-2.5 py-1 rounded text-sm font-medium bg-gray-700 text-gray-300">
              {card.type}
            </span>
          </div>

          <div className="mt-4 text-base text-gray-300 space-y-1">
            {card.cost !== null && <p>Cost: {card.cost}</p>}
            {card.power !== null && <p>Power: {card.power}</p>}
            {card.counter !== null && <p>Counter: +{card.counter}</p>}
            {card.attribute && <p>Attribute: {card.attribute}</p>}
          </div>
        </div>
      </div>

      {card.effect && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-base text-gray-300 whitespace-pre-wrap leading-relaxed">{card.effect}</p>
        </div>
      )}

      {card.trigger && (
        <div className="mt-3">
          <p className="text-base text-purple-400">
            <span className="font-bold">Trigger:</span> {card.trigger}
          </p>
        </div>
      )}
    </div>
  );
}
