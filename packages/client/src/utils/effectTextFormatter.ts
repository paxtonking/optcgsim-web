/**
 * Effect Text Formatter
 *
 * Parses raw card effect text and separates it into categorized sections
 * for better display in UI components.
 */

export interface ParsedEffect {
  type: EffectCategory;
  label: string;
  text: string;
  icon?: string;
}

export type EffectCategory =
  | 'keyword'
  | 'on-play'
  | 'activate-main'
  | 'don-attached'
  | 'your-turn'
  | 'opponent-turn'
  | 'counter'
  | 'trigger'
  | 'on-attack'
  | 'when-attacking'
  | 'on-block'
  | 'on-ko'
  | 'end-of-turn'
  | 'start-of-game'
  | 'once-per-turn'
  | 'main'
  | 'other';

// Keywords that should be displayed as badges
const KEYWORDS = ['Rush', 'Blocker', 'Double Attack', 'Banish'];

// Effect patterns with their categories and labels
const EFFECT_PATTERNS: Array<{
  pattern: RegExp;
  category: EffectCategory;
  label: string;
  icon?: string;
}> = [
  // Start of game abilities (leaders like Imu)
  { pattern: /\[Start of Game\]\s*/i, category: 'start-of-game', label: 'Start of Game', icon: '🎬' },
  { pattern: /\[?At the start of the game[,\]]?\s*/i, category: 'start-of-game', label: 'Start of Game', icon: '🎬' },

  // DON!! attached abilities - must check before generic [DON!!]
  { pattern: /\[DON!!\s*[x×]\s*(\d+)\]/i, category: 'don-attached', label: 'DON!! Attached', icon: '⚡' },

  // Activate: Main abilities
  { pattern: /\[Activate:\s*Main\]\s*(\[Once Per Turn\])?\s*/i, category: 'activate-main', label: 'Activate: Main', icon: '🎯' },

  // On Play abilities
  { pattern: /\[On Play\]\s*/i, category: 'on-play', label: 'On Play', icon: '⭐' },

  // Counter abilities
  { pattern: /\[Counter\]\s*/i, category: 'counter', label: 'Counter', icon: '🛡️' },

  // Trigger abilities
  { pattern: /\[Trigger\]\s*/i, category: 'trigger', label: 'Trigger', icon: '💥' },

  // Turn-based abilities
  { pattern: /\[Your Turn\]\s*(\[Once Per Turn\])?\s*/i, category: 'your-turn', label: 'Your Turn', icon: '🔄' },
  { pattern: /\[Opponent'?s? Turn\]\s*/i, category: 'opponent-turn', label: "Opponent's Turn", icon: '🔄' },

  // Attack abilities
  { pattern: /\[On Attack\]\s*/i, category: 'on-attack', label: 'On Attack', icon: '⚔️' },
  { pattern: /\[When Attacking\]\s*/i, category: 'when-attacking', label: 'When Attacking', icon: '⚔️' },

  // Block abilities
  { pattern: /\[On Block\]\s*/i, category: 'on-block', label: 'On Block', icon: '🛡️' },

  // KO abilities
  { pattern: /\[On K\.?O\.?\]\s*/i, category: 'on-ko', label: 'On K.O.', icon: '💀' },

  // End of turn
  { pattern: /\[End of Your Turn\]\s*/i, category: 'end-of-turn', label: 'End of Turn', icon: '🔚' },

  // Once per turn (standalone)
  { pattern: /\[Once Per Turn\]\s*/i, category: 'once-per-turn', label: 'Once Per Turn', icon: '1️⃣' },

  // Main phase abilities (events)
  { pattern: /\[Main\]\s*/i, category: 'main', label: 'Main', icon: '📋' },
];

/**
 * Parse effect text into categorized sections
 */
export function parseEffectText(effectText: string | null | undefined, triggerText?: string | null): ParsedEffect[] {
  if (!effectText) return [];

  const effects: ParsedEffect[] = [];
  let remainingText = effectText.trim();

  // Extract keywords first
  const foundKeywords: string[] = [];
  for (const keyword of KEYWORDS) {
    // Check if keyword exists in text
    const keywordCheckPattern = new RegExp(`\\[?${keyword}\\]?`, 'gi');
    if (keywordCheckPattern.test(remainingText)) {
      foundKeywords.push(keyword);

      // For "gains [Keyword]" patterns, keep the keyword name but remove brackets and explanation
      // e.g., "gains [Rush]. (This card can attack...)" -> "gains Rush."
      const gainsPattern = new RegExp(
        `(gains\\s*)\\[${keyword}\\]\\.?\\s*(?:\\([^)]*\\))?`,
        'gi'
      );
      remainingText = remainingText.replace(gainsPattern, `$1${keyword}.`);

      // For standalone keywords at start or with brackets, remove entirely with explanation
      // e.g., "[Rush] (This card can attack...)" at the beginning
      const standalonePattern = new RegExp(
        `^\\[${keyword}\\]\\.?\\s*(?:\\([^)]*\\))?\\s*`,
        'gi'
      );
      remainingText = remainingText.replace(standalonePattern, '').trim();

      // Also handle standalone keyword without brackets at start
      const standaloneNoBracketPattern = new RegExp(
        `^${keyword}\\.?\\s*(?:\\([^)]*\\))?\\s*`,
        'gi'
      );
      remainingText = remainingText.replace(standaloneNoBracketPattern, '').trim();
    }
  }

  // Clean up any leftover empty brackets
  remainingText = remainingText.replace(/\[\s*\]/g, '').trim();

  // Add keywords as a single effect if any found
  if (foundKeywords.length > 0) {
    effects.push({
      type: 'keyword',
      label: 'Keywords',
      text: foundKeywords.join(', '),
      icon: '🏷️'
    });
  }

  // Remove [Trigger] section if trigger is shown separately
  if (triggerText) {
    remainingText = remainingText.replace(/\s*\[Trigger\].*$/is, '').trim();
  }

  // Split by effect markers and categorize each section
  // First, find all effect marker positions
  const markers: Array<{ index: number; length: number; category: EffectCategory; label: string; icon?: string }> = [];

  for (const { pattern, category, label, icon } of EFFECT_PATTERNS) {
    let match;
    const globalPattern = new RegExp(pattern.source, 'gi');
    while ((match = globalPattern.exec(remainingText)) !== null) {
      markers.push({
        index: match.index,
        length: match[0].length,
        category,
        label,
        icon
      });
    }
  }

  // Sort markers by position
  markers.sort((a, b) => a.index - b.index);

  // If no markers found, treat entire text as "other"
  if (markers.length === 0 && remainingText.trim()) {
    effects.push({
      type: 'other',
      label: 'Effect',
      text: remainingText.trim()
    });
    return effects;
  }

  // Helper to clean up text - remove trailing conjunctions and punctuation
  const cleanupText = (text: string): string => {
    return text
      .trim()
      .replace(/\s+(and|or)\s*$/i, '')  // Remove trailing "and" or "or"
      .replace(/[,;]\s*$/i, '')          // Remove trailing comma or semicolon
      .trim();
  };

  // Text before first marker (if any)
  if (markers.length > 0 && markers[0].index > 0) {
    const beforeText = cleanupText(remainingText.substring(0, markers[0].index));
    if (beforeText) {
      effects.push({
        type: 'other',
        label: 'Effect',
        text: beforeText
      });
    }
  }

  // Extract text for each marker
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const startIndex = marker.index + marker.length;
    const endIndex = markers[i + 1]?.index ?? remainingText.length;

    let text = cleanupText(remainingText.substring(startIndex, endIndex));

    // Check for Once Per Turn modifier in the text
    let label = marker.label;
    if (/^\[Once Per Turn\]/i.test(text)) {
      label += ' (Once Per Turn)';
      text = text.replace(/^\[Once Per Turn\]\s*/i, '').trim();
    }

    if (text) {
      effects.push({
        type: marker.category,
        label,
        text,
        icon: marker.icon
      });
    }
  }

  // Add trigger as separate effect if provided
  if (triggerText) {
    effects.push({
      type: 'trigger',
      label: 'Trigger',
      text: triggerText.replace(/^\[Trigger\]\s*/i, '').trim(),
      icon: '💥'
    });
  }

  return effects;
}

/**
 * Get CSS class for effect category
 */
export function getEffectCategoryClass(category: EffectCategory): string {
  const classMap: Record<EffectCategory, string> = {
    'keyword': 'effect-category--keyword',
    'on-play': 'effect-category--on-play',
    'activate-main': 'effect-category--activate-main',
    'don-attached': 'effect-category--don-attached',
    'your-turn': 'effect-category--your-turn',
    'opponent-turn': 'effect-category--opponent-turn',
    'counter': 'effect-category--counter',
    'trigger': 'effect-category--trigger',
    'on-attack': 'effect-category--on-attack',
    'when-attacking': 'effect-category--on-attack',
    'on-block': 'effect-category--on-block',
    'on-ko': 'effect-category--on-ko',
    'end-of-turn': 'effect-category--end-of-turn',
    'start-of-game': 'effect-category--start-of-game',
    'once-per-turn': 'effect-category--once-per-turn',
    'main': 'effect-category--main',
    'other': 'effect-category--other',
  };
  return classMap[category] || 'effect-category--other';
}

/**
 * Get color for effect category (for inline styling)
 */
export function getEffectCategoryColor(category: EffectCategory): string {
  const colorMap: Record<EffectCategory, string> = {
    'keyword': '#f39c12',      // Gold/Orange
    'on-play': '#3498db',      // Blue
    'activate-main': '#9b59b6', // Purple
    'don-attached': '#e74c3c',  // Red
    'your-turn': '#2ecc71',    // Green
    'opponent-turn': '#e67e22', // Orange
    'counter': '#1abc9c',      // Teal
    'trigger': '#e74c3c',      // Red
    'on-attack': '#c0392b',    // Dark Red
    'when-attacking': '#c0392b', // Dark Red
    'on-block': '#16a085',     // Dark Teal
    'on-ko': '#7f8c8d',        // Gray
    'end-of-turn': '#8e44ad',  // Dark Purple
    'start-of-game': '#f1c40f', // Yellow
    'once-per-turn': '#95a5a6', // Light Gray
    'main': '#3498db',         // Blue
    'other': '#bdc3c7',        // Light Gray
  };
  return colorMap[category] || '#bdc3c7';
}
