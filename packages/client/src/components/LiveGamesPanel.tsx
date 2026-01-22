import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socketService, connectSocket } from '../services/socket';

interface LiveGame {
  gameId: string;
  player1: { id: string; username: string };
  player2: { id: string; username: string };
  ranked: boolean;
  spectatorCount: number;
  startedAt: string;
  turnCount: number;
}

export function LiveGamesPanel() {
  const navigate = useNavigate();
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveGames = useCallback(() => {
    const socket = connectSocket();
    socket.emit('spectate:getLiveGames', (response: { success: boolean; games?: LiveGame[]; error?: string }) => {
      if (response.success && response.games) {
        setLiveGames(response.games);
        setError(null);
      } else {
        setError(response.error || 'Failed to fetch live games');
      }
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchLiveGames();

    // Refresh every 10 seconds
    const interval = setInterval(fetchLiveGames, 10000);

    // Listen for game updates
    const unsubGameStarted = socketService.on('game:started', () => {
      fetchLiveGames();
    });

    const unsubGameEnded = socketService.on('game:ended', () => {
      fetchLiveGames();
    });

    return () => {
      clearInterval(interval);
      unsubGameStarted();
      unsubGameEnded();
    };
  }, [fetchLiveGames]);

  const handleSpectate = (gameId: string) => {
    navigate(`/game/${gameId}?spectate=true`);
  };

  const formatTime = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just started';
    if (diffMins === 1) return '1 min ago';
    return `${diffMins} mins ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Live Games</h2>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
          <p className="text-gray-400 mt-2">Loading live games...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Live Games</h2>
        <button
          onClick={fetchLiveGames}
          className="text-gray-400 hover:text-white text-sm"
          title="Refresh"
        >
          &#8635; Refresh
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {liveGames.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">No live games at the moment.</p>
          <p className="text-gray-500 text-sm mt-1">Check back soon!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {liveGames.map((game) => (
            <div
              key={game.gameId}
              className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white">
                      {game.player1.username}
                    </span>
                    <span className="text-gray-400">vs</span>
                    <span className="font-medium text-white">
                      {game.player2.username}
                    </span>
                    {game.ranked && (
                      <span className="px-2 py-0.5 bg-yellow-600 text-yellow-100 text-xs rounded">
                        Ranked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>Turn {game.turnCount}</span>
                    <span>{formatTime(game.startedAt)}</span>
                    <span className="flex items-center gap-1">
                      <span>&#128065;</span> {game.spectatorCount} watching
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleSpectate(game.gameId)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Watch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {liveGames.length > 0 && (
        <p className="text-gray-500 text-xs mt-4 text-center">
          {liveGames.length} game{liveGames.length !== 1 ? 's' : ''} in progress
        </p>
      )}
    </div>
  );
}
