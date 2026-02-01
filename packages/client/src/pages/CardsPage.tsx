import { useEffect, useState, useMemo } from 'react';
import { FormattedEffect } from '../components/common/FormattedEffect';
import { useCardStore } from '../stores/cardStore';
import type { Card } from '../types/card';

const COLORS = ['RED', 'GREEN', 'BLUE', 'PURPLE', 'BLACK', 'YELLOW'];
const TYPES = ['LEADER', 'CHARACTER', 'EVENT', 'STAGE'];
const RARITIES = ['L', 'SR', 'R', 'UC', 'C', 'SEC', 'SP', 'P'];

// Helper to convert direct imageUrl to proxied URL via backend
function getProxyImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return '/images/card-back.png';
  const apiBase = import.meta.env.VITE_API_URL || '';
  const filename = imageUrl.split('/').pop();
  if (imageUrl.includes('onepiece-cardgame.com')) {
    return `${apiBase}/api/images/official/${filename}`;
  }
  return `${apiBase}/api/images/cards/${filename}`;
}

export default function CardsPage() {
  // Use shared card store for caching
  const { cards, isLoading, error, loadCards } = useCardStore();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<string>('');
  const [minCost, setMinCost] = useState<string>('');
  const [maxCost, setMaxCost] = useState<string>('');
  const [minPower, setMinPower] = useState<string>('');
  const [maxPower, setMaxPower] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(1);
  const [cardsPerPage] = useState(48);

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Get unique sets
  const sets = useMemo(() => {
    const setMap = new Map<string, string>();
    cards.forEach((card) => {
      if (!setMap.has(card.setCode)) {
        setMap.set(card.setCode, card.setName);
      }
    });
    return Array.from(setMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, name]) => ({ code, name }));
  }, [cards]);

  // Filter cards
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      // Search filter
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Set filter
      if (selectedSet && card.setCode !== selectedSet) {
        return false;
      }

      // Color filter
      if (selectedColor && !card.colors.some((c) => c.includes(selectedColor))) {
        return false;
      }

      // Type filter
      if (selectedType && card.type !== selectedType) {
        return false;
      }

      // Rarity filter
      if (selectedRarity && card.rarity !== selectedRarity) {
        return false;
      }

      // Cost filter
      if (minCost && (card.cost === null || card.cost < parseInt(minCost))) {
        return false;
      }
      if (maxCost && (card.cost === null || card.cost > parseInt(maxCost))) {
        return false;
      }

      // Power filter
      if (minPower && (card.power === null || card.power < parseInt(minPower))) {
        return false;
      }
      if (maxPower && (card.power === null || card.power > parseInt(maxPower))) {
        return false;
      }

      return true;
    });
  }, [cards, search, selectedSet, selectedColor, selectedType, selectedRarity, minCost, maxCost, minPower, maxPower]);

  // Paginated cards
  const paginatedCards = useMemo(() => {
    const start = (page - 1) * cardsPerPage;
    return filteredCards.slice(start, start + cardsPerPage);
  }, [filteredCards, page, cardsPerPage]);

  const totalPages = Math.ceil(filteredCards.length / cardsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedSet, selectedColor, selectedType, selectedRarity, minCost, maxCost, minPower, maxPower]);

  const clearFilters = () => {
    setSearch('');
    setSelectedSet('');
    setSelectedColor('');
    setSelectedType('');
    setSelectedRarity('');
    setMinCost('');
    setMaxCost('');
    setMinPower('');
    setMaxPower('');
  };

  const getColorClass = (color: string) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-red-600',
      GREEN: 'bg-green-600',
      BLUE: 'bg-blue-600',
      PURPLE: 'bg-purple-600',
      BLACK: 'bg-gray-800',
      YELLOW: 'bg-yellow-500',
    };
    return colorMap[color] || 'bg-gray-600';
  };

  const getRarityClass = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      L: 'text-yellow-400',
      SR: 'text-purple-400',
      R: 'text-blue-400',
      UC: 'text-green-400',
      C: 'text-gray-400',
      SEC: 'text-red-400',
      SP: 'text-pink-400',
      P: 'text-orange-400',
    };
    return rarityMap[rarity] || 'text-gray-400';
  };

  // Split combined colors like "GREEN RED" into separate colors
  const splitColors = (colors: string[]): string[] => {
    const result: string[] = [];
    for (const color of colors) {
      if (color.includes(' ')) {
        result.push(...color.split(' ').filter(c => c.trim()));
      } else {
        result.push(color);
      }
    }
    return result;
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-8">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Card Database</h1>
        <p className="text-gray-400">{cards.length.toLocaleString()} cards</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by card name..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Set */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Set</label>
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Sets</option>
              {sets.map((set) => (
                <option key={set.code} value={set.code}>
                  {set.code} - {set.name}
                </option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Color</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Colors</option>
              {COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Types</option>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Rarity */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Rarity</label>
            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Rarities</option>
              {RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </div>

          {/* Cost Range */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cost</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={minCost}
                onChange={(e) => setMinCost(e.target.value)}
                placeholder="Min"
                min="0"
                max="10"
                className="w-1/2 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="number"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder="Max"
                min="0"
                max="10"
                className="w-1/2 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Power Range */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Power</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={minPower}
                onChange={(e) => setMinPower(e.target.value)}
                placeholder="Min"
                step="1000"
                className="w-1/2 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="number"
                value={maxPower}
                onChange={(e) => setMaxPower(e.target.value)}
                placeholder="Max"
                step="1000"
                className="w-1/2 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Filter Actions */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
          <p className="text-gray-400">
            Showing {filteredCards.length.toLocaleString()} of {cards.length.toLocaleString()} cards
          </p>
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Clear Filters
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              {viewMode === 'grid' ? 'List View' : 'Grid View'}
            </button>
          </div>
        </div>
      </div>

      {/* Cards Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {paginatedCards.map((card) => (
            <div
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-red-500 transition-all"
            >
              <div className="aspect-[5/7] relative">
                <img
                  src={getProxyImageUrl(card.imageUrl)}
                  alt={card.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/images/card-back.png';
                  }}
                />
                <div className="absolute top-1 left-1">
                  <span className={`text-xs font-bold ${getRarityClass(card.rarity)}`}>
                    {card.rarity}
                  </span>
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs text-gray-400 truncate">{card.id}</p>
                <p className="text-sm font-medium truncate">{card.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  {splitColors(card.colors).map((color, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full ${getColorClass(color)}`}
                      title={color}
                    />
                  ))}
                  {card.cost !== null && (
                    <span className="text-xs text-gray-400 ml-auto">{card.cost}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-900">
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Color</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Power</th>
                <th className="p-3">Rarity</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCards.map((card) => (
                <tr
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer"
                >
                  <td className="p-3 font-mono text-sm">{card.id}</td>
                  <td className="p-3">{card.name}</td>
                  <td className="p-3 text-gray-400">{card.type}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {splitColors(card.colors).map((color, i) => (
                        <div
                          key={i}
                          className={`w-4 h-4 rounded-full ${getColorClass(color)}`}
                          title={color}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="p-3">{card.cost ?? '-'}</td>
                  <td className="p-3">{card.power?.toLocaleString() ?? '-'}</td>
                  <td className={`p-3 font-medium ${getRarityClass(card.rarity)}`}>{card.rarity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-4 py-2 text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row">
              {/* Card Image */}
              <div className="md:w-1/2 p-4">
                <img
                  src={getProxyImageUrl(selectedCard.imageUrl)}
                  alt={selectedCard.name}
                  className="w-full rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/images/card-back.png';
                  }}
                />
              </div>

              {/* Card Details */}
              <div className="md:w-1/2 p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-gray-400 text-sm">{selectedCard.id}</p>
                    <h2 className="text-2xl font-bold">{selectedCard.name}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    &times;
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Set:</span>
                    <span>
                      {selectedCard.setCode} - {selectedCard.setName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type:</span>
                    <span>{selectedCard.type}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Color:</span>
                    <div className="flex gap-1">
                      {splitColors(selectedCard.colors).map((color, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <div className={`w-4 h-4 rounded-full ${getColorClass(color)}`} />
                          <span className="text-sm">{color}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Rarity:</span>
                    <span className={getRarityClass(selectedCard.rarity)}>{selectedCard.rarity}</span>
                  </div>
                  {selectedCard.cost !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cost:</span>
                      <span>{selectedCard.cost}</span>
                    </div>
                  )}
                  {selectedCard.power !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Power:</span>
                      <span>{selectedCard.power.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedCard.counter !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Counter:</span>
                      <span>+{selectedCard.counter}</span>
                    </div>
                  )}
                  {selectedCard.life != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Life:</span>
                      <span>{selectedCard.life}</span>
                    </div>
                  )}
                  {selectedCard.attribute && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Attribute:</span>
                      <span>{selectedCard.attribute}</span>
                    </div>
                  )}
                  {selectedCard.traits && selectedCard.traits.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700 text-center">
                      <p className="text-white font-bold">{selectedCard.traits.join(' / ')}</p>
                      <p className="text-gray-500 text-xs uppercase mt-1">Traits</p>
                    </div>
                  )}
                </div>

                {/* Effect & Trigger - Formatted Display */}
                {(selectedCard.effect || selectedCard.trigger) && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <FormattedEffect
                      effect={selectedCard.effect}
                      trigger={selectedCard.trigger}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
