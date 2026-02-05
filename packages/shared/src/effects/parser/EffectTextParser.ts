// Main effect text parser - converts effect text to CardEffectDefinition objects

import {
  CardEffectDefinition,
  EffectAction,
  EffectTarget,
  EffectCondition,
  EffectCost,
  EffectTrigger,
  EffectType,
  EffectDuration,
  TargetType,
  TargetFilter,
} from '../types';

import {
  ParseResult,
  ParsedEffect,
  ParsedAction,
  ParsedTarget,
  ParsedFilter,
  ParsedCondition,
  ParsedCost,
} from './types';

import {
  extractTriggers,
  extractKeywords,
  extractAction,
  extractTarget,
  extractDuration,
  extractConditions,
  extractCosts,
  isOncePerTurn,
  isOptional,
  KEYWORD_PATTERNS,
} from './patterns';

export class EffectTextParser {
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  /**
   * Main entry point - parse effect text into CardEffectDefinition[]
   */
  parse(effectText: string | null, cardId: string): CardEffectDefinition[] {
    if (!effectText || effectText.trim() === '') {
      return [];
    }

    const result = this.parseToResult(effectText, cardId);

    if (this.debug && result.warnings.length > 0) {
      console.warn(`[EffectParser] Warnings for ${cardId}:`, result.warnings);
    }
    if (this.debug && result.errors.length > 0) {
      console.error(`[EffectParser] Errors for ${cardId}:`, result.errors);
    }

    return this.buildDefinitions(result, cardId);
  }

  /**
   * Parse effect text and return detailed result with warnings/errors
   */
  parseToResult(effectText: string, _cardId: string): ParseResult {
    const result: ParseResult = {
      success: true,
      effects: [],
      keywords: [],
      warnings: [],
      errors: [],
    };

    try {
      // Normalize text
      const normalized = this.normalizeText(effectText);

      // Extract keywords first (Rush, Blocker, etc.)
      result.keywords = extractKeywords(normalized);

      // Split into effect segments
      const segments = this.splitEffects(normalized);

      // Parse each segment
      for (const segment of segments) {
        try {
          const parsed = this.parseSegment(segment);
          if (parsed) {
            result.effects.push(parsed);
          } else if (segment.trim().length > 10) {
            // Only warn for non-trivial segments
            result.warnings.push({
              segment,
              reason: 'Could not parse segment'
            });
          }
        } catch (e) {
          result.errors.push({
            segment,
            error: e instanceof Error ? e.message : String(e)
          });
          result.success = false;
        }
      }
    } catch (e) {
      result.errors.push({
        segment: effectText,
        error: e instanceof Error ? e.message : String(e)
      });
      result.success = false;
    }

    return result;
  }

  /**
   * Normalize effect text for consistent parsing
   */
  private normalizeText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Normalize quotes
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      // Trim
      .trim();
  }

  /**
   * Split effect text into separate effect segments
   * Effects are typically separated by trigger brackets or periods
   */
  private splitEffects(text: string): string[] {
    const segments: string[] = [];

    // Only match actual trigger/keyword brackets, NOT card name brackets like [Gaimon]
    // Triggers: [On Play], [When Attacking], [Counter], [Trigger], [Main], [Activate: Main], etc.
    // Keywords: [Rush], [Blocker], [Double Attack], [Banish]
    // DON: [DON!! x1], [DON!! x2], etc.
    // Other: [Opponent's Turn], [Your Turn], [On K.O.], [End of Turn]
    // NOTE: [Once Per Turn] is NOT included as it's a modifier, not a standalone trigger
    // It should stay with the preceding trigger like [Activate: Main] [Once Per Turn]
    const triggerBracketPattern = /\[(?:On Play\]\/\[When Attacking|Main\]\/\[Counter|On Play|When Attacking|On Attack|On Block|Counter|Trigger|Activate:\s*Main|Main|End of (?:Your )?Turn|Your Turn|Opponent'?s?\s*Turn|On K\.?O\.?|When K\.?O\.?'?d|On Your Opponent'?s?\s*Attack|DON!!\s*x?\d*|Rush|Blocker|Double Attack|Banish)\]/gi;

    // Find all trigger positions
    const triggers: Array<{ index: number; match: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = triggerBracketPattern.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;
      // Skip keyword-only triggers like [Rush], [Blocker] for splitting (but include if combined)
      const isKeywordOnly = KEYWORD_PATTERNS.some(kp => kp.pattern.test(matchText));
      if (!isKeywordOnly || matchText.toLowerCase().includes('blocker')) {
        triggers.push({ index: matchIndex, match: matchText });
      }
    }

    if (triggers.length === 0) {
      // No triggers found, return the whole text
      return [text];
    }

    // Split by trigger positions
    for (let i = 0; i < triggers.length; i++) {
      const start = triggers[i].index;
      const end = i < triggers.length - 1 ? triggers[i + 1].index : text.length;
      const segment = text.substring(start, end).trim();
      if (segment) {
        segments.push(segment);
      }
    }

    // If there's text before the first trigger, add it
    if (triggers[0].index > 0) {
      const beforeFirst = text.substring(0, triggers[0].index).trim();
      if (beforeFirst) {
        segments.unshift(beforeFirst);
      }
    }

    return segments;
  }

  /**
   * Parse a single effect segment
   */
  private parseSegment(segment: string): ParsedEffect | null {
    // Extract triggers
    const triggers = extractTriggers(segment);

    // If no triggers but it's just a keyword, handle specially
    if (triggers.length === 0) {
      const keywords = extractKeywords(segment);
      if (keywords.length > 0) {
        // This is a keyword-only segment, will be handled separately
        return null;
      }

      // Check if this is a continuation/action-only text
      const action = extractAction(segment);
      if (!action) {
        return null;
      }
    }

    // Build parsed effect
    const parsed: ParsedEffect = {
      triggers,
      costs: extractCosts(segment),
      conditions: extractConditions(segment),
      actions: this.parseActionChain(segment),
      isOptional: isOptional(segment),
      oncePerTurn: isOncePerTurn(segment),
      rawText: segment,
    };

    // Must have at least one action or trigger
    if (parsed.actions.length === 0 && parsed.triggers.length === 0) {
      return null;
    }

    return parsed;
  }

  /**
   * Parse action chain with "Then" handling
   */
  private parseActionChain(text: string): ParsedAction[] {
    // Remove ONLY trigger/keyword brackets for action parsing, NOT card name brackets like [Gaimon]
    // Trigger brackets: [On Play], [When Attacking], [Counter], [Trigger], [Main], [Activate: Main], etc.
    // Keyword brackets: [Rush], [Blocker], [Double Attack], [Banish], [DON!! x1], [Once Per Turn], etc.
    const triggerBracketPattern = /\[(?:On Play\]\/\[When Attacking|Main\]\/\[Counter|On Play|When Attacking|On Attack|On Block|Counter|Trigger|Activate:\s*Main|Main|End of (?:Your )?Turn|Your Turn|Opponent'?s?\s*Turn|On K\.?O\.?|When K\.?O\.?'?d|On Your Opponent'?s?\s*Attack|Once Per Turn|DON!!\s*x?\d*|Rush|Blocker|Double Attack|Banish)\]/gi;
    let actionText = text.replace(triggerBracketPattern, '').trim();

    // Remove leading "If ... :" conditions
    actionText = actionText.replace(/^If\s+[^:]+:\s*/i, '');

    // Split on "Then" or ". Then" but preserve the text
    const parts = actionText.split(/\.?\s*Then[,:]?\s*/i).filter(p => p.trim());

    const actions: ParsedAction[] = [];

    for (const part of parts) {
      const action = this.parseActionPart(part);
      if (action) {
        actions.push(action);
      }
    }

    // Link as child effects for "Then" structure
    if (actions.length > 1) {
      for (let i = 0; i < actions.length - 1; i++) {
        actions[i].childActions = [actions[i + 1]];
      }
      return [actions[0]]; // Return root with children
    }

    return actions;
  }

  /**
   * Parse a single action part
   */
  private parseActionPart(text: string): ParsedAction | null {
    const action = extractAction(text);
    if (!action) {
      return null;
    }

    // Extract target
    const target = extractTarget(text);
    if (target) {
      action.target = target;
    } else {
      // Try to infer target from action type
      action.target = this.inferTarget(action.type, text);
    }

    // Extract duration
    action.duration = extractDuration(text);

    // Extract action-specific conditions
    action.conditions = extractConditions(text);

    return action;
  }

  /**
   * Infer target based on action type and text context
   */
  private inferTarget(actionType: EffectType, text: string): ParsedTarget | undefined {
    // Self-buff patterns
    if (
      actionType === EffectType.BUFF_POWER ||
      actionType === EffectType.GRANT_KEYWORD
    ) {
      if (/this Character|this Leader/i.test(text)) {
        return {
          type: TargetType.SELF,
          count: 1,
          optional: false,
          filters: [],
        };
      }
    }

    // Draw doesn't need a target
    if (actionType === EffectType.DRAW_CARDS) {
      return undefined;
    }

    return undefined;
  }

  /**
   * Build CardEffectDefinition objects from parse result
   */
  private buildDefinitions(result: ParseResult, cardId: string): CardEffectDefinition[] {
    const definitions: CardEffectDefinition[] = [];
    let effectIndex = 0;

    // Build keyword effects
    for (const keyword of result.keywords) {
      const keywordDef = this.buildKeywordDefinition(keyword, cardId, effectIndex++);
      if (keywordDef) {
        definitions.push(keywordDef);
      }
    }

    // Build parsed effects
    for (const parsed of result.effects) {
      const def = this.convertParsedEffect(parsed, cardId, effectIndex++);
      if (def) {
        definitions.push(def);
      }
    }

    return definitions;
  }

  /**
   * Build a keyword definition
   */
  private buildKeywordDefinition(keyword: string, cardId: string, index: number): CardEffectDefinition | null {
    const keywordMap: Record<string, { trigger: EffectTrigger; effectType: EffectType }> = {
      'Rush': { trigger: EffectTrigger.PASSIVE, effectType: EffectType.RUSH },
      'Blocker': { trigger: EffectTrigger.ON_BLOCK, effectType: EffectType.BLOCKER },
      'Banish': { trigger: EffectTrigger.PASSIVE, effectType: EffectType.BANISH },
      'Double Attack': { trigger: EffectTrigger.PASSIVE, effectType: EffectType.DOUBLE_ATTACK },
    };

    const mapping = keywordMap[keyword];
    if (!mapping) {
      return null;
    }

    return {
      id: `${cardId}-kw-${index}`,
      trigger: mapping.trigger,
      effects: [{
        type: mapping.effectType,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: `[${keyword}]`,
    };
  }

  /**
   * Convert a ParsedEffect to CardEffectDefinition
   */
  private convertParsedEffect(parsed: ParsedEffect, cardId: string, index: number): CardEffectDefinition | null {
    // Need at least one trigger
    if (parsed.triggers.length === 0 && parsed.actions.length === 0) {
      return null;
    }

    // Use the first trigger (most effects have one primary trigger)
    const primaryTrigger = parsed.triggers[0] || { type: EffectTrigger.PASSIVE };

    // Convert actions
    const effects: EffectAction[] = parsed.actions.map(a => this.convertAction(a));

    if (effects.length === 0) {
      return null;
    }

    return {
      id: `${cardId}-e${index}`,
      trigger: primaryTrigger.type,
      triggerValue: primaryTrigger.value,
      conditions: parsed.conditions.map(c => this.convertCondition(c)),
      costs: parsed.costs.map(c => this.convertCost(c)),
      effects,
      isOptional: parsed.isOptional,
      oncePerTurn: parsed.oncePerTurn,
      description: parsed.rawText,
    };
  }

  /**
   * Convert ParsedAction to EffectAction
   */
  private convertAction(parsed: ParsedAction): EffectAction {
    const action: EffectAction = {
      type: parsed.type,
      value: parsed.value,
      duration: parsed.duration || EffectDuration.INSTANT,
      keyword: parsed.keyword,
    };

    if (parsed.target) {
      action.target = this.convertTarget(parsed.target);
    }

    if (parsed.conditions && parsed.conditions.length > 0) {
      action.conditions = parsed.conditions.map(c => this.convertCondition(c));
    }

    if (parsed.childActions && parsed.childActions.length > 0) {
      action.childEffects = parsed.childActions.map(a => this.convertAction(a));
    }

    return action;
  }

  /**
   * Convert ParsedTarget to EffectTarget
   */
  private convertTarget(parsed: ParsedTarget): EffectTarget {
    return {
      type: parsed.type,
      count: parsed.count,
      maxCount: parsed.maxCount,
      optional: parsed.optional,
      filters: parsed.filters.map(f => this.convertFilter(f)),
    };
  }

  /**
   * Convert ParsedFilter to TargetFilter
   */
  private convertFilter(parsed: ParsedFilter): TargetFilter {
    // Map our parser operators to the effect system operators
    let operator: TargetFilter['operator'];
    switch (parsed.operator) {
      case 'EQUALS': operator = 'EQUALS'; break;
      case 'OR_MORE': operator = 'OR_MORE'; break;
      case 'OR_LESS': operator = 'OR_LESS'; break;
      case 'CONTAINS': operator = 'CONTAINS'; break;
      case 'NOT': operator = 'NOT'; break;
      case 'NOT_EQUALS': operator = 'NOT_EQUALS'; break;
      default: operator = 'EQUALS';
    }

    // Map property names
    let property: TargetFilter['property'];
    switch (parsed.property) {
      case 'COST': property = 'COST'; break;
      case 'BASE_COST': property = 'BASE_COST'; break;
      case 'POWER': property = 'POWER'; break;
      case 'BASE_POWER': property = 'BASE_POWER'; break;
      case 'COLOR': property = 'COLOR'; break;
      case 'TRAIT': property = 'TRAIT'; break;
      case 'TYPE': property = 'TYPE'; break;
      case 'NAME': property = 'NAME'; break;
      case 'STATE': property = 'STATE'; break;
      default: property = 'COST';
    }

    return {
      property,
      operator,
      value: parsed.value,
    };
  }

  /**
   * Convert ParsedCondition to EffectCondition
   */
  private convertCondition(parsed: ParsedCondition): EffectCondition {
    return {
      type: parsed.type,
      value: parsed.value,
      traits: parsed.traits,
      leaderName: parsed.leaderName,
    };
  }

  /**
   * Convert ParsedCost to EffectCost
   */
  private convertCost(parsed: ParsedCost): EffectCost {
    // Map cost types
    let costType: 'DON' | 'TRASH_CARD' | 'REST_DON' | 'RETURN_DON' | 'LIFE' | 'TRASH_FROM_HAND' | 'REST_SELF' | 'TRASH_CHARACTER' | 'REST_CHARACTER';
    switch (parsed.type) {
      case 'DON':
      case 'DON_MINUS': costType = 'RETURN_DON'; break;
      case 'REST_DON': costType = 'REST_DON'; break;
      case 'REST_THIS': costType = 'REST_SELF'; break;
      case 'TRASH_FROM_HAND': costType = 'TRASH_FROM_HAND'; break;
      case 'TRASH_CHARACTER': costType = 'TRASH_CHARACTER'; break;
      case 'LIFE': costType = 'LIFE'; break;
      case 'TRASH_ALTERNATIVE':
        // For alternative costs, use TRASH_FROM_HAND as base but include alternatives
        costType = 'TRASH_FROM_HAND';
        break;
      default: costType = 'DON';
    }

    const result: EffectCost = {
      type: costType,
      count: parsed.count,
    };

    // Add trait filter if present
    if (parsed.traitFilter) {
      result.traitFilter = parsed.traitFilter;
    }

    // Add alternatives if present (for "X or Y" costs)
    if (parsed.alternatives && parsed.alternatives.length > 0) {
      result.alternatives = parsed.alternatives.map(alt => ({
        type: alt.type as EffectCost['type'],
        count: alt.count,
        traitFilter: alt.traitFilter,
      }));
    }

    return result;
  }
}

// Export a default instance
export const effectTextParser = new EffectTextParser();
