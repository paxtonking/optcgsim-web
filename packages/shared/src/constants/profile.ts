// Avatar options for user profiles
export const AVATARS = [
  { id: 'default', name: 'Default', color: '#6B7280' },
  { id: 'luffy', name: 'Straw Hat', color: '#DC2626' },
  { id: 'zoro', name: 'Swordsman', color: '#16A34A' },
  { id: 'nami', name: 'Navigator', color: '#F97316' },
  { id: 'sanji', name: 'Chef', color: '#EAB308' },
  { id: 'chopper', name: 'Doctor', color: '#EC4899' },
  { id: 'robin', name: 'Archaeologist', color: '#8B5CF6' },
  { id: 'franky', name: 'Shipwright', color: '#06B6D4' },
  { id: 'brook', name: 'Musician', color: '#1F2937' },
  { id: 'jinbe', name: 'Helmsman', color: '#2563EB' },
  { id: 'ace', name: 'Fire Fist', color: '#F59E0B' },
  { id: 'whitebeard', name: 'Emperor', color: '#FBBF24' },
  { id: 'shanks', name: 'Red Hair', color: '#EF4444' },
  { id: 'kaido', name: 'Beast', color: '#7C3AED' },
  { id: 'bigmom', name: 'Sweet', color: '#F472B6' },
  { id: 'law', name: 'Surgeon', color: '#FBBF24' },
] as const;

// Badge definitions
export const BADGES = [
  // Progression badges
  { id: 'newcomer', name: 'Newcomer', description: 'Play your first match', icon: '🌟', rarity: 'common' },
  { id: 'veteran', name: 'Veteran', description: 'Play 100 matches', icon: '⭐', rarity: 'rare' },
  { id: 'legend', name: 'Legend', description: 'Play 500 matches', icon: '💫', rarity: 'epic' },

  // Win streak badges
  { id: 'winning_streak_5', name: 'Hot Streak', description: 'Win 5 matches in a row', icon: '🔥', rarity: 'common' },
  { id: 'winning_streak_10', name: 'Unstoppable', description: 'Win 10 matches in a row', icon: '💥', rarity: 'rare' },

  // Rank badges
  { id: 'rank_silver', name: 'Silver Player', description: 'Reach Silver rank', icon: '🥈', rarity: 'common' },
  { id: 'rank_gold', name: 'Gold Player', description: 'Reach Gold rank', icon: '🥇', rarity: 'rare' },
  { id: 'rank_platinum', name: 'Platinum Player', description: 'Reach Platinum rank', icon: '💎', rarity: 'rare' },
  { id: 'rank_diamond', name: 'Diamond Player', description: 'Reach Diamond rank', icon: '💠', rarity: 'epic' },
  { id: 'rank_master', name: 'Master Player', description: 'Reach Master rank', icon: '👑', rarity: 'legendary' },

  // Special badges
  { id: 'deck_builder', name: 'Deck Builder', description: 'Create 5 different decks', icon: '📚', rarity: 'common' },
  { id: 'friendly', name: 'Friendly', description: 'Add 10 friends', icon: '🤝', rarity: 'common' },
  { id: 'spectator', name: 'Spectator', description: 'Watch 10 matches', icon: '👁️', rarity: 'common' },
  { id: 'early_adopter', name: 'Early Adopter', description: 'Joined during beta', icon: '🎮', rarity: 'epic' },
] as const;

// Badge rarity colors
export const BADGE_RARITY_COLORS = {
  common: 'text-gray-400 border-gray-500',
  rare: 'text-blue-400 border-blue-500',
  epic: 'text-purple-400 border-purple-500',
  legendary: 'text-yellow-400 border-yellow-500',
} as const;

export type Avatar = typeof AVATARS[number];
export type Badge = typeof BADGES[number];
export type BadgeRarity = keyof typeof BADGE_RARITY_COLORS;
