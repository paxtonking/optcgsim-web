import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

interface User {
  id: string;
  username: string;
  email: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy,
        sortOrder,
      });
      if (search) params.set('search', search);

      const response = await api.get<{ users: User[]; pagination: Pagination }>(
        `/admin/users?${params}`
      );
      setUsers(response.data.users);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [search, sortBy, sortOrder]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user "${user.username}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/admin/users/${user.id}`);
      loadUsers(pagination?.page || 1);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleToggleAdmin = async (user: User) => {
    const action = user.isAdmin ? 'remove admin privileges from' : 'grant admin privileges to';
    if (!confirm(`Are you sure you want to ${action} "${user.username}"?`)) {
      return;
    }

    try {
      await api.patch(`/admin/users/${user.id}`, { isAdmin: !user.isAdmin });
      loadUsers(pagination?.page || 1);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <Link to="/admin" className="text-gray-400 hover:text-white">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by username or email..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchInput('');
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-900">
                <th
                  className="p-4 cursor-pointer hover:text-white"
                  onClick={() => handleSort('username')}
                >
                  Username <SortIcon column="username" />
                </th>
                <th className="p-4">Email</th>
                <th
                  className="p-4 cursor-pointer hover:text-white"
                  onClick={() => handleSort('eloRating')}
                >
                  ELO <SortIcon column="eloRating" />
                </th>
                <th
                  className="p-4 cursor-pointer hover:text-white"
                  onClick={() => handleSort('gamesPlayed')}
                >
                  Games <SortIcon column="gamesPlayed" />
                </th>
                <th className="p-4">Win Rate</th>
                <th className="p-4">Role</th>
                <th
                  className="p-4 cursor-pointer hover:text-white"
                  onClick={() => handleSort('createdAt')}
                >
                  Joined <SortIcon column="createdAt" />
                </th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-gray-700 hover:bg-gray-700/30"
                  >
                    <td className="p-4">
                      <button
                        onClick={() => navigate(`/admin/users/${user.id}`)}
                        className="text-white hover:text-red-400 font-medium"
                      >
                        {user.username}
                      </button>
                    </td>
                    <td className="p-4 text-gray-400">{user.email}</td>
                    <td className="p-4">{user.eloRating}</td>
                    <td className="p-4">{user.gamesPlayed}</td>
                    <td className="p-4">
                      {user.gamesPlayed > 0
                        ? `${Math.round((user.gamesWon / user.gamesPlayed) * 100)}%`
                        : '-'}
                    </td>
                    <td className="p-4">
                      {user.isAdmin ? (
                        <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-sm">
                          Admin
                        </span>
                      ) : (
                        <span className="text-gray-400">User</span>
                      )}
                    </td>
                    <td className="p-4 text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleAdmin(user)}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-between items-center p-4 border-t border-gray-700">
            <p className="text-gray-400 text-sm">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} users
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loadUsers(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
