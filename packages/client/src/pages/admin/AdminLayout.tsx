import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function AdminLayout() {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  // Check if user is authenticated and is admin
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user?.isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-4 text-red-500">Access Denied</h1>
        <p className="text-gray-400 mb-8">
          You do not have permission to access the admin dashboard.
        </p>
        <Link
          to="/"
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium"
        >
          Return Home
        </Link>
      </div>
    );
  }

  const navItems = [
    { path: '/admin', label: 'Dashboard', exact: true },
    { path: '/admin/users', label: 'Users' },
    { path: '/admin/analytics', label: 'Analytics' },
    { path: '/admin/cards', label: 'Card Sets' },
    { path: '/admin/announcements', label: 'Announcements' },
  ];

  const isActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Admin Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/admin" className="text-xl font-bold text-red-500">
                Admin Panel
              </Link>
              <nav className="flex gap-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                      isActive(item.path, item.exact)
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">
                Logged in as <span className="text-white">{user.username}</span>
              </span>
              <Link
                to="/"
                className="text-gray-400 hover:text-white text-sm"
              >
                Exit Admin
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
