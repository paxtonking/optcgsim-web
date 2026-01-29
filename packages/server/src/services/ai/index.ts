/**
 * AI Module Exports
 */

// Main service
export { AIService, createAIPlayer } from './AIService.js';

// Types
export type { AIDecision, DifficultyLevel, BoardScore, ThreatCard, LethalInfo, GameSituation } from './types.js';

// Config
export { AI_CONFIG } from './config.js';

// Evaluators
export { BoardEvaluator } from './evaluators/BoardEvaluator.js';
export { ThreatAssessor } from './evaluators/ThreatAssessor.js';
export { LethalCalculator } from './evaluators/LethalCalculator.js';

// Strategies
export { BaseStrategy } from './strategies/BaseStrategy.js';
export { EasyStrategy } from './strategies/EasyStrategy.js';
export { MediumStrategy } from './strategies/MediumStrategy.js';
export { HardStrategy } from './strategies/HardStrategy.js';
