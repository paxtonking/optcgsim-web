#!/usr/bin/env tsx
/**
 * validate-effects.ts
 *
 * Validates that database effects match effectText for each card.
 * Catches cases where a card has the wrong card's effects assigned.
 *
 * Usage:
 *   npm run validate              # Run validation
 *   npm run validate -- --verbose # Show all cards, not just mismatches
 *   npm run validate -- --fix     # Show suggested fixes
 */

import { PrismaClient } from '@prisma/client';
import {
  EffectTrigger,
  EffectType,
  type CardEffectDefinition,
  EffectTextParser,
} from '@optcgsim/shared';

const prisma = new PrismaClient();
const parser = new EffectTextParser(false);

// ============================================
// TYPES
// ============================================

interface EffectSummary {
  triggers: Set<string>;
  effectTypes: Set<string>;
  keywords: Set<string>;
}

interface ValidationResult {
  cardId: string;
  cardName: string;
  effectText: string;
  severity: 'ERROR' | 'WARNING' | 'INFO' | 'OK';
  issues: string[];
  dbSummary: EffectSummary;
  textSummary: EffectSummary;
}

// ============================================
// KEYWORD DETECTION
// ============================================

const KEYWORD_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\[Rush\]/i, keyword: 'Rush' },
  { pattern: /\[Blocker\]/i, keyword: 'Blocker' },
  { pattern: /\[Banish\]/i, keyword: 'Banish' },
  { pattern: /\[Double Attack\]/i, keyword: 'Double Attack' },
];

function extractKeywordsFromText(text: string): Set<string> {
  const keywords = new Set<string>();
  for (const { pattern, keyword } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) {
      keywords.add(keyword);
    }
  }
  return keywords;
}

// ============================================
// TRIGGER EXTRACTION FROM TEXT
// ============================================

const TRIGGER_PATTERNS: Array<{ pattern: RegExp; trigger: EffectTrigger }> = [
  { pattern: /\[On Play\]/i, trigger: EffectTrigger.ON_PLAY },
  { pattern: /\[When Attacking\]/i, trigger: EffectTrigger.ON_ATTACK },
  { pattern: /\[On Block\]/i, trigger: EffectTrigger.ON_BLOCK },
  { pattern: /\[Counter\]/i, trigger: EffectTrigger.COUNTER },
  { pattern: /\[Trigger\]/i, trigger: EffectTrigger.TRIGGER },
  { pattern: /\[Activate: Main\]/i, trigger: EffectTrigger.ACTIVATE_MAIN },
  { pattern: /\[DON!! x?\d+\]/i, trigger: EffectTrigger.DON_X },
  { pattern: /\[On K\.?O\.?\]/i, trigger: EffectTrigger.ON_KO },
  { pattern: /\[End of Your Turn\]/i, trigger: EffectTrigger.END_OF_TURN },
  { pattern: /\[Your Turn\]/i, trigger: EffectTrigger.YOUR_TURN },
  { pattern: /\[Opponent's Turn\]/i, trigger: EffectTrigger.OPPONENT_TURN },
];

function extractTriggersFromText(text: string): Set<string> {
  const triggers = new Set<string>();
  for (const { pattern, trigger } of TRIGGER_PATTERNS) {
    if (pattern.test(text)) {
      triggers.add(trigger);
    }
  }
  return triggers;
}

// ============================================
// EFFECT TYPE EXTRACTION FROM TEXT
// ============================================

const EFFECT_TYPE_PATTERNS: Array<{ pattern: RegExp; types: EffectType[] }> = [
  { pattern: /draw \d+ card/i, types: [EffectType.DRAW_CARDS] },
  { pattern: /\+\d+000? power/i, types: [EffectType.BUFF_POWER, EffectType.BUFF_ANY, EffectType.BUFF_SELF] },
  { pattern: /give .* \+\d+/i, types: [EffectType.BUFF_POWER, EffectType.BUFF_ANY] },
  { pattern: /gains? \+\d+/i, types: [EffectType.BUFF_POWER, EffectType.BUFF_SELF] },
  { pattern: /-\d+000? power/i, types: [EffectType.DEBUFF_POWER] },
  { pattern: /K\.?O\.? /i, types: [EffectType.KO_CHARACTER, EffectType.KO_COST_OR_LESS, EffectType.KO_POWER_OR_LESS] },
  { pattern: /return .* to (your |the owner's )?hand/i, types: [EffectType.RETURN_TO_HAND] },
  { pattern: /rest(ed)? DON!!/i, types: [EffectType.ATTACH_DON, EffectType.GAIN_RESTED_DON] },
  { pattern: /give .* DON!!/i, types: [EffectType.ATTACH_DON] },
  { pattern: /add .* to (your )?life/i, types: [EffectType.ADD_TO_LIFE] },
  { pattern: /trash .* from/i, types: [EffectType.SEND_TO_TRASH, EffectType.DISCARD_FROM_HAND] },
  { pattern: /\[Rush\]/i, types: [EffectType.RUSH, EffectType.GRANT_KEYWORD] },
  { pattern: /\[Blocker\]/i, types: [EffectType.BLOCKER] },
  { pattern: /gains? Rush/i, types: [EffectType.GRANT_KEYWORD] },
  { pattern: /can't be blocked/i, types: [EffectType.CANT_BE_BLOCKED] },
  { pattern: /look at the top/i, types: [EffectType.LOOK_AT_TOP_DECK] },
  { pattern: /place .* at the bottom/i, types: [EffectType.SEND_TO_DECK_BOTTOM] },
  { pattern: /rest this/i, types: [EffectType.REST_CHARACTER] },
];

function extractEffectTypesFromText(text: string): Set<string> {
  const types = new Set<string>();
  for (const { pattern, types: matchTypes } of EFFECT_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      for (const t of matchTypes) {
        types.add(t);
      }
    }
  }
  return types;
}

// ============================================
// EXTRACT FROM DATABASE EFFECTS
// ============================================

function extractFromDbEffects(effects: CardEffectDefinition[]): EffectSummary {
  const summary: EffectSummary = {
    triggers: new Set(),
    effectTypes: new Set(),
    keywords: new Set(),
  };

  for (const effect of effects) {
    if (effect.trigger) {
      summary.triggers.add(effect.trigger);
    }

    if (effect.effects && Array.isArray(effect.effects)) {
      for (const action of effect.effects) {
        if (action.type) {
          summary.effectTypes.add(action.type);

          // Check for keyword types
          if ([EffectType.RUSH, EffectType.BLOCKER, EffectType.BANISH, EffectType.DOUBLE_ATTACK].includes(action.type as EffectType)) {
            summary.keywords.add(action.type);
          }

          // Check for granted keywords
          if (action.type === EffectType.GRANT_KEYWORD && action.keyword) {
            summary.keywords.add(action.keyword);
          }
        }

        // Check child effects
        if (action.childEffects && Array.isArray(action.childEffects)) {
          for (const child of action.childEffects) {
            if (child.type) {
              summary.effectTypes.add(child.type);
            }
          }
        }
      }
    }
  }

  return summary;
}

function extractFromText(effectText: string, cardId: string): EffectSummary {
  const summary: EffectSummary = {
    triggers: extractTriggersFromText(effectText),
    effectTypes: extractEffectTypesFromText(effectText),
    keywords: extractKeywordsFromText(effectText),
  };

  // Also try parsing with the full parser
  try {
    const parsed = parser.parse(effectText, cardId);
    const parsedSummary = extractFromDbEffects(parsed);

    // Merge parsed results
    for (const t of parsedSummary.triggers) summary.triggers.add(t);
    for (const e of parsedSummary.effectTypes) summary.effectTypes.add(e);
    for (const k of parsedSummary.keywords) summary.keywords.add(k);
  } catch (e) {
    // Parser failed, rely on regex extraction
  }

  return summary;
}

// ============================================
// COMPARISON LOGIC
// ============================================

function setOverlap<T>(a: Set<T>, b: Set<T>): number {
  let overlap = 0;
  for (const item of a) {
    if (b.has(item)) overlap++;
  }
  return overlap;
}

function setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
  const diff = new Set<T>();
  for (const item of a) {
    if (!b.has(item)) diff.add(item);
  }
  return diff;
}

function compareEffects(
  cardId: string,
  cardName: string,
  effectText: string,
  dbEffects: CardEffectDefinition[]
): ValidationResult {
  const dbSummary = extractFromDbEffects(dbEffects);
  const textSummary = extractFromText(effectText, cardId);

  const result: ValidationResult = {
    cardId,
    cardName,
    effectText,
    severity: 'OK',
    issues: [],
    dbSummary,
    textSummary,
  };

  // Check for empty effectText with database effects
  if (!effectText || effectText.trim() === '') {
    result.severity = 'WARNING';
    result.issues.push('Database has effects but effectText is empty');
    return result;
  }

  // Compare triggers
  const triggerOverlap = setOverlap(dbSummary.triggers, textSummary.triggers);
  const dbOnlyTriggers = setDifference(dbSummary.triggers, textSummary.triggers);
  const textOnlyTriggers = setDifference(textSummary.triggers, dbSummary.triggers);

  if (dbSummary.triggers.size > 0 && textSummary.triggers.size > 0 && triggerOverlap === 0) {
    result.severity = 'ERROR';
    result.issues.push(`Trigger mismatch: DB has [${[...dbSummary.triggers].join(', ')}] but text has [${[...textSummary.triggers].join(', ')}]`);
  } else if (dbOnlyTriggers.size > 0) {
    if (result.severity !== 'ERROR') result.severity = 'WARNING';
    result.issues.push(`DB has extra triggers not in text: [${[...dbOnlyTriggers].join(', ')}]`);
  }

  // Compare effect types (more lenient - look for category overlap)
  const dbTypeCategories = categorizeEffectTypes(dbSummary.effectTypes);
  const textTypeCategories = categorizeEffectTypes(textSummary.effectTypes);

  const categoryOverlap = setOverlap(dbTypeCategories, textTypeCategories);
  if (dbTypeCategories.size > 0 && textTypeCategories.size > 0 && categoryOverlap === 0) {
    result.severity = 'ERROR';
    result.issues.push(`Effect type mismatch: DB has [${[...dbSummary.effectTypes].join(', ')}] but text suggests [${[...textSummary.effectTypes].join(', ')}]`);
  }

  // Compare keywords
  const keywordOverlap = setOverlap(dbSummary.keywords, textSummary.keywords);
  const dbOnlyKeywords = setDifference(dbSummary.keywords, textSummary.keywords);
  const textOnlyKeywords = setDifference(textSummary.keywords, dbSummary.keywords);

  if (dbOnlyKeywords.size > 0) {
    if (result.severity === 'OK') result.severity = 'INFO';
    result.issues.push(`DB has keywords not in text: [${[...dbOnlyKeywords].join(', ')}]`);
  }

  return result;
}

// Categorize effect types into broad categories for comparison
function categorizeEffectTypes(types: Set<string>): Set<string> {
  const categories = new Set<string>();

  for (const type of types) {
    if (type.includes('BUFF') || type.includes('DEBUFF') || type === 'SET_POWER_ZERO') {
      categories.add('POWER_MOD');
    } else if (type.includes('DRAW') || type === 'LOOK_AT_TOP_DECK' || type === 'MILL_DECK') {
      categories.add('CARD_DRAW');
    } else if (type.includes('KO')) {
      categories.add('KO');
    } else if (type.includes('DON') || type === 'ATTACH_DON') {
      categories.add('DON');
    } else if (type === 'RETURN_TO_HAND' || type === 'SEND_TO_DECK_BOTTOM' || type === 'SEND_TO_TRASH') {
      categories.add('CARD_MOVE');
    } else if (type === 'RUSH' || type === 'BLOCKER' || type === 'GRANT_KEYWORD' || type === 'CANT_BE_BLOCKED') {
      categories.add('KEYWORD');
    } else if (type === 'REST_CHARACTER' || type === 'ACTIVATE_CHARACTER' || type === 'FREEZE') {
      categories.add('STATE');
    } else if (type === 'ADD_TO_LIFE' || type === 'TAKE_LIFE') {
      categories.add('LIFE');
    } else {
      categories.add('OTHER');
    }
  }

  return categories;
}

// ============================================
// MAIN VALIDATION
// ============================================

async function runValidation(verbose: boolean): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Load all cards from database
  const cards = await prisma.card.findMany({
    select: {
      id: true,
      name: true,
      effectText: true,
      effects: true,
    },
  });

  console.log(`Checking ${cards.length} cards...\n`);

  for (const card of cards) {
    const rawEffects = card.effects;
    const effects = (Array.isArray(rawEffects) ? rawEffects : []) as CardEffectDefinition[];

    // Only validate cards with structured effects
    if (effects.length === 0) {
      continue;
    }

    const result = compareEffects(card.id, card.name, card.effectText || '', effects);
    results.push(result);
  }

  return results;
}

function printReport(results: ValidationResult[], verbose: boolean): void {
  console.log('');
  console.log('='.repeat(70));
  console.log('           CARD EFFECTS VALIDATION REPORT');
  console.log('='.repeat(70));
  console.log('');

  // Count by severity
  const errors = results.filter(r => r.severity === 'ERROR');
  const warnings = results.filter(r => r.severity === 'WARNING');
  const infos = results.filter(r => r.severity === 'INFO');
  const ok = results.filter(r => r.severity === 'OK');

  // Summary
  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total cards with structured effects:  ${results.length}`);
  console.log(`  OK (no issues):                     ${ok.length}`);
  console.log(`  INFO (minor discrepancies):         ${infos.length}`);
  console.log(`  WARNING (possible issues):          ${warnings.length}`);
  console.log(`  ERROR (likely wrong effects):       ${errors.length}`);
  console.log('');

  // Errors
  if (errors.length > 0) {
    console.log('ERRORS - Likely Wrong Effects');
    console.log('-'.repeat(40));
    for (const result of errors) {
      console.log(`\n[X] ${result.cardId} (${result.cardName})`);
      console.log(`    DB triggers:  [${[...result.dbSummary.triggers].join(', ')}]`);
      console.log(`    DB effects:   [${[...result.dbSummary.effectTypes].join(', ')}]`);
      console.log(`    Text triggers:[${[...result.textSummary.triggers].join(', ')}]`);
      console.log(`    Text effects: [${[...result.textSummary.effectTypes].join(', ')}]`);
      for (const issue of result.issues) {
        console.log(`    ! ${issue}`);
      }
      console.log(`    effectText: "${result.effectText.substring(0, 100)}${result.effectText.length > 100 ? '...' : ''}"`);
    }
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('WARNINGS - Possible Issues');
    console.log('-'.repeat(40));
    for (const result of warnings) {
      console.log(`\n[!] ${result.cardId} (${result.cardName})`);
      console.log(`    DB triggers:  [${[...result.dbSummary.triggers].join(', ')}]`);
      console.log(`    DB effects:   [${[...result.dbSummary.effectTypes].join(', ')}]`);
      for (const issue of result.issues) {
        console.log(`    ! ${issue}`);
      }
    }
    console.log('');
  }

  // Info (only in verbose mode)
  if (verbose && infos.length > 0) {
    console.log('INFO - Minor Discrepancies');
    console.log('-'.repeat(40));
    for (const result of infos) {
      console.log(`[i] ${result.cardId} (${result.cardName})`);
      for (const issue of result.issues) {
        console.log(`    ${issue}`);
      }
    }
    console.log('');
  }

  // OK (only in verbose mode)
  if (verbose && ok.length > 0) {
    console.log('OK - No Issues');
    console.log('-'.repeat(40));
    for (const result of ok) {
      console.log(`[OK] ${result.cardId} (${result.cardName})`);
    }
    console.log('');
  }

  console.log('='.repeat(70));

  if (errors.length > 0) {
    console.log(`\n[!] Found ${errors.length} card(s) with likely WRONG effects assigned.`);
    console.log('    These cards should be investigated and fixed in the database.');
  } else {
    console.log('\n[OK] No obvious effect mismatches found.');
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const verbose = process.argv.includes('--verbose');

  console.log('Running card effects validation...');

  try {
    const results = await runValidation(verbose);
    printReport(results, verbose);

    // Exit with error code if there are errors
    const errors = results.filter(r => r.severity === 'ERROR');
    if (errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
