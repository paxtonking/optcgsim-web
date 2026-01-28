import { useState } from 'react';
import { AVATARS, BADGES, BADGE_RARITY_COLORS } from '@optcgsim/shared';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface ProfileCustomizationProps {
  currentAvatarId: string;
  currentBadges: string[];
  onAvatarChange?: (avatarId: string) => void;
}

export function ProfileCustomization({
  currentAvatarId,
  currentBadges,
  onAvatarChange,
}: ProfileCustomizationProps) {
  const { user } = useAuthStore();
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatarId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'avatar' | 'badges'>('avatar');

  const handleAvatarSelect = async (avatarId: string) => {
    setSelectedAvatar(avatarId);

    try {
      setIsSaving(true);
      await api.patch('/users/me', { avatarId });
      onAvatarChange?.(avatarId);
    } catch (error) {
      console.error('Failed to update avatar:', error);
      setSelectedAvatar(currentAvatarId); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarById = (id: string) => {
    return AVATARS.find((a) => a.id === id) || AVATARS[0];
  };

  const getBadgeById = (id: string) => {
    return BADGES.find((b) => b.id === id);
  };

  const earnedBadges = currentBadges
    .map(getBadgeById)
    .filter((b): b is NonNullable<typeof b> => b !== undefined);

  const unearnedBadges = BADGES.filter(
    (b) => !currentBadges.includes(b.id)
  );

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('avatar')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'avatar'
              ? 'text-white border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Avatar
        </button>
        <button
          onClick={() => setActiveTab('badges')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'badges'
              ? 'text-white border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Badges ({earnedBadges.length}/{BADGES.length})
        </button>
      </div>

      {/* Avatar Tab */}
      {activeTab === 'avatar' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Select Avatar</h3>

          {/* Current avatar preview */}
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-700 rounded-lg">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
              style={{ backgroundColor: getAvatarById(selectedAvatar).color }}
            >
              {getAvatarById(selectedAvatar).name.charAt(0)}
            </div>
            <div>
              <p className="text-white font-medium">{getAvatarById(selectedAvatar).name}</p>
              <p className="text-gray-400 text-sm">Current avatar</p>
            </div>
            {isSaving && (
              <span className="ml-auto text-gray-400 text-sm">Saving...</span>
            )}
          </div>

          {/* Avatar grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => handleAvatarSelect(avatar.id)}
                className={`relative w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white transition-all ${
                  selectedAvatar === avatar.id
                    ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-gray-800'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: avatar.color }}
                title={avatar.name}
              >
                {avatar.name.charAt(0)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Badges Tab */}
      {activeTab === 'badges' && (
        <div className="relative">
          {/* Coming Soon overlay for non-admins */}
          {!user?.isAdmin && (
            <div className="absolute inset-0 bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
              <span className="bg-yellow-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                Coming Soon
              </span>
            </div>
          )}
          <div className={!user?.isAdmin ? 'opacity-40 pointer-events-none select-none' : ''}>
            <h3 className="text-lg font-semibold mb-4">Your Badges</h3>

            {/* Earned badges */}
            {earnedBadges.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-gray-400 mb-3">Earned</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {earnedBadges.map((badge) => (
                    <div
                      key={badge.id}
                      className={`flex items-center gap-3 p-3 bg-gray-700 rounded-lg border ${
                        BADGE_RARITY_COLORS[badge.rarity as keyof typeof BADGE_RARITY_COLORS]
                      }`}
                    >
                      <span className="text-2xl">{badge.icon}</span>
                      <div>
                        <p className="font-medium text-white">{badge.name}</p>
                        <p className="text-xs text-gray-400">{badge.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Locked badges */}
            <div>
              <p className="text-sm text-gray-400 mb-3">Locked</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {unearnedBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg border border-gray-600 opacity-60"
                  >
                    <span className="text-2xl grayscale">{badge.icon}</span>
                    <div>
                      <p className="font-medium text-gray-400">{badge.name}</p>
                      <p className="text-xs text-gray-500">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {earnedBadges.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No badges earned yet. Play games and complete achievements to earn badges!
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Avatar display component for use in other parts of the app
export function AvatarDisplay({
  avatarId,
  size = 'md',
  className = '',
}: {
  avatarId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const avatar = AVATARS.find((a) => a.id === avatarId) || AVATARS[0];

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-2xl',
  };

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: avatar.color }}
      title={avatar.name}
    >
      {avatar.name.charAt(0)}
    </div>
  );
}
