/**
 * AI-specific types and interfaces
 */

import { GameCard, ActionType } from '@optcgsim/shared';

// AI Decision returned by strategy
export interface AIDecision {
  action: ActionType;
  data: any;
  confidence?: number;  // 0-1, how confident AI is in this decision
  reasoning?: string;   // For debugging/logging
}

// Board evaluation score
export interface BoardScore {
  total: number;
  breakdown: {
    fieldPresence: number;    // Character count and power
    handAdvantage: number;    // Hand size value
    lifeAdvantage: number;    // Life difference
    donAdvantage: number;     // Active DON count
    tempo: number;            // Initiative/pressure
  };
}

// Threat assessment for opponent cards
export interface ThreatCard {
  card: GameCard;
  threatLevel: number;  // 1-10 scale
  reasons: ThreatReason[];
}

export enum ThreatReason {
  HIGH_POWER = 'HIGH_POWER',
  RUSH_KEYWORD = 'RUSH_KEYWORD',
  DOUBLE_ATTACK = 'DOUBLE_ATTACK',
  BLOCKER = 'BLOCKER',
  DANGEROUS_EFFECT = 'DANGEROUS_EFFECT',
  CAN_KO_LEADER = 'CAN_KO_LEADER',
  LOW_COST_HIGH_VALUE = 'LOW_COST_HIGH_VALUE',
}

// Lethal calculation result
export interface LethalInfo {
  hasLethal: boolean;
  attackSequence: AttackSequence[];
  donAttachments: DonAttachment[];
  totalDamage: number;
  requiredCounterPower: number;  // Power opponent needs to survive
}

export interface AttackSequence {
  attackerId: string;
  targetId: string;
  targetType: 'leader' | 'character';
  attackPower: number;
  requiredDon: number;
  expectedOutcome: 'ko' | 'damage' | 'blocked';
}

export interface DonAttachment {
  donId: string;
  targetId: string;
  purpose: 'lethal' | 'ko' | 'pressure' | 'defense';
}

// Game situation assessment
export interface GameSituation {
  phase: 'early' | 'mid' | 'late';
  tempo: 'ahead' | 'even' | 'behind';
  pressure: 'applying' | 'receiving' | 'neutral';
  resourceState: 'flush' | 'stable' | 'constrained';
  lifeState: 'safe' | 'moderate' | 'critical';
}

// Mulligan evaluation
export interface MulliganScore {
  curveScore: number;        // 0-1, quality of mana curve
  playabilityScore: number;  // 0-1, early game plays available
  counterScore: number;      // 0-1, defensive potential
  total: number;
}

// Attack target evaluation
export interface AttackTarget {
  attackerId: string;
  targetId: string;
  targetType: 'leader' | 'character';
}

// Card play evaluation
export interface CardPlayScore {
  card: GameCard;
  score: number;
  reasons: string[];
}

// Difficulty level type
// 'basic' is an alias for 'easy' for backward compatibility
export type DifficultyLevel = 'easy' | 'basic' | 'medium' | 'hard';
