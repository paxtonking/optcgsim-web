import { useCardStore } from '../stores/cardStore';
import { CARD_COLORS, CARD_TYPES, COLOR_HEX, type CardColor } from '../types/card';

export function CardFilters() {
  const { filters, setFilter, resetFilters, getSets, setLeaderColors } = useCardStore();
  const sets = getSets();
  const hasLeaderColorFilter = filters.leaderColors.length > 0;

  const toggleArrayFilter = (
    key: 'colors' | 'types' | 'sets',
    value: string
  ) => {
    const current = filters[key];
    const newValue = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setFilter(key, newValue);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      {/* Leader color filter indicator */}
      {hasLeaderColorFilter && (
        <div className="bg-blue-900/40 border border-blue-700 rounded p-2 flex items-center justify-between">
          <div>
            <p className="text-blue-300 text-xs font-medium">Filtered by leader colors:</p>
            <div className="flex gap-1 mt-1">
              {filters.leaderColors.map(color => (
                <span
                  key={color}
                  className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: COLOR_HEX[color as CardColor] || '#6B7280' }}
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => setLeaderColors([])}
            className="text-blue-400 hover:text-blue-300 text-xs"
            title="Clear leader color filter"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Search
        </label>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Card name, ID, or effect..."
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Colors */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Colors
        </label>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map(color => (
            <button
              key={color}
              onClick={() => toggleArrayFilter('colors', color)}
              className={`
                px-3 py-1 rounded text-sm font-medium transition-all
                ${filters.colors.includes(color)
                  ? 'ring-2 ring-white'
                  : 'opacity-60 hover:opacity-100'}
              `}
              style={{ backgroundColor: COLOR_HEX[color as CardColor] }}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Types */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Card Type
        </label>
        <div className="flex flex-wrap gap-2">
          {CARD_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleArrayFilter('types', type)}
              className={`
                px-3 py-1 rounded text-sm font-medium transition-all
                ${filters.types.includes(type)
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
              `}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Cost Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Min Cost
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={filters.minCost ?? ''}
            onChange={(e) => setFilter('minCost', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Max Cost
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={filters.maxCost ?? ''}
            onChange={(e) => setFilter('maxCost', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Power Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Min Power
          </label>
          <input
            type="number"
            min="0"
            step="1000"
            value={filters.minPower ?? ''}
            onChange={(e) => setFilter('minPower', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Max Power
          </label>
          <input
            type="number"
            min="0"
            step="1000"
            value={filters.maxPower ?? ''}
            onChange={(e) => setFilter('maxPower', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Sets */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Sets
        </label>
        <select
          multiple
          value={filters.sets}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, opt => opt.value);
            setFilter('sets', selected);
          }}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500 h-32"
        >
          {sets.map(set => (
            <option key={set} value={set}>{set}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">Hold Ctrl/Cmd to select multiple</p>
      </div>

      {/* Reset Button */}
      <button
        onClick={resetFilters}
        className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
}
