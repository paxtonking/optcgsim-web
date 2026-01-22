import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  eloRating: number;
  displayRank: number;
  tier: string;
  tierName: string;
  tierColor: string;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
}

interface LeaderboardResponse {
  season: string;
  entries: LeaderboardEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface MyRankResponse {
  season: string;
  hasPlayed: boolean;
  rank?: number;
  eloRating?: number;
  currentRating?: number;
  gamesWon?: number;
  gamesLost?: number;
  winRate?: number;
  tier?: string;
  tierName?: string;
  tierColor?: string;
  rankInfo?: {
    rating: number;
    tier: string;
    tierName: string;
    tierColor: string;
    progress: number;
    gamesUntilRanked: number;
  };
}

interface RankTier {
  key: string;
  name: string;
  min: number;
  max: number;
  color: string;
}

function RankBadge({ tierName, tierColor, size = 'md' }: {
  tier?: string;
  tierName: string;
  tierColor: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <span
      className={`font-semibold rounded ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${tierColor}20`,
        color: tierColor,
        border: `1px solid ${tierColor}40`,
      }}
    >
      {tierName}
    </span>
  );
}

function MyRankCard({ myRank }: { myRank: MyRankResponse }) {
  if (!myRank.hasPlayed) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Your Rank</h2>
        <div className="text-center py-4">
          <p className="text-gray-400 mb-2">
            Play ranked matches to appear on the leaderboard
          </p>
          {myRank.rankInfo && myRank.rankInfo.gamesUntilRanked > 0 && (
            <p className="text-sm text-gray-500">
              {myRank.rankInfo.gamesUntilRanked} placement game{myRank.rankInfo.gamesUntilRanked !== 1 ? 's' : ''} remaining
            </p>
          )}
          <div className="mt-4">
            <p className="text-gray-500 text-sm">Current Rating</p>
            <p className="text-2xl font-bold text-white">{myRank.currentRating || 1000}</p>
            {myRank.rankInfo && (
              <RankBadge
                tier={myRank.rankInfo.tier}
                tierName={myRank.rankInfo.tierName}
                tierColor={myRank.rankInfo.tierColor}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Your Rank</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <p className="text-gray-500 text-sm">Rank</p>
          <p className="text-3xl font-bold text-white">#{myRank.rank}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-sm">Rating</p>
          <p className="text-2xl font-bold text-white">{myRank.eloRating}</p>
          {myRank.tier && myRank.tierName && myRank.tierColor && (
            <RankBadge tier={myRank.tier} tierName={myRank.tierName} tierColor={myRank.tierColor} size="sm" />
          )}
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-sm">Record</p>
          <p className="text-xl font-semibold">
            <span className="text-green-400">{myRank.gamesWon}</span>
            {' - '}
            <span className="text-red-400">{myRank.gamesLost}</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-sm">Win Rate</p>
          <p className="text-xl font-semibold text-white">{myRank.winRate}%</p>
        </div>
      </div>
      {myRank.rankInfo && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Progress to next tier</span>
            <span>{myRank.rankInfo.progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${myRank.rankInfo.progress}%`,
                backgroundColor: myRank.tierColor,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RankTiersInfo({ tiers }: { tiers: RankTier[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center text-left"
      >
        <span className="font-semibold">Rank Tiers</span>
        <span className="text-gray-400">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {tiers.map((tier) => (
            <div
              key={tier.key}
              className="text-center p-2 rounded"
              style={{ backgroundColor: `${tier.color}15` }}
            >
              <RankBadge tier={tier.key} tierName={tier.name} tierColor={tier.color} size="sm" />
              <p className="text-xs text-gray-400 mt-1">
                {tier.min}+
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [myRank, setMyRank] = useState<MyRankResponse | null>(null);
  const [tiers, setTiers] = useState<RankTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 25;

  useEffect(() => {
    loadData();
  }, [page, isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load leaderboard
      const leaderboardRes = await api.get<LeaderboardResponse>(
        `/leaderboard?limit=${limit}&offset=${page * limit}`
      );
      setLeaderboard(leaderboardRes.data);

      // Load my rank if authenticated
      if (isAuthenticated && !user?.isGuest) {
        try {
          const myRankRes = await api.get<MyRankResponse>('/leaderboard/me');
          setMyRank(myRankRes.data);
        } catch {
          // User might not have played ranked yet
        }
      }

      // Load rank tiers (only once)
      if (tiers.length === 0) {
        const tiersRes = await api.get<{ tiers: RankTier[] }>('/leaderboard/rank-tiers');
        setTiers(tiersRes.data.tiers);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  if (loading && !leaderboard) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Leaderboard</h1>
        <div className="card p-8 text-center">
          <p className="text-gray-400">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Leaderboard</h1>
        <div className="card p-8 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        {leaderboard && (
          <span className="text-gray-400 text-sm">
            Season: {leaderboard.season}
          </span>
        )}
      </div>

      {/* Rank Tiers Info */}
      {tiers.length > 0 && <RankTiersInfo tiers={tiers} />}

      {/* My Rank Card */}
      {isAuthenticated && !user?.isGuest && myRank && <MyRankCard myRank={myRank} />}

      {/* Guest Banner */}
      {(!isAuthenticated || user?.isGuest) && (
        <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4 mb-6">
          <p className="text-blue-400">
            Create an account to play ranked matches and appear on the leaderboard.
          </p>
        </div>
      )}

      {/* Leaderboard Table */}
      {leaderboard && leaderboard.entries.length > 0 ? (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700 text-gray-300 text-sm">
                  <th className="py-3 px-4 text-left">Rank</th>
                  <th className="py-3 px-4 text-left">Player</th>
                  <th className="py-3 px-4 text-center">Tier</th>
                  <th className="py-3 px-4 text-right">Rating</th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">W/L</th>
                  <th className="py-3 px-4 text-right hidden md:table-cell">Win %</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.entries.map((entry) => {
                  const isCurrentUser = user?.id === entry.userId;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-t border-gray-700 hover:bg-gray-700/50 cursor-pointer ${
                        isCurrentUser ? 'bg-red-900/20' : ''
                      }`}
                      onClick={() => handleViewProfile(entry.userId)}
                    >
                      <td className="py-3 px-4">
                        <span className={`font-bold ${
                          entry.displayRank === 1 ? 'text-yellow-400' :
                          entry.displayRank === 2 ? 'text-gray-300' :
                          entry.displayRank === 3 ? 'text-amber-600' :
                          'text-gray-400'
                        }`}>
                          #{entry.displayRank}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-white">
                          {entry.username}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-red-400">(You)</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <RankBadge
                          tier={entry.tier}
                          tierName={entry.tierName}
                          tierColor={entry.tierColor}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white">
                        {entry.eloRating}
                      </td>
                      <td className="py-3 px-4 text-right hidden md:table-cell">
                        <span className="text-green-400">{entry.gamesWon}</span>
                        {' / '}
                        <span className="text-red-400">{entry.gamesLost}</span>
                      </td>
                      <td className="py-3 px-4 text-right hidden md:table-cell text-gray-300">
                        {entry.winRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Page {page + 1} of {Math.ceil(leaderboard.pagination.total / limit)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!leaderboard.pagination.hasMore}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            No players on the leaderboard yet. Be the first to play ranked!
          </p>
        </div>
      )}
    </div>
  );
}
