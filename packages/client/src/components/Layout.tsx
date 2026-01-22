import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="bg-surface border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/" className="flex items-center">
                <span className="font-display text-2xl text-accent">OPTCGSIM</span>
              </Link>

              {/* Main Nav */}
              <div className="hidden md:flex items-center gap-6">
                <Link
                  to="/lobby"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Play
                </Link>
                <Link
                  to="/decks"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Deck Builder
                </Link>
                <Link
                  to="/cards"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Cards
                </Link>
                <Link
                  to="/browse/decks"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Browse Decks
                </Link>
                <Link
                  to="/leaderboard"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Leaderboard
                </Link>
                <Link
                  to="/tournaments"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Tournaments
                </Link>
                <Link
                  to="/game-modes"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Game Modes
                </Link>
              </div>
            </div>

            {/* User Section */}
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  {user?.isAdmin && (
                    <Link
                      to="/admin"
                      className="text-yellow-400 hover:text-yellow-300 transition-colors text-sm"
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    to="/profile"
                    className="text-gray-300 hover:text-white transition-colors"
                  >
                    {user?.username}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="btn-secondary text-sm"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary text-sm">
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary text-sm">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-surface border-t border-gray-700 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-gray-400 text-sm">
              OPTCGSim - Fan-made One Piece TCG Simulator
            </p>
            <p className="text-gray-500 text-sm">
              Not affiliated with Bandai or Shueisha
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
