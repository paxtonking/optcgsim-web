import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

type TournamentStatus = 'DRAFT' | 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TournamentFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'SWISS' | 'ROUND_ROBIN';
type ParticipantStatus = 'REGISTERED' | 'CHECKED_IN' | 'ACTIVE' | 'ELIMINATED' | 'DISQUALIFIED' | 'WITHDRAWN';

interface User {
  id: string;
  username: string;
  eloRating: number;
  avatarId: string;
}

interface Participant {
  id: string;
  userId: string;
  deckId: string | null;
  seed: number | null;
  status: ParticipantStatus;
  placement: number | null;
  wins: number;
  losses: number;
  user: User;
}

interface TournamentMatch {
  id: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Score: number;
  player2Score: number;
  status: string;
}

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
  endDate: string | null;
  rules: string | null;
  prizes: string | null;
  isRanked: boolean;
  bestOf: number;
  participants: Participant[];
  matches: TournamentMatch[];
  _count: { participants: number };
}

interface Deck {
  id: string;
  name: string;
  leaderId: string;
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

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuthStore();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userParticipant, setUserParticipant] = useState<Participant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'participants' | 'bracket'>('info');
  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const loadTournament = async () => {
      setIsLoading(true);
      try {
        const response = await api.get<{
          tournament: Tournament;
          isRegistered: boolean;
          userParticipant: Participant | null;
        }>(`/tournaments/${id}`);
        setTournament(response.data.tournament);
        setIsRegistered(response.data.isRegistered);
        setUserParticipant(response.data.userParticipant);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load tournament');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) loadTournament();
  }, [id]);

  useEffect(() => {
    const loadDecks = async () => {
      if (isAuthenticated) {
        try {
          const response = await api.get<Deck[]>('/decks');
          setUserDecks(response.data);
        } catch (err) {
          console.error('Failed to load decks:', err);
        }
      }
    };
    loadDecks();
  }, [isAuthenticated]);

  const handleRegister = async () => {
    if (!tournament) return;
    setIsRegistering(true);
    try {
      await api.post(`/tournaments/${tournament.id}/register`, {
        deckId: selectedDeckId || undefined,
      });
      // Reload tournament
      const response = await api.get<{
        tournament: Tournament;
        isRegistered: boolean;
        userParticipant: Participant | null;
      }>(`/tournaments/${id}`);
      setTournament(response.data.tournament);
      setIsRegistered(true);
      setUserParticipant(response.data.userParticipant);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to register');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleWithdraw = async () => {
    if (!tournament || !confirm('Are you sure you want to withdraw from this tournament?')) return;
    try {
      await api.delete(`/tournaments/${tournament.id}/register`);
      setIsRegistered(false);
      setUserParticipant(null);
      // Reload tournament
      const response = await api.get<{ tournament: Tournament }>(`/tournaments/${id}`);
      setTournament(response.data.tournament);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to withdraw');
    }
  };

  const handleCheckIn = async () => {
    if (!tournament) return;
    try {
      await api.post(`/tournaments/${tournament.id}/checkin`);
      // Reload
      const response = await api.get<{
        tournament: Tournament;
        isRegistered: boolean;
        userParticipant: Participant | null;
      }>(`/tournaments/${id}`);
      setTournament(response.data.tournament);
      setUserParticipant(response.data.userParticipant);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to check in');
    }
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

  if (error || !tournament) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{error || 'Tournament not found'}</p>
          <Link to="/tournaments" className="text-gray-400 hover:text-white">
            Back to Tournaments
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[tournament.status];
  const canRegister = tournament.status === 'REGISTRATION' && !isRegistered && isAuthenticated;
  const canWithdraw = isRegistered && tournament.status === 'REGISTRATION';
  const canCheckIn = isRegistered && tournament.status === 'REGISTRATION' && userParticipant?.status === 'REGISTERED';

  // Build bracket view
  const userMap = new Map(tournament.participants.map(p => [p.userId, p.user]));
  const rounds: Record<number, TournamentMatch[]> = {};
  tournament.matches.forEach(match => {
    if (!rounds[match.round]) rounds[match.round] = [];
    rounds[match.round].push(match);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/tournaments" className="text-gray-400 hover:text-white text-sm mb-2 inline-block">
            ← Back to Tournaments
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{tournament.name}</h1>
            <span className={`px-3 py-1 rounded ${statusStyle.bg} ${statusStyle.text}`}>
              {tournament.status.replace('_', ' ')}
            </span>
            {tournament.isRanked && (
              <span className="px-3 py-1 bg-yellow-600/20 text-yellow-400 rounded">
                Ranked
              </span>
            )}
          </div>
        </div>

        {/* Registration Actions */}
        <div className="flex flex-col gap-2">
          {canRegister && (
            <div className="flex gap-2">
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              >
                <option value="">Select Deck (Optional)</option>
                {userDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRegister}
                disabled={isRegistering}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded disabled:opacity-50"
              >
                {isRegistering ? 'Registering...' : 'Register'}
              </button>
            </div>
          )}
          {canCheckIn && (
            <button
              onClick={handleCheckIn}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
            >
              Check In
            </button>
          )}
          {canWithdraw && (
            <button
              onClick={handleWithdraw}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded"
            >
              Withdraw
            </button>
          )}
          {isRegistered && userParticipant && (
            <p className="text-sm text-green-400">
              Status: {userParticipant.status}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 rounded ${activeTab === 'info' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          Info
        </button>
        <button
          onClick={() => setActiveTab('participants')}
          className={`px-4 py-2 rounded ${activeTab === 'participants' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          Participants ({tournament._count.participants})
        </button>
        {tournament.matches.length > 0 && (
          <button
            onClick={() => setActiveTab('bracket')}
            className={`px-4 py-2 rounded ${activeTab === 'bracket' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Bracket
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {tournament.description && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3">Description</h3>
                <p className="text-gray-300 whitespace-pre-wrap">{tournament.description}</p>
              </div>
            )}

            {tournament.rules && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3">Rules</h3>
                <p className="text-gray-300 whitespace-pre-wrap">{tournament.rules}</p>
              </div>
            )}

            {tournament.prizes && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3">Prizes</h3>
                <p className="text-gray-300 whitespace-pre-wrap">{tournament.prizes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Format:</span>
                  <span>{FORMAT_LABELS[tournament.format]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Best Of:</span>
                  <span>{tournament.bestOf}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Participants:</span>
                  <span>{tournament._count.participants} / {tournament.maxParticipants}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Min Players:</span>
                  <span>{tournament.minParticipants}</span>
                </div>
                {tournament.startDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Start Date:</span>
                    <span>{new Date(tournament.startDate).toLocaleString()}</span>
                  </div>
                )}
                {tournament.registrationEnd && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Registration Ends:</span>
                    <span>{new Date(tournament.registrationEnd).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'participants' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-900">
                <th className="p-4">Seed</th>
                <th className="p-4">Player</th>
                <th className="p-4">ELO</th>
                <th className="p-4">Status</th>
                <th className="p-4">Record</th>
              </tr>
            </thead>
            <tbody>
              {tournament.participants
                .sort((a, b) => (a.seed || 999) - (b.seed || 999))
                .map((participant) => (
                  <tr key={participant.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                    <td className="p-4 text-gray-400">{participant.seed || '-'}</td>
                    <td className="p-4">
                      <Link
                        to={`/profile/${participant.userId}`}
                        className="text-white hover:text-red-400"
                      >
                        {participant.user.username}
                      </Link>
                      {participant.userId === user?.id && (
                        <span className="ml-2 text-xs text-green-400">(You)</span>
                      )}
                    </td>
                    <td className="p-4">{participant.user.eloRating}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        participant.status === 'ACTIVE' ? 'bg-green-600/20 text-green-400' :
                        participant.status === 'ELIMINATED' ? 'bg-red-600/20 text-red-400' :
                        participant.status === 'CHECKED_IN' ? 'bg-blue-600/20 text-blue-400' :
                        'bg-gray-600/20 text-gray-400'
                      }`}>
                        {participant.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {participant.wins}-{participant.losses}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'bracket' && (
        <div className="bg-gray-800 rounded-lg p-6 overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            {Object.entries(rounds)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([round, matches]) => (
                <div key={round} className="flex flex-col gap-4">
                  <h3 className="text-center font-semibold text-gray-400 mb-2">
                    Round {round}
                  </h3>
                  {matches.map((match) => {
                    const player1 = match.player1Id ? userMap.get(match.player1Id) : null;
                    const player2 = match.player2Id ? userMap.get(match.player2Id) : null;
                    return (
                      <div
                        key={match.id}
                        className="bg-gray-700 rounded p-3 w-48"
                      >
                        <div className={`flex justify-between items-center p-2 rounded mb-1 ${
                          match.winnerId === match.player1Id ? 'bg-green-900/30' : ''
                        }`}>
                          <span className={match.winnerId === match.player1Id ? 'font-bold' : ''}>
                            {player1?.username || 'TBD'}
                          </span>
                          <span>{match.player1Score}</span>
                        </div>
                        <div className={`flex justify-between items-center p-2 rounded ${
                          match.winnerId === match.player2Id ? 'bg-green-900/30' : ''
                        }`}>
                          <span className={match.winnerId === match.player2Id ? 'font-bold' : ''}>
                            {player2?.username || 'TBD'}
                          </span>
                          <span>{match.player2Score}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
