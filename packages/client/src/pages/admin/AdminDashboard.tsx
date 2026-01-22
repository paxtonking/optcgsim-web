import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

interface DashboardStats {
  totalUsers: number;
  totalMatches: number;
  totalDecks: number;
  activeToday: number;
  matchesToday: number;
}

interface RecentUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  eloRating: number;
  gamesPlayed: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await api.get<{ stats: DashboardStats; recentUsers: RecentUser[] }>('/admin/stats');
        setStats(response.data.stats);
        setRecentUsers(response.data.recentUsers);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

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
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Users" value={stats?.totalUsers || 0} />
        <StatCard label="Total Matches" value={stats?.totalMatches || 0} />
        <StatCard label="Total Decks" value={stats?.totalDecks || 0} />
        <StatCard label="Active Today" value={stats?.activeToday || 0} color="green" />
        <StatCard label="Matches Today" value={stats?.matchesToday || 0} color="blue" />
      </div>

      {/* Quick Links */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Link
          to="/admin/users"
          className="bg-gray-800 hover:bg-gray-700 p-6 rounded-lg transition-colors"
        >
          <h3 className="text-lg font-semibold mb-2">User Management</h3>
          <p className="text-gray-400 text-sm">View, search, and manage user accounts</p>
        </Link>
        <Link
          to="/admin/analytics"
          className="bg-gray-800 hover:bg-gray-700 p-6 rounded-lg transition-colors"
        >
          <h3 className="text-lg font-semibold mb-2">Analytics</h3>
          <p className="text-gray-400 text-sm">View match statistics and trends</p>
        </Link>
        <Link
          to="/admin/cards"
          className="bg-gray-800 hover:bg-gray-700 p-6 rounded-lg transition-colors"
        >
          <h3 className="text-lg font-semibold mb-2">Card Sets</h3>
          <p className="text-gray-400 text-sm">Manage card sets and releases</p>
        </Link>
      </div>

      {/* Recent Users */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent Users</h2>
          <Link to="/admin/users" className="text-red-500 hover:text-red-400 text-sm">
            View All
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                <th className="pb-3">Username</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">ELO</th>
                <th className="pb-3">Games</th>
                <th className="pb-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="py-3">
                    <Link
                      to={`/admin/users/${user.id}`}
                      className="text-white hover:text-red-400"
                    >
                      {user.username}
                    </Link>
                  </td>
                  <td className="py-3 text-gray-400">{user.email}</td>
                  <td className="py-3">{user.eloRating}</td>
                  <td className="py-3">{user.gamesPlayed}</td>
                  <td className="py-3 text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'white',
}: {
  label: string;
  value: number;
  color?: 'white' | 'green' | 'blue';
}) {
  const colorClasses = {
    white: 'text-white',
    green: 'text-green-400',
    blue: 'text-blue-400',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
