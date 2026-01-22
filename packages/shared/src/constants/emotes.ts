// Quick chat messages and emotes for OPTCG
export const QUICK_MESSAGES = [
  { id: 'gl', label: 'Good luck!', message: 'Good luck!' },
  { id: 'gg', label: 'GG', message: 'Good game!' },
  { id: 'nice', label: 'Nice!', message: 'Nice play!' },
  { id: 'thanks', label: 'Thanks', message: 'Thanks!' },
  { id: 'oops', label: 'Oops', message: 'Oops!' },
  { id: 'thinking', label: 'Thinking...', message: 'Let me think...' },
  { id: 'sorry', label: 'Sorry', message: 'Sorry!' },
  { id: 'wp', label: 'WP', message: 'Well played!' },
] as const;

// Character emotes inspired by One Piece
export const CHARACTER_EMOTES = [
  { id: 'luffy_smile', label: 'Luffy Smile', emoji: '😄' },
  { id: 'zoro_cool', label: 'Zoro Cool', emoji: '😎' },
  { id: 'nami_angry', label: 'Nami Angry', emoji: '😤' },
  { id: 'sanji_love', label: 'Sanji Love', emoji: '😍' },
  { id: 'chopper_happy', label: 'Chopper Happy', emoji: '🥳' },
  { id: 'robin_thinking', label: 'Robin Thinking', emoji: '🤔' },
  { id: 'franky_super', label: 'Franky Super', emoji: '💪' },
  { id: 'brook_laugh', label: 'Brook Laugh', emoji: '💀' },
] as const;

// Combined emote set
export const ALL_EMOTES = [
  ...QUICK_MESSAGES.map(qm => ({
    id: qm.id,
    label: qm.label,
    type: 'quick' as const,
    message: qm.message,
  })),
  ...CHARACTER_EMOTES.map(ce => ({
    id: ce.id,
    label: ce.label,
    type: 'emoji' as const,
    emoji: ce.emoji,
  })),
];

export type QuickMessage = typeof QUICK_MESSAGES[number];
export type CharacterEmote = typeof CHARACTER_EMOTES[number];
export type Emote = typeof ALL_EMOTES[number];
