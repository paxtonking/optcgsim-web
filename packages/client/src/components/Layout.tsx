import { useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { connectSocket, disconnectSocket } from '../services/socket';
import { setupLobbySocketListeners, cleanupLobbySocketListeners } from '../stores/lobbyStore';

export default function Layout() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Connect socket and set up listeners when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
      setupLobbySocketListeners();
    }

    return () => {
      if (!isAuthenticated) {
        cleanupLobbySocketListeners();
        disconnectSocket();
      }
    };
  }, [isAuthenticated]);

  const handleLogout = async () => {
    disconnectSocket();
    await logout();
    navigate('/');
  };

  return (
    <div className="site-shell flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/" className="flex items-center shrink-0">
                <span className="text-xl font-extrabold text-sand tracking-tight">
                  Davy Back Duels
                </span>
              </Link>

              {/* Main Nav */}
              <div className="hidden md:flex items-center gap-1">
                <Link to="/lobby" className="nav-link">
                  Play
                </Link>
                <Link to="/decks" className="nav-link">
                  Deck Builder
                </Link>
                <Link to="/browse/decks" className="nav-link">
                  Browse Decks
                </Link>
                <Link to="/cards" className="nav-link">
                  Cards
                </Link>
                <Link to="/leaderboard" className="nav-link">
                  Leaderboard
                </Link>
                <Link to="/tournaments" className="nav-link">
                  Tournaments
                </Link>
                <Link to="/game-modes" className="nav-link">
                  Game Modes
                </Link>
              </div>
            </div>

            {/* User Section */}
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  {user?.isAdmin && (
                    <Link
                      to="/admin"
                      className="px-3 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    to="/profile"
                    className="text-muted hover:text-sand transition-colors text-sm font-medium"
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
                  <Link to="/login" className="text-sand hover:text-muted transition-colors text-sm font-medium px-4 py-2">
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
      <footer className="bg-surface/80 border-t border-border/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sand">Davy Back Duels</span>
              <span className="text-muted-dark text-sm">Fan-made One Piece TCG Simulator</span>
            </div>

            {/* Contact Links */}
            <div className="flex items-center gap-4">
              <a
                href="https://x.com/DavyBackDuels"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted hover:text-sand transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>Twitter</span>
              </a>
              <a
                href="mailto:info@davybackduels.com"
                className="flex items-center gap-1.5 text-muted hover:text-sand transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Report Bug</span>
              </a>
            </div>

            <p className="text-muted-dark text-xs">
              Not affiliated with Bandai or Shueisha
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
