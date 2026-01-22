import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

type TournamentStatus = 'DRAFT' | 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TournamentFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'SWISS' | 'ROUND_ROBIN';

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  minParticipants: number;
  registrationStart: string | null;
  registrationEnd: string | null;
  startDate: string | null;
  isRanked: boolean;
  bestOf: number;
  _count: {
    participants: number;
  };
}

const STATUS_STYLES: Record<TournamentStatus, { bg: string; text: string }> = {
  DRAFT: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
  REGISTRATION: { bg: 'bg-green-600/20', text: 'text-green-400' },
  IN_PROGRESS: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
  COMPLETED: { bg: 'bg-purple-600/20', text: 'text-purple-400' },
  CANCELLED: { bg: 'bg-red-600/20', text: 'text-red-400' },
};

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  SINGLE_ELIMINATION: 'Single Elimination',
  DOUBLE_ELIMINATION: 'Double Elimination',
  SWISS: 'Swiss',
  ROUND_ROBIN: 'Round Robin',
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    const loadTournaments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        const response = await api.get<{ tournaments: Tournament[] }>(`/tournaments?${params}`);
        setTournaments(response.data.tournaments);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load tournaments');
      } finally {
        setIsLoading(false);
      }
    };

    loadTournaments();
  }, [statusFilter]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Tournaments</h1>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-4 py-2 rounded ${!statusFilter ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('REGISTRATION')}
            className={`px-4 py-2 rounded ${statusFilter === 'REGISTRATION' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            Open Registration
          </button>
          <button
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`px-4 py-2 rounded ${statusFilter === 'IN_PROGRESS' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            In Progress
          </button>
          <button
            onClick={() => setStatusFilter('COMPLETED')}
            className={`px-4 py-2 rounded ${statusFilter === 'COMPLETED' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            Completed
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Tournaments List */}
      {tournaments.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No tournaments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tournaments.map((tournament) => {
            const statusStyle = STATUS_STYLES[tournament.status];
            return (
              <Link
                key={tournament.id}
                to={`/tournaments/${tournament.id}`}
                className="block bg-gray-800 rounded-lg p-6 hover:ring-2 hover:ring-red-500 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold">{tournament.name}</h2>
                      <span className={`px-2 py-1 rounded text-xs ${statusStyle.bg} ${statusStyle.text}`}>
                        {tournament.status.replace('_', ' ')}
                      </span>
                      {tournament.isRanked && (
                        <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">
                          Ranked
                        </span>
                      )}
                    </div>
                    {tournament.description && (
                      <p className="text-gray-400 text-sm mb-3 line-clamp-2">{tournament.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>Format: {FORMAT_LABELS[tournament.format]}</span>
                      <span>Best of {tournament.bestOf}</span>
                      <span>
                        Players: {tournament._count.participants}/{tournament.maxParticipants}
                      </span>
                      {tournament.startDate && (
                        <span>
                          Starts: {new Date(tournament.startDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {tournament._count.participants}
                    </div>
                    <div className="text-xs text-gray-500">participants</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
