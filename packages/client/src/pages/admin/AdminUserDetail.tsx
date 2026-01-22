import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

interface UserDetail {
  id: string;
  username: string;
  email: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  isAdmin: boolean;
  avatarId: string | null;
  badges: string[];
  createdAt: string;
  updatedAt: string;
  decks: {
    id: string;
    name: string;
    leaderId: string | null;
    cardCount: number;
    createdAt: string;
  }[];
  recentMatches: {
    id: string;
    isRanked: boolean;
    winnerId: string | null;
    createdAt: string;
    opponent: string;
  }[];
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    eloRating: 0,
    isAdmin: false,
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await api.get<{ user: UserDetail }>(`/admin/users/${id}`);
        setUser(response.data.user);
        setEditForm({
          username: response.data.user.username,
          email: response.data.user.email,
          eloRating: response.data.user.eloRating,
          isAdmin: response.data.user.isAdmin,
        });
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load user');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      loadUser();
    }
  }, [id]);

  const handleSave = async () => {
    try {
      await api.patch(`/admin/users/${id}`, editForm);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              ...editForm,
            }
          : null
      );
      setIsEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete user "${user?.username}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/admin/users/${id}`);
      navigate('/admin/users');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleResetElo = async () => {
    if (!confirm('Are you sure you want to reset this user\'s ELO rating to 1000?')) {
      return;
    }

    try {
      await api.patch(`/admin/users/${id}`, { eloRating: 1000 });
      setUser((prev) => (prev ? { ...prev, eloRating: 1000 } : null));
      setEditForm((prev) => ({ ...prev, eloRating: 1000 }));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reset ELO');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">{error || 'User not found'}</p>
        <Link to="/admin/users" className="text-gray-400 hover:text-white">
          ← Back to Users
        </Link>
      </div>
    );
  }

  const winRate = user.gamesPlayed > 0
    ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
    : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Details</h1>
        <Link to="/admin/users" className="text-gray-400 hover:text-white">
          ← Back to Users
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* User Info Card */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="text-2xl font-bold bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
                />
              ) : (
                <h2 className="text-2xl font-bold">{user.username}</h2>
              )}
              {isEditing ? (
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="text-gray-400 bg-gray-700 border border-gray-600 rounded px-2 py-1 mt-1"
                />
              ) : (
                <p className="text-gray-400">{user.email}</p>
              )}
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">ELO Rating</p>
              {isEditing ? (
                <input
                  type="number"
                  value={editForm.eloRating}
                  onChange={(e) => setEditForm({ ...editForm, eloRating: parseInt(e.target.value) || 0 })}
                  className="text-xl font-bold bg-gray-600 border border-gray-500 rounded px-2 py-1 w-full mt-1"
                />
              ) : (
                <p className="text-2xl font-bold">{user.eloRating}</p>
              )}
            </div>
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">Games Played</p>
              <p className="text-2xl font-bold">{user.gamesPlayed}</p>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">Games Won</p>
              <p className="text-2xl font-bold text-green-400">{user.gamesWon}</p>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">Win Rate</p>
              <p className="text-2xl font-bold">{winRate}%</p>
            </div>
          </div>

          {/* Role & Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Role:</span>
              {isEditing ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.isAdmin}
                    onChange={(e) => setEditForm({ ...editForm, isAdmin: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Admin</span>
                </label>
              ) : user.isAdmin ? (
                <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-sm">
                  Admin
                </span>
              ) : (
                <span className="text-gray-300">User</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Joined:</span>
              <span>{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            {!isEditing && (
              <button
                onClick={handleResetElo}
                className="text-sm text-orange-400 hover:text-orange-300"
              >
                Reset ELO
              </button>
            )}
          </div>
        </div>

        {/* Decks Card */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Decks ({user.decks.length})</h3>
          {user.decks.length === 0 ? (
            <p className="text-gray-400 text-sm">No decks created</p>
          ) : (
            <div className="space-y-3">
              {user.decks.slice(0, 5).map((deck) => (
                <div key={deck.id} className="bg-gray-700 rounded p-3">
                  <p className="font-medium">{deck.name}</p>
                  <div className="flex justify-between text-sm text-gray-400 mt-1">
                    <span>{deck.leaderId || 'No leader'}</span>
                    <span>{deck.cardCount} cards</span>
                  </div>
                </div>
              ))}
              {user.decks.length > 5 && (
                <p className="text-gray-400 text-sm text-center">
                  +{user.decks.length - 5} more decks
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Matches */}
      <div className="mt-6 bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Matches</h3>
        {user.recentMatches.length === 0 ? (
          <p className="text-gray-400">No matches played</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Opponent</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {user.recentMatches.map((match) => (
                  <tr key={match.id} className="border-b border-gray-700/50">
                    <td className="py-3 text-gray-400">
                      {new Date(match.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">{match.opponent}</td>
                    <td className="py-3">
                      {match.isRanked ? (
                        <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-sm">
                          Ranked
                        </span>
                      ) : (
                        <span className="text-gray-400">Casual</span>
                      )}
                    </td>
                    <td className="py-3">
                      {match.winnerId === user.id ? (
                        <span className="text-green-400">Won</span>
                      ) : match.winnerId ? (
                        <span className="text-red-400">Lost</span>
                      ) : (
                        <span className="text-gray-400">Draw</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
