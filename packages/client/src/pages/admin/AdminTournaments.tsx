import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

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
  createdAt: string;
  _count: { participants: number; matches: number };
}

const STATUS_OPTIONS: TournamentStatus[] = ['DRAFT', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const FORMAT_OPTIONS: { value: TournamentFormat; label: string }[] = [
  { value: 'SINGLE_ELIMINATION', label: 'Single Elimination' },
  { value: 'DOUBLE_ELIMINATION', label: 'Double Elimination' },
  { value: 'SWISS', label: 'Swiss' },
  { value: 'ROUND_ROBIN', label: 'Round Robin' },
];

const STATUS_STYLES: Record<TournamentStatus, string> = {
  DRAFT: 'bg-gray-600/20 text-gray-400',
  REGISTRATION: 'bg-green-600/20 text-green-400',
  IN_PROGRESS: 'bg-blue-600/20 text-blue-400',
  COMPLETED: 'bg-purple-600/20 text-purple-400',
  CANCELLED: 'bg-red-600/20 text-red-400',
};

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format: 'SINGLE_ELIMINATION' as TournamentFormat,
    maxParticipants: 32,
    minParticipants: 4,
    registrationStart: '',
    registrationEnd: '',
    startDate: '',
    rules: '',
    prizes: '',
    isRanked: false,
    bestOf: 1,
  });

  const loadTournaments = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<{ tournaments: Tournament[] }>('/admin/tournaments');
      setTournaments(response.data.tournaments);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTournaments();
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      format: 'SINGLE_ELIMINATION',
      maxParticipants: 32,
      minParticipants: 4,
      registrationStart: '',
      registrationEnd: '',
      startDate: '',
      rules: '',
      prizes: '',
      isRanked: false,
      bestOf: 1,
    });
  };

  const handleCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleEdit = (tournament: Tournament) => {
    setFormData({
      name: tournament.name,
      description: tournament.description || '',
      format: tournament.format,
      maxParticipants: tournament.maxParticipants,
      minParticipants: tournament.minParticipants,
      registrationStart: tournament.registrationStart?.split('T')[0] || '',
      registrationEnd: tournament.registrationEnd?.split('T')[0] || '',
      startDate: tournament.startDate?.split('T')[0] || '',
      rules: '',
      prizes: '',
      isRanked: tournament.isRanked,
      bestOf: tournament.bestOf,
    });
    setEditingTournament(tournament);
  };

  const handleSave = async () => {
    try {
      if (editingTournament) {
        await api.patch(`/admin/tournaments/${editingTournament.id}`, {
          ...formData,
          registrationStart: formData.registrationStart || null,
          registrationEnd: formData.registrationEnd || null,
          startDate: formData.startDate || null,
        });
      } else {
        await api.post('/admin/tournaments', {
          ...formData,
          registrationStart: formData.registrationStart || null,
          registrationEnd: formData.registrationEnd || null,
          startDate: formData.startDate || null,
        });
      }
      setEditingTournament(null);
      setIsCreating(false);
      loadTournaments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save tournament');
    }
  };

  const handleDelete = async (tournament: Tournament) => {
    if (!confirm(`Are you sure you want to delete "${tournament.name}"?`)) return;
    try {
      await api.delete(`/admin/tournaments/${tournament.id}`);
      loadTournaments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete tournament');
    }
  };

  const handleStatusChange = async (tournament: Tournament, newStatus: TournamentStatus) => {
    try {
      await api.patch(`/admin/tournaments/${tournament.id}`, { status: newStatus });
      loadTournaments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleGenerateBracket = async (tournament: Tournament) => {
    if (!confirm('Generate bracket? This will start the tournament and cannot be undone.')) return;
    try {
      await api.post(`/admin/tournaments/${tournament.id}/generate-bracket`);
      loadTournaments();
      alert('Bracket generated successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate bracket');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Tournament Management</h1>
        <div className="flex gap-4">
          <button
            onClick={handleCreate}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Create Tournament
          </button>
          <Link to="/admin" className="text-gray-400 hover:text-white">
            Back to Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Tournaments List */}
      <div className="space-y-4">
        {tournaments.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No tournaments yet</p>
          </div>
        ) : (
          tournaments.map((tournament) => (
            <div key={tournament.id} className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{tournament.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs ${STATUS_STYLES[tournament.status]}`}>
                      {tournament.status}
                    </span>
                    {tournament.isRanked && (
                      <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">
                        Ranked
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-400">
                    <span>Format: {FORMAT_OPTIONS.find(f => f.value === tournament.format)?.label}</span>
                    <span>Players: {tournament._count.participants}/{tournament.maxParticipants}</span>
                    <span>Matches: {tournament._count.matches}</span>
                    {tournament.startDate && (
                      <span>Start: {new Date(tournament.startDate).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status Dropdown */}
                  <select
                    value={tournament.status}
                    onChange={(e) => handleStatusChange(tournament, e.target.value as TournamentStatus)}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  {tournament.status === 'REGISTRATION' && tournament._count.participants >= tournament.minParticipants && (
                    <button
                      onClick={() => handleGenerateBracket(tournament)}
                      className="text-sm text-green-400 hover:text-green-300"
                    >
                      Generate Bracket
                    </button>
                  )}
                  <Link
                    to={`/tournaments/${tournament.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleEdit(tournament)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(tournament)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingTournament) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingTournament ? 'Edit Tournament' : 'Create Tournament'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="Tournament name..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Format</label>
                  <select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as TournamentFormat })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Best Of</label>
                  <select
                    value={formData.bestOf}
                    onChange={(e) => setFormData({ ...formData, bestOf: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value={1}>Best of 1</option>
                    <option value={3}>Best of 3</option>
                    <option value={5}>Best of 5</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Min Participants</label>
                  <input
                    type="number"
                    value={formData.minParticipants}
                    onChange={(e) => setFormData({ ...formData, minParticipants: parseInt(e.target.value) || 4 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    min={2}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Participants</label>
                  <input
                    type="number"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) || 32 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    min={2}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Registration Start</label>
                  <input
                    type="date"
                    value={formData.registrationStart}
                    onChange={(e) => setFormData({ ...formData, registrationStart: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Registration End</label>
                  <input
                    type="date"
                    value={formData.registrationEnd}
                    onChange={(e) => setFormData({ ...formData, registrationEnd: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Rules</label>
                <textarea
                  value={formData.rules}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="Tournament rules..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Prizes</label>
                <textarea
                  value={formData.prizes}
                  onChange={(e) => setFormData({ ...formData, prizes: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="Prize information..."
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isRanked}
                    onChange={(e) => setFormData({ ...formData, isRanked: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-300">Ranked Tournament (affects ELO)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                {editingTournament ? 'Save Changes' : 'Create Tournament'}
              </button>
              <button
                onClick={() => {
                  setEditingTournament(null);
                  setIsCreating(false);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
