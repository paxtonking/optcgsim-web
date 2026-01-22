import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDeckStore } from '../stores/deckStore';
import { CardDisplay } from '../components/CardDisplay';
import { ProfileCustomization, AvatarDisplay } from '../components/ProfileCustomization';
import ReportUserModal from '../components/ReportUserModal';
import { api } from '../services/api';

function getRankInfo(elo: number) {
  if (elo >= 1800) return { name: 'Master', color: '#FFD700', icon: '♔' };
  if (elo >= 1600) return { name: 'Diamond', color: '#B9F2FF', icon: '♦' };
  if (elo >= 1400) return { name: 'Platinum', color: '#E5E4E2', icon: '✦' };
  if (elo >= 1200) return { name: 'Gold', color: '#FFD700', icon: '★' };
  if (elo >= 1000) return { name: 'Silver', color: '#C0C0C0', icon: '☆' };
  return { name: 'Bronze', color: '#CD7F32', icon: '○' };
}

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="bg-gray-700 rounded-lg p-4 text-center">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtext && <p className="text-gray-500 text-xs mt-1">{subtext}</p>}
    </div>
  );
}

interface ProfileData {
  id: string;
  username: string;
  email?: string;
  avatarId: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  badges: string[];
  createdAt: string;
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { decks } = useDeckStore();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const isOwnProfile = !id || id === user?.id;

  useEffect(() => {
    if (id && id !== user?.id) {
      loadProfile(id);
    }
  }, [id, user?.id]);

  const loadProfile = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<ProfileData>(`/users/${userId}`);
      setProfileData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-4">Login Required</h1>
        <p className="text-gray-400 mb-8">
          You need to be logged in to view profiles.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium"
        >
          Login
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-4 text-red-500">Error</h1>
        <p className="text-gray-400 mb-8">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Use profile data from API for other users, or own user data
  const displayUser = isOwnProfile ? user : profileData;
  if (!displayUser) {
    return null;
  }

  const [localAvatarId, setLocalAvatarId] = useState(displayUser.avatarId || 'default');
  const avatarId = isOwnProfile ? localAvatarId : (displayUser.avatarId || 'default');
  const rankInfo = getRankInfo(displayUser.eloRating || 1000);
  const gamesPlayed = displayUser.gamesPlayed || 0;
  const gamesWon = displayUser.gamesWon || 0;
  const winRate = gamesPlayed > 0 ? ((gamesWon / gamesPlayed) * 100).toFixed(1) : '0.0';
  const badges = displayUser.badges || [];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <AvatarDisplay avatarId={avatarId} size="lg" className="w-24 h-24 text-4xl" />

            <div>
              <h1 className="text-3xl font-bold text-white">{displayUser.username}</h1>
              {isOwnProfile && <p className="text-gray-400">{user.email}</p>}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${rankInfo.color}20`, color: rankInfo.color }}
                >
                  {rankInfo.icon} {rankInfo.name}
                </span>
                <span className="text-gray-400 text-sm">
                  {user.eloRating || 1000} ELO
                </span>
              </div>
            </div>
          </div>

          {isOwnProfile ? (
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReportModal(true)}
                className="bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded"
              >
                Report User
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Games Played" value={gamesPlayed} />
        <StatCard label="Games Won" value={gamesWon} />
        <StatCard label="Win Rate" value={`${winRate}%`} />
        <StatCard label="ELO Rating" value={user.eloRating || 1000} subtext={rankInfo.name} />
      </div>

      {/* Recent Activity / Match History */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* My Decks */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">My Decks</h2>
            <button
              onClick={() => navigate('/decks')}
              className="text-red-500 hover:text-red-400 text-sm"
            >
              View All
            </button>
          </div>

          {decks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">You haven't created any decks yet.</p>
              <button
                onClick={() => navigate('/decks')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Create Deck
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {decks.slice(0, 5).map(deck => {
                const cardCount = deck.cards.reduce((s, c) => s + c.count, 0);
                const isValid = deck.leader && cardCount === 50;

                return (
                  <div
                    key={deck.id}
                    onClick={() => navigate('/decks')}
                    className="flex items-center gap-3 bg-gray-700 rounded p-3 hover:bg-gray-600 cursor-pointer"
                  >
                    {deck.leader ? (
                      <CardDisplay card={deck.leader} size="sm" />
                    ) : (
                      <div className="w-16 h-22 bg-gray-600 rounded flex items-center justify-center text-gray-400 text-xs">
                        No Leader
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{deck.name}</p>
                      <p className="text-gray-400 text-sm">
                        {deck.leader?.name || 'No leader'} | {cardCount}/50 cards
                      </p>
                    </div>
                    {isValid ? (
                      <span className="text-green-400 text-sm">Valid</span>
                    ) : (
                      <span className="text-yellow-400 text-sm">Invalid</span>
                    )}
                  </div>
                );
              })}
              {decks.length > 5 && (
                <p className="text-gray-500 text-sm text-center">
                  +{decks.length - 5} more decks
                </p>
              )}
            </div>
          )}
        </div>

        {/* Match History */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Matches</h2>

          {gamesPlayed === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">You haven't played any matches yet.</p>
              <button
                onClick={() => navigate('/lobby')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Find a Match
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Placeholder match history */}
              <div className="text-center py-8">
                <p className="text-gray-400">Match history coming soon...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rank Progress */}
      <div className="bg-gray-800 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4">Rank Progress</h2>

        <div className="flex items-center gap-4">
          {/* Rank tiers */}
          {[
            { name: 'Bronze', min: 0, color: '#CD7F32' },
            { name: 'Silver', min: 1000, color: '#C0C0C0' },
            { name: 'Gold', min: 1200, color: '#FFD700' },
            { name: 'Platinum', min: 1400, color: '#E5E4E2' },
            { name: 'Diamond', min: 1600, color: '#B9F2FF' },
            { name: 'Master', min: 1800, color: '#FFD700' },
          ].map((tier, i) => {
            const elo = displayUser.eloRating || 1000;
            const isCurrentTier = elo >= tier.min && (i === 5 || elo < [0, 1000, 1200, 1400, 1600, 1800, Infinity][i + 1]);

            return (
              <div
                key={tier.name}
                className={`flex-1 text-center p-2 rounded ${isCurrentTier ? 'bg-gray-700 ring-2' : ''}`}
                style={isCurrentTier ? { '--tw-ring-color': tier.color } as React.CSSProperties : undefined}
              >
                <div
                  className={`text-2xl mb-1 ${isCurrentTier ? '' : 'opacity-50'}`}
                  style={{ color: tier.color }}
                >
                  {['○', '☆', '★', '✦', '♦', '♔'][i]}
                </div>
                <p className={`text-xs ${isCurrentTier ? 'text-white' : 'text-gray-500'}`}>
                  {tier.name}
                </p>
                <p className="text-xs text-gray-500">{tier.min}+</p>
              </div>
            );
          })}
        </div>

        {/* Progress bar to next rank */}
        <div className="mt-4">
          {(() => {
            const elo = displayUser.eloRating || 1000;
            const tiers = [0, 1000, 1200, 1400, 1600, 1800, Infinity];
            const currentTierIndex = tiers.findIndex((min, i) => elo >= min && elo < tiers[i + 1]);
            const currentMin = tiers[currentTierIndex];
            const nextMin = tiers[currentTierIndex + 1];

            if (nextMin === Infinity) {
              return (
                <p className="text-center text-gray-400 text-sm">
                  You've reached the highest rank!
                </p>
              );
            }

            const progress = ((elo - currentMin) / (nextMin - currentMin)) * 100;

            return (
              <>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{currentMin} ELO</span>
                  <span>{nextMin - elo} ELO to next rank</span>
                  <span>{nextMin} ELO</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Profile Customization - Only for own profile */}
      {isOwnProfile && (
        <div className="mt-6">
          <ProfileCustomization
            currentAvatarId={avatarId}
            currentBadges={badges}
            onAvatarChange={setLocalAvatarId}
          />
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && profileData && (
        <ReportUserModal
          targetId={profileData.id}
          targetUsername={profileData.username}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
