import { useState } from 'react';
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

  const sizeClasses = {
    sm: 'w-16 h-22',
    md: 'w-24 h-33',
    lg: 'w-32 h-44',
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onRightClick?.();
  };

  const colorBorder = card.colors.length > 0
    ? COLOR_HEX[card.colors[0] as CardColor] || '#6B7280'
    : '#6B7280';

  return (
    <div
      className={`
        relative rounded-lg overflow-hidden cursor-pointer transition-all
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:z-10'}
        ${selected ? 'ring-2 ring-yellow-400' : ''}
      `}
      style={{ borderColor: colorBorder, borderWidth: '2px' }}
      onClick={disabled ? undefined : onClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      {/* Hover preview */}
      {isHovered && size !== 'lg' && (
        <div className="fixed z-50 pointer-events-none" style={{ top: '50%', left: '60%', transform: 'translate(-50%, -50%)' }}>
          <CardPreview card={card} />
        </div>
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
    <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700 p-4 max-w-xs">
      <div className="flex gap-4">
        {!imageError ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-32 h-44 object-cover rounded"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-32 h-44 bg-gray-800 rounded flex items-center justify-center">
            <span className="text-gray-500 text-sm">{card.id}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm truncate">{card.name}</h3>
          <p className="text-gray-400 text-xs">{card.id}</p>
          <p className="text-gray-400 text-xs">{card.setName}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {card.colors.map(color => (
              <span
                key={color}
                className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: COLOR_HEX[color as CardColor] || '#6B7280' }}
              >
                {color}
              </span>
            ))}
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">
              {card.type}
            </span>
          </div>

          <div className="mt-2 text-xs text-gray-300 space-y-1">
            {card.cost !== null && <p>Cost: {card.cost}</p>}
            {card.power !== null && <p>Power: {card.power}</p>}
            {card.counter !== null && <p>Counter: +{card.counter}</p>}
            {card.attribute && <p>Attribute: {card.attribute}</p>}
          </div>
        </div>
      </div>

      {card.effect && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-300 whitespace-pre-wrap">{card.effect}</p>
        </div>
      )}

      {card.trigger && (
        <div className="mt-2">
          <p className="text-xs text-purple-400">
            <span className="font-bold">Trigger:</span> {card.trigger}
          </p>
        </div>
      )}
    </div>
  );
}
