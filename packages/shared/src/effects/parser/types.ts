// Parser-specific types for effect text parsing

import {
  EffectTrigger,
  EffectType,
  TargetType,
  ConditionType,
  EffectDuration,
  TargetFilter,
  EffectCondition,
  EffectCost,
  EffectAction,
  EffectTarget,
} from '../types';

// Intermediate parsed representations
export interface ParsedTrigger {
  type: EffectTrigger;
  value?: number;  // For DON!! x2, etc.
}

export interface ParsedAction {
  type: EffectType;
  target?: ParsedTarget;
  value?: number;
  duration?: EffectDuration;
  keyword?: string;
  childActions?: ParsedAction[];  // For "Then" effects
  conditions?: ParsedCondition[];
}

export interface ParsedTarget {
  type: TargetType;
  count?: number;
  maxCount?: number;
  optional: boolean;
  filters: ParsedFilter[];
}

export interface ParsedFilter {
  property: 'COST' | 'POWER' | 'BASE_POWER' | 'BASE_COST' | 'COLOR' | 'TRAIT' | 'TYPE' | 'NAME' | 'STATE';
  operator: 'EQUALS' | 'OR_MORE' | 'OR_LESS' | 'CONTAINS' | 'NOT' | 'NOT_EQUALS' | 'IN';  // IN = matches any in array
  value: string | number | string[];
}

export interface ParsedCondition {
  type: ConditionType;
  value?: number;
  traits?: string[];
  names?: string[];
  leaderName?: string;  // For LEADER_IS condition: "If your Leader is [Name]"
  negated: boolean;
}

// Parsed cost alternative for "X or Y" costs
export interface ParsedCostAlternative {
  type: string;
  count: number;
  traitFilter?: string;
}

export interface ParsedCost {
  type: 'DON' | 'DON_MINUS' | 'TRASH_CARD' | 'REST_DON' | 'REST_THIS' | 'LIFE' | 'TRASH_FROM_HAND' | 'TRASH_ALTERNATIVE' | 'TRASH_CHARACTER';
  count: number;
  filters?: ParsedFilter[];
  optional?: boolean;  // "You may" prefix makes the cost optional
  traitFilter?: string;  // For "{Type} Characters" costs
  alternatives?: ParsedCostAlternative[];  // For "X or Y" costs - player chooses one
}

export interface ParsedEffect {
  triggers: ParsedTrigger[];
  costs: ParsedCost[];
  conditions: ParsedCondition[];
  actions: ParsedAction[];
  isOptional: boolean;
  oncePerTurn: boolean;
  rawText: string;
}

// Parse result with error tracking
export interface ParseResult {
  success: boolean;
  effects: ParsedEffect[];
  keywords: string[];
  warnings: ParseWarning[];
  errors: ParseError[];
}

export interface ParseWarning {
  segment: string;
  reason: string;
}

export interface ParseError {
  segment: string;
  error: string;
}

// Converter function types
export type TargetFilterConverter = (filter: ParsedFilter) => TargetFilter;
export type ConditionConverter = (condition: ParsedCondition) => EffectCondition;
export type CostConverter = (cost: ParsedCost) => EffectCost;
export type ActionConverter = (action: ParsedAction) => EffectAction;
export type TargetConverter = (target: ParsedTarget) => EffectTarget;
