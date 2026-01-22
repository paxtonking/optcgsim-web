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
import ReplayPage from './pages/ReplayPage';

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
        <Route path="replay/:matchId" element={<ReplayPage />} />
      </Route>
      <Route path="/game/:id" element={<GamePage />} />
    </Routes>
  );
}

export default App;
