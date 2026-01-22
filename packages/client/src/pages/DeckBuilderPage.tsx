import { useEffect, useState, useMemo } from 'react';
import { useCardStore } from '../stores/cardStore';
import { useDeckStore } from '../stores/deckStore';
import { CardDisplay } from '../components/CardDisplay';
import { CardFilters } from '../components/CardFilters';
import { DeckPanel } from '../components/DeckPanel';

const CARDS_PER_PAGE = 50;

export default function DeckBuilderPage() {
  const { cards, isLoading, error, loadCards, getFilteredCards, filters } = useCardStore();
  const { currentDeck, addCard, setLeader, getCardCount } = useDeckStore();
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  const filteredCards = useMemo(() => getFilteredCards(), [cards, filters]);

  const paginatedCards = useMemo(() => {
    const start = page * CARDS_PER_PAGE;
    return filteredCards.slice(start, start + CARDS_PER_PAGE);
  }, [filteredCards, page]);

  const totalPages = Math.ceil(filteredCards.length / CARDS_PER_PAGE);

  const handleCardClick = (card: typeof cards[0]) => {
    if (!currentDeck) {
      alert('Please create or select a deck first');
      return;
    }

    if (card.type === 'LEADER') {
      setLeader(card);
    } else {
      const countInDeck = getCardCount(card.id);
      const totalCards = currentDeck.cards.reduce((s, c) => s + c.count, 0);

      if (countInDeck >= 4) {
        alert(`Cannot add more than 4 copies of ${card.name}`);
        return;
      }

      if (totalCards >= 50) {
        alert('Deck is full (50 cards maximum)');
        return;
      }

      addCard(card);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading cards...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500 text-xl mb-4">Failed to load cards</p>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={() => loadCards()}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Left sidebar - Filters */}
      <div className={`${showFilters ? 'w-64' : 'w-0'} transition-all overflow-hidden bg-gray-900`}>
        <div className="w-64 h-full overflow-y-auto p-4">
          <CardFilters />
        </div>
      </div>

      {/* Toggle filters button */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="absolute left-0 top-1/2 -translate-y-1/2 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-r z-10"
        style={{ left: showFilters ? '256px' : '0' }}
      >
        {showFilters ? '◀' : '▶'}
      </button>

      {/* Main content - Card grid */}
      <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 p-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Deck Builder</h1>
            <p className="text-sm text-gray-400">
              Showing {paginatedCards.length} of {filteredCards.length} cards
              {cards.length !== filteredCards.length && ` (${cards.length} total)`}
            </p>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-gray-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {paginatedCards.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No cards match your filters</p>
              <button
                onClick={() => useCardStore.getState().resetFilters()}
                className="mt-4 text-red-500 hover:text-red-400"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-4">
              {paginatedCards.map(card => {
                const countInDeck = getCardCount(card.id);
                const isLeader = currentDeck?.leader?.id === card.id;
                const canAdd = card.type === 'LEADER' || (countInDeck < 4 && (currentDeck?.cards.reduce((s, c) => s + c.count, 0) || 0) < 50);
                // Visual disabled state - but clicks still work to show feedback
                const isVisuallyDisabled = currentDeck && !canAdd && !isLeader;

                return (
                  <CardDisplay
                    key={card.id}
                    card={card}
                    size="md"
                    showCount={countInDeck > 0 ? countInDeck : undefined}
                    onClick={() => handleCardClick(card)}
                    disabled={isVisuallyDisabled || false}
                    selected={isLeader}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar - Deck panel */}
      <div className="w-80 bg-gray-900 p-4 overflow-hidden">
        <DeckPanel />
      </div>
    </div>
  );
}
