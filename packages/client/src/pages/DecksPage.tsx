import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

interface PublicDeck {
  id: string;
  name: string;
  leaderId: string | null;
  cards: { cardId: string; count: number }[];
  cardCount: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
  };
}

interface CardData {
  id: string;
  name: string;
  setCode: string;
  colors: string[];
  type: string;
  imageUrl: string;
}

export default function DecksPage() {
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const [cards, setCards] = useState<Map<string, CardData>>(new Map());
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<PublicDeck | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedLeader, setSelectedLeader] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const [decksPerPage] = useState(24);

  // Load cards for leader images
  useEffect(() => {
    const loadCards = async () => {
      try {
        const response = await fetch('/data/cards.json');
        if (!response.ok) throw new Error('Failed to load cards');
        const data: CardData[] = await response.json();
        const cardMap = new Map<string, CardData>();
        data.forEach((card) => cardMap.set(card.id, card));
        setCards(cardMap);
      } catch (err) {
        console.error('Failed to load cards:', err);
      }
    };
    loadCards();
  }, []);

  // Get available leaders
  const leaders = useMemo(() => {
    const leaderCards: CardData[] = [];
    cards.forEach((card) => {
      if (card.type === 'LEADER') {
        leaderCards.push(card);
      }
    });
    return leaderCards.sort((a, b) => a.id.localeCompare(b.id));
  }, [cards]);

  // Load decks
  useEffect(() => {
    const loadDecks = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: decksPerPage.toString(),
          offset: ((page - 1) * decksPerPage).toString(),
          sortBy,
          sortOrder,
        });
        if (search) params.set('search', search);
        if (selectedLeader) params.set('leaderId', selectedLeader);

        const response = await api.get<{ decks: PublicDeck[]; total: number }>(
          `/decks/public?${params}`
        );
        setDecks(response.data.decks);
        setTotal(response.data.total);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load decks');
      } finally {
        setIsLoading(false);
      }
    };

    loadDecks();
  }, [page, search, selectedLeader, sortBy, sortOrder, decksPerPage]);

  const totalPages = Math.ceil(total / decksPerPage);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setSelectedLeader('');
    setSortBy('updatedAt');
    setSortOrder('desc');
    setPage(1);
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

  const getLeaderCard = (leaderId: string | null) => {
    if (!leaderId) return null;
    return cards.get(leaderId);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Public Decks</h1>
        <Link
          to="/decks"
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          My Decks
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="lg:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by deck name or creator..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Search
              </button>
            </div>
          </form>

          {/* Leader Filter */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Leader</label>
            <select
              value={selectedLeader}
              onChange={(e) => {
                setSelectedLeader(e.target.value);
                setPage(1);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Leaders</option>
              {leaders.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.id} - {leader.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Sort By</label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="updatedAt">Last Updated</option>
                <option value="createdAt">Date Created</option>
                <option value="name">Name</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Filter Actions */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
          <p className="text-gray-400">
            {total.toLocaleString()} public decks found
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Loading/Error State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Decks Grid */}
      {!isLoading && !error && (
        <>
          {decks.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No public decks found</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              {decks.map((deck) => {
                const leaderCard = getLeaderCard(deck.leaderId);
                return (
                  <div
                    key={deck.id}
                    onClick={() => setSelectedDeck(deck)}
                    className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-red-500 transition-all"
                  >
                    {/* Leader Image */}
                    <div className="aspect-[5/3] relative bg-gray-900">
                      {leaderCard ? (
                        <img
                          src={leaderCard.imageUrl}
                          alt={leaderCard.name}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          No Leader
                        </div>
                      )}
                      {/* Color indicator */}
                      {leaderCard && (
                        <div className="absolute bottom-2 left-2 flex gap-1">
                          {leaderCard.colors.map((color, i) => (
                            <div
                              key={i}
                              className={`w-4 h-4 rounded-full ${getColorClass(color.split(' ')[0])} border border-white/30`}
                              title={color}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Deck Info */}
                    <div className="p-3">
                      <h3 className="font-semibold truncate">{deck.name}</h3>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-sm text-gray-400">
                          by{' '}
                          <Link
                            to={`/profile/${deck.user.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-red-400 hover:text-red-300"
                          >
                            {deck.user.username}
                          </Link>
                        </p>
                        <p className="text-xs text-gray-500">
                          {deck.cardCount} cards
                        </p>
                      </div>
                      {leaderCard && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {leaderCard.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(deck.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
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
        </>
      )}

      {/* Deck Detail Modal */}
      {selectedDeck && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDeck(null)}
        >
          <div
            className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedDeck.name}</h2>
                  <p className="text-gray-400 mt-1">
                    by{' '}
                    <Link
                      to={`/profile/${selectedDeck.user.id}`}
                      className="text-red-400 hover:text-red-300"
                    >
                      {selectedDeck.user.username}
                    </Link>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDeck(null)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  &times;
                </button>
              </div>

              {/* Leader */}
              {selectedDeck.leaderId && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Leader</h3>
                  <div className="flex items-start gap-4">
                    {cards.get(selectedDeck.leaderId) && (
                      <>
                        <img
                          src={cards.get(selectedDeck.leaderId)!.imageUrl}
                          alt={cards.get(selectedDeck.leaderId)!.name}
                          className="w-32 rounded-lg"
                        />
                        <div>
                          <p className="font-semibold">
                            {cards.get(selectedDeck.leaderId)!.name}
                          </p>
                          <p className="text-sm text-gray-400">
                            {selectedDeck.leaderId}
                          </p>
                          <div className="flex gap-1 mt-2">
                            {cards.get(selectedDeck.leaderId)!.colors.map((color, i) => (
                              <div
                                key={i}
                                className={`w-5 h-5 rounded-full ${getColorClass(color.split(' ')[0])}`}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Deck List */}
              <div>
                <h3 className="text-lg font-semibold mb-3">
                  Deck ({selectedDeck.cardCount} cards)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {selectedDeck.cards.map((deckCard, index) => {
                    const card = cards.get(deckCard.cardId);
                    return (
                      <div
                        key={index}
                        className="bg-gray-700 rounded p-2 flex items-center gap-2"
                      >
                        {card && (
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className="w-10 h-14 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{deckCard.cardId}</p>
                          <p className="text-sm truncate">
                            {card?.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-400">x{deckCard.count}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-6 pt-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    const deckString = JSON.stringify({
                      name: selectedDeck.name,
                      leaderId: selectedDeck.leaderId,
                      cards: selectedDeck.cards,
                    });
                    navigator.clipboard.writeText(deckString);
                    alert('Deck copied to clipboard!');
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
                >
                  Copy Deck Code
                </button>
                <button
                  onClick={() => setSelectedDeck(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
