import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Player {
  id: string;
  username: string;
  eloRating: number;
  eloBefore?: number;
  eloChange?: number;
}

interface MatchData {
  id: string;
  player1: Player;
  player2: Player;
  winnerId: string | null;
  ranked: boolean;
  duration: number | null;
  createdAt: string;
  initialState: any;
  gameLog: any[];
  hasReplay: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PlayerCard({ player, isWinner, side }: { player: Player; isWinner: boolean; side: 'left' | 'right' }) {
  return (
    <div className={`flex-1 p-4 rounded-lg ${isWinner ? 'bg-green-900/30 border border-green-600' : 'bg-gray-700'}`}>
      <div className={`flex items-center gap-3 ${side === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-xl font-bold">
          {player.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-lg text-white">{player.username}</p>
          <div className="flex items-center gap-2 text-sm">
            {player.eloBefore !== undefined && player.eloBefore !== null && (
              <>
                <span className="text-gray-400">{player.eloBefore}</span>
                {player.eloChange !== undefined && player.eloChange !== null && (
                  <span className={player.eloChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ({player.eloChange >= 0 ? '+' : ''}{player.eloChange})
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {isWinner && (
        <div className={`mt-2 text-green-400 text-sm font-medium ${side === 'right' ? 'text-right' : ''}`}>
          Winner
        </div>
      )}
    </div>
  );
}

export default function ReplayPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Replay state
  const [currentAction, setCurrentAction] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    loadMatch();
  }, [matchId]);

  const loadMatch = async () => {
    if (!matchId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get<MatchData>(`/matches/${matchId}`);
      setMatch(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load match');
    } finally {
      setLoading(false);
    }
  };

  // Auto-advance replay when playing
  useEffect(() => {
    if (!isPlaying || !match?.gameLog) return;

    const interval = setInterval(() => {
      setCurrentAction(prev => {
        if (prev >= match.gameLog.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, match?.gameLog?.length]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handlePrevious = () => setCurrentAction(prev => Math.max(0, prev - 1));
  const handleNext = () => setCurrentAction(prev => Math.min((match?.gameLog?.length || 1) - 1, prev + 1));
  const handleStart = () => setCurrentAction(0);
  const handleEnd = () => setCurrentAction((match?.gameLog?.length || 1) - 1);

  const copyShareLink = () => {
    const url = `${window.location.origin}/replay/${matchId}`;
    navigator.clipboard.writeText(url);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-8 text-center">
          <p className="text-gray-400">Loading match...</p>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="card p-8 text-center">
          <p className="text-red-400">{error || 'Match not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-white mb-2"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold">Match Replay</h1>
        </div>
        <button
          onClick={copyShareLink}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <span>Share</span>
        </button>
      </div>

      {/* Match Info Card */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <PlayerCard player={match.player1} isWinner={match.winnerId === match.player1.id} side="left" />
          <div className="px-4 text-center">
            <p className="text-2xl font-bold text-gray-400">VS</p>
            {match.ranked && (
              <span className="text-xs bg-yellow-600 text-white px-2 py-0.5 rounded">Ranked</span>
            )}
          </div>
          <PlayerCard player={match.player2} isWinner={match.winnerId === match.player2.id} side="right" />
        </div>

        <div className="flex justify-center gap-8 text-sm text-gray-400">
          <span>Duration: {formatDuration(match.duration)}</span>
          <span>Played: {formatDate(match.createdAt)}</span>
          <span>Actions: {match.gameLog?.length || 0}</span>
        </div>
      </div>

      {/* Replay Controls */}
      {match.hasReplay ? (
        <>
          {/* Replay Viewer Placeholder */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4 h-96 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 mb-2">Replay Viewer</p>
              <p className="text-gray-500 text-sm">
                Action {currentAction + 1} of {match.gameLog.length}
              </p>
              {match.gameLog[currentAction] && (
                <div className="mt-4 p-4 bg-gray-700 rounded text-left max-w-md mx-auto">
                  <pre className="text-xs text-gray-300 overflow-auto">
                    {JSON.stringify(match.gameLog[currentAction], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="bg-gray-800 rounded-lg p-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={Math.max(0, (match.gameLog?.length || 1) - 1)}
                value={currentAction}
                onChange={(e) => setCurrentAction(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Controls */}
            <div className="flex justify-center items-center gap-4">
              <button
                onClick={handleStart}
                className="p-2 text-gray-400 hover:text-white"
                title="Start"
              >
                &#x23EE;
              </button>
              <button
                onClick={handlePrevious}
                className="p-2 text-gray-400 hover:text-white"
                title="Previous"
              >
                &#x23EA;
              </button>
              {isPlaying ? (
                <button
                  onClick={handlePause}
                  className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full"
                  title="Pause"
                >
                  &#x23F8;
                </button>
              ) : (
                <button
                  onClick={handlePlay}
                  className="p-3 bg-green-600 hover:bg-green-700 text-white rounded-full"
                  title="Play"
                >
                  &#x25B6;
                </button>
              )}
              <button
                onClick={handleNext}
                className="p-2 text-gray-400 hover:text-white"
                title="Next"
              >
                &#x23E9;
              </button>
              <button
                onClick={handleEnd}
                className="p-2 text-gray-400 hover:text-white"
                title="End"
              >
                &#x23ED;
              </button>

              {/* Speed Control */}
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="ml-4 bg-gray-700 text-white px-3 py-1 rounded"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            Replay data not available for this match.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Only matches played after the replay system was implemented have replay data.
          </p>
        </div>
      )}

      {/* Action Log */}
      <div className="bg-gray-800 rounded-lg p-4 mt-6">
        <h3 className="text-lg font-semibold mb-4">Action Log</h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {match.gameLog?.map((action: any, index: number) => (
            <div
              key={index}
              className={`p-2 rounded text-sm cursor-pointer ${
                index === currentAction ? 'bg-red-600/30 border border-red-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              onClick={() => setCurrentAction(index)}
            >
              <span className="text-gray-400 mr-2">#{index + 1}</span>
              <span className="text-white">{action.type}</span>
              {action.playerId && (
                <span className="text-gray-400 ml-2">
                  by {action.playerId === match.player1.id ? match.player1.username : match.player2.username}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
