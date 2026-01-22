import { useEffect, useState } from 'react';
import { api } from '../../services/api';

type SuspensionType = 'WARNING' | 'MUTE' | 'TEMPORARY_BAN' | 'PERMANENT_BAN';

interface Suspension {
  id: string;
  type: SuspensionType;
  reason: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  user: { id: string; username: string };
  issuedByUser: { id: string; username: string } | null;
}

interface UserSearchResult {
  id: string;
  username: string;
  email: string;
}

const TYPE_OPTIONS: { value: SuspensionType; label: string }[] = [
  { value: 'WARNING', label: 'Warning' },
  { value: 'MUTE', label: 'Mute' },
  { value: 'TEMPORARY_BAN', label: 'Temporary Ban' },
  { value: 'PERMANENT_BAN', label: 'Permanent Ban' },
];

const TYPE_STYLES: Record<SuspensionType, string> = {
  WARNING: 'bg-yellow-600/20 text-yellow-400',
  MUTE: 'bg-orange-600/20 text-orange-400',
  TEMPORARY_BAN: 'bg-red-600/20 text-red-400',
  PERMANENT_BAN: 'bg-red-900/40 text-red-300',
};

export default function AdminSuspensions() {
  const [suspensions, setSuspensions] = useState<Suspension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('active');

  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [formData, setFormData] = useState({
    type: 'WARNING' as SuspensionType,
    reason: '',
    duration: '',
  });

  const loadSuspensions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter === 'active') params.set('active', 'true');
      if (activeFilter === 'inactive') params.set('active', 'false');
      const response = await api.get<{ suspensions: Suspension[] }>(`/admin/suspensions?${params}`);
      setSuspensions(response.data.suspensions);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load suspensions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuspensions();
  }, [activeFilter]);

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setUserSearchResults([]);
      return;
    }
    try {
      const response = await api.get<{ users: UserSearchResult[] }>(`/admin/users?search=${query}&limit=5`);
      setUserSearchResults(response.data.users);
    } catch (err) {
      console.error('Failed to search users:', err);
    }
  };

  const handleCreate = async () => {
    if (!selectedUser) {
      alert('Please select a user');
      return;
    }
    if (!formData.reason) {
      alert('Please provide a reason');
      return;
    }

    try {
      let expiresAt = null;
      if (formData.duration && formData.type !== 'PERMANENT_BAN') {
        const hours = parseInt(formData.duration);
        if (!isNaN(hours)) {
          expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }
      }

      await api.post('/admin/suspensions', {
        userId: selectedUser.id,
        type: formData.type,
        reason: formData.reason,
        expiresAt,
      });

      setIsCreating(false);
      setSelectedUser(null);
      setUserSearch('');
      setFormData({ type: 'WARNING', reason: '', duration: '' });
      loadSuspensions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create suspension');
    }
  };

  const handleRevoke = async (suspensionId: string) => {
    if (!confirm('Are you sure you want to revoke this suspension?')) return;
    try {
      await api.patch(`/admin/suspensions/${suspensionId}/revoke`);
      loadSuspensions();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to revoke suspension');
    }
  };

  const formatDuration = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Permanent';
    const expires = new Date(expiresAt);
    const now = new Date();
    if (expires < now) return 'Expired';
    const diff = expires.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
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
        <h1 className="text-3xl font-bold">Suspensions</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          Create Suspension
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveFilter('')}
            className={`px-4 py-2 rounded ${!activeFilter ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter('active')}
            className={`px-4 py-2 rounded ${activeFilter === 'active' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveFilter('inactive')}
            className={`px-4 py-2 rounded ${activeFilter === 'inactive' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            Inactive/Expired
          </button>
        </div>
      </div>

      {/* Suspensions List */}
      <div className="space-y-4">
        {suspensions.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No suspensions found</p>
          </div>
        ) : (
          suspensions.map((suspension) => (
            <div key={suspension.id} className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-semibold">{suspension.user.username}</span>
                    <span className={`px-2 py-1 rounded text-xs ${TYPE_STYLES[suspension.type]}`}>
                      {TYPE_OPTIONS.find(t => t.value === suspension.type)?.label}
                    </span>
                    {suspension.isActive ? (
                      <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{suspension.reason}</p>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Duration: {formatDuration(suspension.expiresAt)}</span>
                    <span>Issued: {new Date(suspension.createdAt).toLocaleString()}</span>
                    {suspension.issuedByUser && (
                      <span>By: {suspension.issuedByUser.username}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {suspension.isActive && (
                    <button
                      onClick={() => handleRevoke(suspension.id)}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create Suspension</h3>

            <div className="space-y-4">
              {/* User Search */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">User *</label>
                {selectedUser ? (
                  <div className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
                    <span className="text-white">{selectedUser.username}</span>
                    <button
                      onClick={() => {
                        setSelectedUser(null);
                        setUserSearch('');
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        searchUsers(e.target.value);
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="Search for user..."
                    />
                    {userSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-gray-700 border border-gray-600 rounded mt-1 z-10">
                        {userSearchResults.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => {
                              setSelectedUser(user);
                              setUserSearchResults([]);
                              setUserSearch('');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-600"
                          >
                            <span className="text-white">{user.username}</span>
                            <span className="text-gray-400 text-sm ml-2">{user.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as SuspensionType })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {formData.type !== 'PERMANENT_BAN' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Duration (hours)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder="Leave empty for permanent"
                    min={1}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Reason *</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="Reason for suspension..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleCreate}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                Create Suspension
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setSelectedUser(null);
                  setUserSearch('');
                  setFormData({ type: 'WARNING', reason: '', duration: '' });
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
