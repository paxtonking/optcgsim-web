import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LobbyPage from './pages/LobbyPage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import GamePage from './pages/GamePage';
import CardsPage from './pages/CardsPage';
import DecksPage from './pages/DecksPage';
import ReplayPage from './pages/ReplayPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminCardSets from './pages/admin/AdminCardSets';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminAnnouncements from './pages/admin/AdminAnnouncements';
import AdminTournaments from './pages/admin/AdminTournaments';
import AdminReports from './pages/admin/AdminReports';
import AdminSuspensions from './pages/admin/AdminSuspensions';
import TournamentsPage from './pages/TournamentsPage';
import TournamentDetailPage from './pages/TournamentDetailPage';
import GameModesPage from './pages/GameModesPage';

function App() {
  const { isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="lobby" element={<LobbyPage />} />
        <Route path="decks" element={<DeckBuilderPage />} />
        <Route path="decks/:id" element={<DeckBuilderPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/:id" element={<ProfilePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="browse/decks" element={<DecksPage />} />
        <Route path="replay/:matchId" element={<ReplayPage />} />
        <Route path="tournaments" element={<TournamentsPage />} />
        <Route path="tournaments/:id" element={<TournamentDetailPage />} />
        <Route path="game-modes" element={<GameModesPage />} />
        <Route path="game-modes/*" element={<GameModesPage />} />
      </Route>
      <Route path="/game/:id" element={<GamePage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="cards" element={<AdminCardSets />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="tournaments" element={<AdminTournaments />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="suspensions" element={<AdminSuspensions />} />
      </Route>
    </Routes>
  );
}

export default App;
