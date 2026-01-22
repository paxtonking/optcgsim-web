import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

interface DailyMatchData {
  date: string;
  total: number;
  ranked: number;
}

interface PopularLeader {
  leaderId: string;
  count: number;
}

export default function AdminAnalytics() {
  const [dailyMatchData, setDailyMatchData] = useState<DailyMatchData[]>([]);
  const [popularLeaders, setPopularLeaders] = useState<PopularLeader[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalDecks, setTotalDecks] = useState(0);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [matchResponse, deckResponse] = await Promise.all([
          api.get<{ dailyMatchData: DailyMatchData[]; totalMatches: number }>(
            `/admin/analytics/matches?days=${days}`
          ),
          api.get<{ popularLeaders: PopularLeader[]; totalDecks: number }>(
            '/admin/analytics/decks'
          ),
        ]);

        setDailyMatchData(matchResponse.data.dailyMatchData);
        setTotalMatches(matchResponse.data.totalMatches);
        setPopularLeaders(deckResponse.data.popularLeaders);
        setTotalDecks(deckResponse.data.totalDecks);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, [days]);

  const maxMatchesPerDay = Math.max(...dailyMatchData.map((d) => d.total), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <Link to="/admin" className="text-gray-400 hover:text-white">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2 mb-6">
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded ${
              days === d
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-1">Matches (Last {days} Days)</p>
          <p className="text-3xl font-bold">{totalMatches.toLocaleString()}</p>
          <p className="text-gray-500 text-sm mt-2">
            Avg {Math.round(totalMatches / days)} per day
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-1">Total Decks Created</p>
          <p className="text-3xl font-bold">{totalDecks.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-1">Unique Leaders Used</p>
          <p className="text-3xl font-bold">{popularLeaders.length}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Daily Matches Chart */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Daily Matches</h2>
          {dailyMatchData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No match data available</p>
          ) : (
            <div className="space-y-2">
              {dailyMatchData.slice(-14).map((day) => (
                <div key={day.date} className="flex items-center gap-4">
                  <span className="text-gray-400 text-sm w-20">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <div className="flex-1 h-6 bg-gray-700 rounded overflow-hidden flex">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${(day.ranked / maxMatchesPerDay) * 100}%` }}
                      title={`Ranked: ${day.ranked}`}
                    />
                    <div
                      className="h-full bg-gray-500"
                      style={{
                        width: `${((day.total - day.ranked) / maxMatchesPerDay) * 100}%`,
                      }}
                      title={`Unranked: ${day.total - day.ranked}`}
                    />
                  </div>
                  <span className="text-white text-sm w-12 text-right">{day.total}</span>
                </div>
              ))}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-600 rounded" />
                  <span className="text-gray-400 text-sm">Ranked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-500 rounded" />
                  <span className="text-gray-400 text-sm">Unranked</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Popular Leaders */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Popular Leaders</h2>
          {popularLeaders.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No deck data available</p>
          ) : (
            <div className="space-y-3">
              {popularLeaders.slice(0, 10).map((leader, index) => (
                <div key={leader.leaderId} className="flex items-center gap-4">
                  <span className="text-gray-500 text-sm w-6">{index + 1}.</span>
                  <span className="text-white flex-1 font-mono text-sm">
                    {leader.leaderId}
                  </span>
                  <div className="w-24 h-4 bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-red-600"
                      style={{
                        width: `${(leader.count / popularLeaders[0].count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-gray-400 text-sm w-12 text-right">
                    {leader.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
