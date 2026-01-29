/**
 * AI Configuration - Difficulty settings and tuning parameters
 */

export interface DifficultyConfig {
  // Decision quality
  mistakeChance: number;        // 0-1, chance of making suboptimal play

  // Evaluation thresholds
  mulliganThreshold: number;    // 0-1, minimum score to keep hand
  threatAwareness: number;      // 0-1, how well AI recognizes threats

  // Strategic capabilities
  considerLethal: boolean;      // Whether to calculate lethal
  lookAheadTurns: number;       // How many turns to plan ahead (0 = none)

  // Resource management
  counterEfficiency: number;    // 0-1, how efficiently AI uses counters
  donEfficiency: number;        // 0-1, how optimally AI attaches DON

  // Think delay (ms) - for human-like feel
  thinkDelay: number;
}

// 'basic' is an alias for 'easy'
export const AI_CONFIG: Record<'easy' | 'basic' | 'medium' | 'hard', DifficultyConfig> = {
  easy: {
    mistakeChance: 0.25,        // 25% chance of suboptimal play
    mulliganThreshold: 0.3,     // Low bar - keeps most hands
    threatAwareness: 0.3,       // Often misses threats
    considerLethal: false,      // Doesn't calculate lethal
    lookAheadTurns: 0,          // No planning ahead
    counterEfficiency: 0.5,     // Often over/under-counters
    donEfficiency: 0.5,         // Basic DON attachment
    thinkDelay: 1500,           // Slower, more casual
  },

  // 'basic' is alias for 'easy' (backward compatibility)
  basic: {
    mistakeChance: 0.25,
    mulliganThreshold: 0.3,
    threatAwareness: 0.3,
    considerLethal: false,
    lookAheadTurns: 0,
    counterEfficiency: 0.5,
    donEfficiency: 0.5,
    thinkDelay: 1500,
  },

  medium: {
    mistakeChance: 0.0,         // No random mistakes
    mulliganThreshold: 0.5,     // Reasonable threshold
    threatAwareness: 0.7,       // Recognizes most threats
    considerLethal: true,       // Checks for lethal
    lookAheadTurns: 1,          // Plans 1 turn ahead
    counterEfficiency: 0.8,     // Good counter usage
    donEfficiency: 0.75,        // Good DON attachment
    thinkDelay: 1000,           // Normal speed
  },

  hard: {
    mistakeChance: 0.0,         // No mistakes
    mulliganThreshold: 0.6,     // High standards
    threatAwareness: 1.0,       // Perfect threat recognition
    considerLethal: true,       // Always checks lethal
    lookAheadTurns: 2,          // Plans 2 turns ahead
    counterEfficiency: 0.95,    // Near-optimal counters
    donEfficiency: 0.95,        // Optimal DON usage
    thinkDelay: 750,            // Quick decisions
  },
};

// Board evaluation weights
export const BOARD_WEIGHTS = {
  fieldPresence: 1.0,       // Base importance of board
  handAdvantage: 0.7,       // Hand cards value
  lifeAdvantage: 1.5,       // Life is very important
  donAdvantage: 0.5,        // DON somewhat important
  tempo: 0.8,               // Being on offense matters
};

// Threat level thresholds
export const THREAT_THRESHOLDS = {
  highPower: 7000,          // Power considered "high"
  criticalThreat: 7,        // Threat level requiring immediate response
  moderateThreat: 4,        // Threat worth considering
};

// Life thresholds
export const LIFE_THRESHOLDS = {
  safe: 4,                  // 4+ life = safe
  moderate: 2,              // 2-3 life = moderate
  critical: 1,              // 1 life = critical
};

// Mana curve ideal distribution (by cost)
export const IDEAL_CURVE = {
  0: 0,     // 0-cost cards
  1: 0.05,  // 1-cost: 5%
  2: 0.20,  // 2-cost: 20%
  3: 0.25,  // 3-cost: 25%
  4: 0.25,  // 4-cost: 25%
  5: 0.15,  // 5-cost: 15%
  6: 0.07,  // 6-cost: 7%
  7: 0.03,  // 7+ cost: 3%
};
