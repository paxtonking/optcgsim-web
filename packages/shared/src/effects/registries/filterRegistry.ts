/**
 * Filter Registry
 * Consolidates all filter definitions in one place:
 * - Pattern matching (for parser)
 * - Value extraction
 * - Filter application logic
 * - Documentation
 */

import type { GameCard } from '../../types/game';
import type { CardDefinition } from '../EffectEngine';

// Type for parsed filter data
export interface ParsedFilterData {
  property: string;
  operator: string;
  value: string | number | string[];
}

// Context for dynamic value resolution
export interface FilterContext {
  sourcePlayer?: { activeDon: number; [key: string]: any };
  [key: string]: any;
}

// The complete definition of a filter - everything in one place
export interface FilterDefinition {
  property: string;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray) => Omit<ParsedFilterData, 'property'>;
  apply: (
    card: GameCard,
    cardDef: CardDefinition,
    filter: ParsedFilterData,
    context?: FilterContext
  ) => boolean;
  description: string;
}

// Helper for dynamic value resolution
function resolveValue(value: any, context?: FilterContext): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value === 'DON_COUNT') {
      return context?.sourcePlayer?.activeDon ?? 0;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Registry of all filters
export const FILTERS: Record<string, FilterDefinition> = {
  // =====================
  // COST FILTERS
  // =====================

  COST: {
    property: 'COST',
    patterns: [
      /with (?:a )?cost of (\d+) or less/i,
      /with (?:a )?cost of (\d+) or more/i,
      /with (?:a )?(\d+)[- ]cost/i,
      /cost[- ](\d+) or less/i,
      /cost[- ](\d+) or more/i,
      /costing (\d+) or less/i,
      /costing (\d+) or more/i,
    ],
    extract: (match) => {
      const value = parseInt(match[1]);
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('or less')) {
        return { operator: 'OR_LESS', value };
      }
      if (fullMatch.includes('or more')) {
        return { operator: 'OR_MORE', value };
      }
      return { operator: 'EQUALS', value };
    },
    apply: (card, cardDef, filter, context) => {
      const cost = card.cost ?? cardDef.cost ?? 0;
      const filterValue = resolveValue(filter.value, context);
      switch (filter.operator) {
        case 'OR_LESS':
        case 'LESS_THAN_OR_EQUAL':
          return cost <= filterValue;
        case 'OR_MORE':
          return cost >= filterValue;
        case 'EQUALS':
          return cost === filterValue;
        default:
          return true;
      }
    },
    description: 'Filter by current cost',
  },

  BASE_COST: {
    property: 'BASE_COST',
    patterns: [
      /with (?:a )?base cost of (\d+) or less/i,
      /with (?:a )?base cost of (\d+) or more/i,
      /with (?:a )?base cost of (\d+)/i,
      /base cost[- ](\d+) or less/i,
      /base cost[- ](\d+) or more/i,
    ],
    extract: (match) => {
      const value = parseInt(match[1]);
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('or less')) {
        return { operator: 'OR_LESS', value };
      }
      if (fullMatch.includes('or more')) {
        return { operator: 'OR_MORE', value };
      }
      return { operator: 'EQUALS', value };
    },
    apply: (_card, cardDef, filter, context) => {
      const baseCost = cardDef.cost ?? 0;
      const filterValue = resolveValue(filter.value, context);
      switch (filter.operator) {
        case 'OR_LESS':
        case 'LESS_THAN_OR_EQUAL':
          return baseCost <= filterValue;
        case 'OR_MORE':
          return baseCost >= filterValue;
        case 'EQUALS':
          return baseCost === filterValue;
        default:
          return true;
      }
    },
    description: 'Filter by base cost (unmodified)',
  },

  // =====================
  // POWER FILTERS
  // =====================

  POWER: {
    property: 'POWER',
    patterns: [
      /with (?:a )?power of (\d+) or less/i,
      /with (?:a )?power of (\d+) or more/i,
      /with (\d+) power or less/i,
      /with (\d+) power or more/i,
      /(\d+)[- ]power or less/i,
      /(\d+)[- ]power or more/i,
    ],
    extract: (match) => {
      const value = parseInt(match[1]);
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('or less')) {
        return { operator: 'OR_LESS', value };
      }
      if (fullMatch.includes('or more')) {
        return { operator: 'OR_MORE', value };
      }
      return { operator: 'EQUALS', value };
    },
    apply: (card, cardDef, filter, context) => {
      const power = card.power ?? cardDef.power ?? 0;
      const filterValue = resolveValue(filter.value, context);
      switch (filter.operator) {
        case 'OR_LESS':
        case 'LESS_THAN_OR_EQUAL':
          return power <= filterValue;
        case 'OR_MORE':
          return power >= filterValue;
        case 'EQUALS':
          return power === filterValue;
        default:
          return true;
      }
    },
    description: 'Filter by current power',
  },

  BASE_POWER: {
    property: 'BASE_POWER',
    patterns: [
      /with (?:a )?base power of (\d+) or less/i,
      /with (?:a )?base power of (\d+) or more/i,
      /with (?:a )?base power of (\d+)/i,
      /base power[- ](\d+) or less/i,
      /base power[- ](\d+) or more/i,
    ],
    extract: (match) => {
      const value = parseInt(match[1]);
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('or less')) {
        return { operator: 'OR_LESS', value };
      }
      if (fullMatch.includes('or more')) {
        return { operator: 'OR_MORE', value };
      }
      return { operator: 'EQUALS', value };
    },
    apply: (_card, cardDef, filter, context) => {
      const basePower = cardDef.power ?? 0;
      const filterValue = resolveValue(filter.value, context);
      switch (filter.operator) {
        case 'OR_LESS':
        case 'LESS_THAN_OR_EQUAL':
          return basePower <= filterValue;
        case 'OR_MORE':
          return basePower >= filterValue;
        case 'EQUALS':
          return basePower === filterValue;
        default:
          return true;
      }
    },
    description: 'Filter by base power (unmodified)',
  },

  // =====================
  // NAME FILTERS
  // =====================

  NAME: {
    property: 'NAME',
    patterns: [
      /other than \[([^\]]+)\]/i,
      /other than "([^"]+)"/i,
      /excluding \[([^\]]+)\]/i,
      /except \[([^\]]+)\]/i,
      /named \[([^\]]+)\]/i,
      /named "([^"]+)"/i,
      /with the name \[([^\]]+)\]/i,
      /card(?:s)? named \[([^\]]+)\]/i,
    ],
    extract: (match) => {
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('other than') || fullMatch.includes('excluding') || fullMatch.includes('except')) {
        return { operator: 'NOT_EQUALS', value: match[1] };
      }
      return { operator: 'EQUALS', value: match[1] };
    },
    apply: (_card, cardDef, filter) => {
      const cardName = cardDef.name ?? '';
      switch (filter.operator) {
        case 'NOT_EQUALS':
        case 'NOT':
          return cardName !== filter.value;
        case 'EQUALS':
          return cardName === filter.value;
        case 'CONTAINS':
          return cardName.toLowerCase().includes(String(filter.value).toLowerCase());
        default:
          return true;
      }
    },
    description: 'Filter by card name',
  },

  // =====================
  // COLOR FILTERS
  // =====================

  COLOR: {
    property: 'COLOR',
    patterns: [
      /(red|blue|green|purple|yellow|black) card/i,
      /with the (red|blue|green|purple|yellow|black) color/i,
      /that (?:is|are) (red|blue|green|purple|yellow|black)/i,
    ],
    extract: (match) => ({
      operator: 'EQUALS',
      value: match[1].toLowerCase(),
    }),
    apply: (_card, cardDef, filter) => {
      const cardColors = cardDef.colors?.map((c: string) => c.toLowerCase()) ?? [];
      if (Array.isArray(filter.value)) {
        return filter.value.some(v => cardColors.includes(v.toLowerCase()));
      }
      return cardColors.includes(String(filter.value).toLowerCase());
    },
    description: 'Filter by card color',
  },

  // =====================
  // TRAIT FILTERS
  // =====================

  TRAIT: {
    property: 'TRAIT',
    patterns: [
      /with the \{([^}]+)\} type/i,
      /with the \{([^}]+)\} trait/i,
      /\{([^}]+)\} type character/i,
      /\{([^}]+)\} character/i,
      /(?:a |an )?\{([^}]+)\}/i,
    ],
    extract: (match) => ({
      operator: 'CONTAINS',
      value: match[1],
    }),
    apply: (_card, cardDef, filter) => {
      const cardTraits = cardDef.traits ?? [];
      if (Array.isArray(filter.value)) {
        return filter.value.some(v => cardTraits.includes(v));
      }
      switch (filter.operator) {
        case 'NOT_CONTAINS':
          return !cardTraits.includes(String(filter.value));
        case 'CONTAINS':
        default:
          return cardTraits.includes(String(filter.value));
      }
    },
    description: 'Filter by card trait',
  },

  // =====================
  // TYPE FILTERS
  // =====================

  TYPE: {
    property: 'TYPE',
    patterns: [
      /(character|event|stage|leader)/i,
      /of type (character|event|stage|leader)/i,
    ],
    extract: (match) => ({
      operator: 'EQUALS',
      value: match[1].toLowerCase(),
    }),
    apply: (_card, cardDef, filter) => {
      const cardType = cardDef.type?.toLowerCase() ?? '';
      return cardType === String(filter.value).toLowerCase();
    },
    description: 'Filter by card type',
  },

  // =====================
  // STATE FILTERS
  // =====================

  STATE: {
    property: 'STATE',
    patterns: [
      /(?:that is |which is )?(rested|active)/i,
      /(rested|active) (?:character|card)/i,
    ],
    extract: (match) => ({
      operator: 'EQUALS',
      value: match[1].toLowerCase(),
    }),
    apply: (card, _cardDef, filter) => {
      const isRested = card.state === 'RESTED';
      const stateValue = String(filter.value).toLowerCase();
      if (stateValue === 'rested') return isRested;
      if (stateValue === 'active') return !isRested;
      return true;
    },
    description: 'Filter by card state (rested/active)',
  },
};

// Export helper to get filter by property
export function getFilterDefinition(property: string): FilterDefinition | undefined {
  return FILTERS[property.toUpperCase()];
}

// Export all filter properties from registry for validation
export const REGISTERED_FILTER_PROPERTIES = Object.keys(FILTERS);

// Parse filter from text
export function parseFilter(text: string): ParsedFilterData | null {
  for (const def of Object.values(FILTERS)) {
    for (const pattern of def.patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          property: def.property,
          ...def.extract(match),
        };
      }
    }
  }
  return null;
}

// Parse all filters from text
export function parseAllFilters(text: string): ParsedFilterData[] {
  const filters: ParsedFilterData[] = [];

  for (const def of Object.values(FILTERS)) {
    for (const pattern of def.patterns) {
      const match = text.match(pattern);
      if (match) {
        filters.push({
          property: def.property,
          ...def.extract(match),
        });
        break; // Only one match per filter type
      }
    }
  }

  return filters;
}

// Apply a filter using the registry
export function applyFilter(
  card: GameCard,
  cardDef: CardDefinition,
  filter: ParsedFilterData,
  context?: FilterContext
): boolean {
  const def = getFilterDefinition(filter.property);
  if (!def) {
    console.warn(`[FilterRegistry] No handler for filter property: ${filter.property}`);
    return true; // Default to allowing unknown filters
  }

  return def.apply(card, cardDef, filter, context);
}

// Apply multiple filters (all must pass)
export function applyFilters(
  card: GameCard,
  cardDef: CardDefinition,
  filters: ParsedFilterData[],
  context?: FilterContext
): boolean {
  return filters.every(filter => applyFilter(card, cardDef, filter, context));
}
