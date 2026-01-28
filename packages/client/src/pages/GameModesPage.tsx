import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import { ComingSoonOverlay } from '../components/ComingSoonOverlay';

interface DraftLobby {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  packsPerPlayer: number;
  status: string;
  players: { userId: string }[];
  createdAt: string;
}

interface SealedPool {
  id: string;
  packCount: number;
  status: string;
  createdAt: string;
}

interface GameSeries {
  id: string;
  player1Id: string;
  player2Id: string;
  bestOf: number;
  player1Wins: number;
  player2Wins: number;
  status: string;
}

export default function GameModesPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'series' | 'draft' | 'sealed'>('series');
  const [draftLobbies, setDraftLobbies] = useState<DraftLobby[]>([]);
  const [sealedPools, setSealedPools] = useState<SealedPool[]>([]);
  const [activeSeries, setActiveSeries] = useState<GameSeries[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDraft, setShowCreateDraft] = useState(false);
  const [showCreateSealed, setShowCreateSealed] = useState(false);

  const [draftForm, setDraftForm] = useState({
    name: '',
    maxPlayers: 8,
    packsPerPlayer: 3,
    cardsPerPack: 15,
    pickTimeSeconds: 45,
  });

  const [sealedForm, setSealedForm] = useState({
    packCount: 6,
  });

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'series') {
        const response = await api.get<{ series: GameSeries[] }>('/game-modes/series');
        setActiveSeries(response.data.series);
      } else if (activeTab === 'draft') {
        const response = await api.get<{ lobbies: DraftLobby[] }>('/game-modes/draft');
        setDraftLobbies(response.data.lobbies);
      } else if (activeTab === 'sealed') {
        const response = await api.get<{ pools: SealedPool[] }>('/game-modes/sealed');
        setSealedPools(response.data.pools);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createDraftLobby = async () => {
    try {
      const response = await api.post<{ lobby: DraftLobby }>('/game-modes/draft', draftForm);
      navigate(`/game-modes/draft/${response.data.lobby.id}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create draft lobby');
    }
  };

  const joinDraftLobby = async (lobbyId: string) => {
    try {
      await api.post(`/game-modes/draft/${lobbyId}/join`);
      navigate(`/game-modes/draft/${lobbyId}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to join draft lobby');
    }
  };

  const createSealedPool = async () => {
    try {
      const response = await api.post<{ pool: SealedPool }>('/game-modes/sealed', sealedForm);
      navigate(`/game-modes/sealed/${response.data.pool.id}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create sealed pool');
    }
  };

  return (
    <ComingSoonOverlay featureName="Game Modes">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Custom Game Modes</h1>

        {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('series')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'series'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Best-of Series
        </button>
        <button
          onClick={() => setActiveTab('draft')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'draft'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Draft Mode
        </button>
        <button
          onClick={() => setActiveTab('sealed')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'sealed'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Sealed Mode
        </button>
      </div>

      {/* Series Tab */}
      {activeTab === 'series' && (
        <div>
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Best-of Series</h2>
            <p className="text-gray-400 mb-4">
              Play a best-of-3 or best-of-5 series against an opponent. The first player to win
              the majority of games wins the series.
            </p>
            <p className="text-sm text-gray-500">
              To start a series, challenge a friend from your friends list and select the series format.
            </p>
          </div>

          <h3 className="text-lg font-semibold mb-4">Your Active Series</h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : activeSeries.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No active series</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeSeries.map((series) => (
                <div key={series.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-lg font-semibold">Best of {series.bestOf}</span>
                      <div className="text-gray-400 mt-1">
                        Score: {series.player1Id === user?.id ? series.player1Wins : series.player2Wins} - {series.player1Id === user?.id ? series.player2Wins : series.player1Wins}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/game-modes/series/${series.id}`)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Draft Tab */}
      {activeTab === 'draft' && (
        <div>
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-4">Draft Mode</h2>
                <p className="text-gray-400 mb-4">
                  Join a draft with other players. Take turns picking cards from shared packs,
                  then build a deck from your drafted cards.
                </p>
              </div>
              <button
                onClick={() => setShowCreateDraft(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Create Draft
              </button>
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-4">Available Draft Lobbies</h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : draftLobbies.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No draft lobbies available</p>
              <button
                onClick={() => setShowCreateDraft(true)}
                className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Create One
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {draftLobbies.map((lobby) => (
                <div key={lobby.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-lg font-semibold">{lobby.name}</h4>
                      <div className="text-gray-400 text-sm mt-1">
                        Players: {lobby.players.length}/{lobby.maxPlayers} | {lobby.packsPerPlayer} packs
                      </div>
                    </div>
                    <button
                      onClick={() => joinDraftLobby(lobby.id)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sealed Tab */}
      {activeTab === 'sealed' && (
        <div>
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-4">Sealed Mode</h2>
                <p className="text-gray-400 mb-4">
                  Open virtual booster packs and build a deck from your card pool.
                  Test your deck-building skills with limited resources.
                </p>
              </div>
              <button
                onClick={() => setShowCreateSealed(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                New Sealed Pool
              </button>
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-4">Your Sealed Pools</h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : sealedPools.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No sealed pools</p>
              <button
                onClick={() => setShowCreateSealed(true)}
                className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Create One
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sealedPools.map((pool) => (
                <div key={pool.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-lg font-semibold">{pool.packCount} Pack Sealed</h4>
                      <div className="text-gray-400 text-sm mt-1">
                        Status: {pool.status === 'DECK_BUILDING' ? 'Building Deck' : pool.status}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/game-modes/sealed/${pool.id}`)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                    >
                      {pool.status === 'DECK_BUILDING' ? 'Build Deck' : 'View'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Draft Modal */}
      {showCreateDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create Draft Lobby</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Lobby Name</label>
                <input
                  type="text"
                  value={draftForm.name}
                  onChange={(e) => setDraftForm({ ...draftForm, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="My Draft Lobby"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Players</label>
                  <select
                    value={draftForm.maxPlayers}
                    onChange={(e) => setDraftForm({ ...draftForm, maxPlayers: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value={4}>4 Players</option>
                    <option value={6}>6 Players</option>
                    <option value={8}>8 Players</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Packs per Player</label>
                  <select
                    value={draftForm.packsPerPlayer}
                    onChange={(e) => setDraftForm({ ...draftForm, packsPerPlayer: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value={2}>2 Packs</option>
                    <option value={3}>3 Packs</option>
                    <option value={4}>4 Packs</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Pick Time (seconds)</label>
                <select
                  value={draftForm.pickTimeSeconds}
                  onChange={(e) => setDraftForm({ ...draftForm, pickTimeSeconds: parseInt(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={createDraftLobby}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                Create Lobby
              </button>
              <button
                onClick={() => setShowCreateDraft(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Sealed Modal */}
      {showCreateSealed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create Sealed Pool</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Number of Packs</label>
                <select
                  value={sealedForm.packCount}
                  onChange={(e) => setSealedForm({ ...sealedForm, packCount: parseInt(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value={4}>4 Packs (48 cards)</option>
                  <option value={6}>6 Packs (72 cards)</option>
                  <option value={8}>8 Packs (96 cards)</option>
                </select>
              </div>

              <p className="text-sm text-gray-400">
                You'll receive random cards from all available sets to build your deck.
                Your pool will be available for 24 hours.
              </p>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={createSealedPool}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                Open Packs
              </button>
              <button
                onClick={() => setShowCreateSealed(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </ComingSoonOverlay>
  );
}
