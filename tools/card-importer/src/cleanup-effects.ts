#!/usr/bin/env tsx
/**
 * cleanup-effects.ts
 *
 * Clears mismatched structured effects from the database.
 * Only affects cards flagged as ERROR by validate-effects.ts.
 * Creates a backup before making changes.
 *
 * Usage:
 *   npm run cleanup              # Preview changes (dry run)
 *   npm run cleanup -- --execute # Actually make changes
 */

import { PrismaClient } from '@prisma/client';
import {
  EffectTrigger,
  EffectType,
  type CardEffectDefinition,
  EffectTextParser,
} from '@optcgsim/shared';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const parser = new EffectTextParser(false);

// ============================================
// VALIDATION LOGIC (copied from validate-effects.ts)
// ============================================

interface EffectSummary {
  triggers: Set<string>;
  effectTypes: Set<string>;
  keywords: Set<string>;
}

const KEYWORD_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\[Rush\]/i, keyword: 'Rush' },
  { pattern: /\[Blocker\]/i, keyword: 'Blocker' },
  { pattern: /\[Banish\]/i, keyword: 'Banish' },
  { pattern: /\[Double Attack\]/i, keyword: 'Double Attack' },
];

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

function extractKeywordsFromText(text: string): Set<string> {
  const keywords = new Set<string>();
  for (const { pattern, keyword } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) keywords.add(keyword);
  }
  return keywords;
}

function extractTriggersFromText(text: string): Set<string> {
  const triggers = new Set<string>();
  for (const { pattern, trigger } of TRIGGER_PATTERNS) {
    if (pattern.test(text)) triggers.add(trigger);
  }
  return triggers;
}

function extractEffectTypesFromText(text: string): Set<string> {
  const types = new Set<string>();
  for (const { pattern, types: matchTypes } of EFFECT_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      for (const t of matchTypes) types.add(t);
    }
  }
  return types;
}

function extractFromDbEffects(effects: CardEffectDefinition[]): EffectSummary {
  const summary: EffectSummary = {
    triggers: new Set(),
    effectTypes: new Set(),
    keywords: new Set(),
  };

  for (const effect of effects) {
    if (effect.trigger) summary.triggers.add(effect.trigger);
    if (effect.effects && Array.isArray(effect.effects)) {
      for (const action of effect.effects) {
        if (action.type) {
          summary.effectTypes.add(action.type);
          if ([EffectType.RUSH, EffectType.BLOCKER, EffectType.BANISH, EffectType.DOUBLE_ATTACK].includes(action.type as EffectType)) {
            summary.keywords.add(action.type);
          }
          if (action.type === EffectType.GRANT_KEYWORD && action.keyword) {
            summary.keywords.add(action.keyword);
          }
        }
        if (action.childEffects && Array.isArray(action.childEffects)) {
          for (const child of action.childEffects) {
            if (child.type) summary.effectTypes.add(child.type);
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
  try {
    const parsed = parser.parse(effectText, cardId);
    const parsedSummary = extractFromDbEffects(parsed);
    for (const t of parsedSummary.triggers) summary.triggers.add(t);
    for (const e of parsedSummary.effectTypes) summary.effectTypes.add(e);
    for (const k of parsedSummary.keywords) summary.keywords.add(k);
  } catch (e) {}
  return summary;
}

function setOverlap<T>(a: Set<T>, b: Set<T>): number {
  let overlap = 0;
  for (const item of a) {
    if (b.has(item)) overlap++;
  }
  return overlap;
}

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

type Severity = 'ERROR' | 'WARNING' | 'INFO' | 'OK';

function validateCard(cardId: string, effectText: string, effects: CardEffectDefinition[]): Severity {
  const dbSummary = extractFromDbEffects(effects);
  const textSummary = extractFromText(effectText, cardId);

  // Empty effectText with database effects
  if (!effectText || effectText.trim() === '') {
    return 'WARNING';
  }

  // Compare triggers
  const triggerOverlap = setOverlap(dbSummary.triggers, textSummary.triggers);
  if (dbSummary.triggers.size > 0 && textSummary.triggers.size > 0 && triggerOverlap === 0) {
    return 'ERROR';
  }

  // Compare effect types
  const dbTypeCategories = categorizeEffectTypes(dbSummary.effectTypes);
  const textTypeCategories = categorizeEffectTypes(textSummary.effectTypes);
  const categoryOverlap = setOverlap(dbTypeCategories, textTypeCategories);
  if (dbTypeCategories.size > 0 && textTypeCategories.size > 0 && categoryOverlap === 0) {
    return 'ERROR';
  }

  return 'OK';
}

// ============================================
// CLEANUP LOGIC
// ============================================

interface CardToClean {
  id: string;
  name: string;
  effectText: string;
  effects: CardEffectDefinition[];
  severity: Severity;
}

async function findCardsToClean(): Promise<{
  errors: CardToClean[];
  warnings: CardToClean[];
  ok: CardToClean[];
}> {
  const cards = await prisma.card.findMany({
    select: {
      id: true,
      name: true,
      effectText: true,
      effects: true,
    },
  });

  const errors: CardToClean[] = [];
  const warnings: CardToClean[] = [];
  const ok: CardToClean[] = [];

  for (const card of cards) {
    const rawEffects = card.effects;
    const effects = (Array.isArray(rawEffects) ? rawEffects : []) as CardEffectDefinition[];

    if (effects.length === 0) continue;

    const severity = validateCard(card.id, card.effectText || '', effects);
    const cardData: CardToClean = {
      id: card.id,
      name: card.name,
      effectText: card.effectText || '',
      effects,
      severity,
    };

    if (severity === 'ERROR') {
      errors.push(cardData);
    } else if (severity === 'WARNING') {
      warnings.push(cardData);
    } else {
      ok.push(cardData);
    }
  }

  return { errors, warnings, ok };
}

async function createBackup(cards: CardToClean[]): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, `effects-backup-${timestamp}.json`);

  const backupData = cards.map(card => ({
    id: card.id,
    name: card.name,
    effects: card.effects,
  }));

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  return backupPath;
}

async function clearEffects(cards: CardToClean[]): Promise<number> {
  let cleared = 0;

  for (const card of cards) {
    await prisma.card.update({
      where: { id: card.id },
      data: { effects: [] },
    });
    cleared++;
  }

  return cleared;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const execute = process.argv.includes('--execute');
  const includeWarnings = process.argv.includes('--include-warnings');

  console.log('');
  console.log('='.repeat(60));
  console.log('         CLEANUP MISMATCHED CARD EFFECTS');
  console.log('='.repeat(60));
  console.log('');

  // Find cards
  console.log('Analyzing cards...\n');
  const { errors, warnings, ok } = await findCardsToClean();

  // Determine which cards to clear
  const cardsToClear = includeWarnings ? [...errors, ...warnings] : errors;

  console.log('ANALYSIS RESULTS');
  console.log('-'.repeat(40));
  console.log(`ERROR cards (will be cleared):    ${errors.length}`);
  console.log(`WARNING cards ${includeWarnings ? '(will be cleared):  ' : '(need review):      '}${warnings.length}`);
  console.log(`OK cards (will be kept):          ${ok.length}`);
  console.log('');

  // List ERROR cards
  console.log('CARDS TO CLEAR (ERROR):');
  console.log('-'.repeat(40));
  for (const card of errors) {
    console.log(`  ${card.id} - ${card.name}`);
  }
  console.log('');

  // List WARNING cards
  if (warnings.length > 0) {
    if (includeWarnings) {
      console.log('CARDS TO CLEAR (WARNING):');
    } else {
      console.log('CARDS NEEDING MANUAL REVIEW (WARNING):');
    }
    console.log('-'.repeat(40));
    for (const card of warnings) {
      console.log(`  ${card.id} - ${card.name}`);
      console.log(`    (has effects but empty effectText)`);
    }
    console.log('');
  }

  // List OK cards
  console.log('CARDS TO KEEP (OK):');
  console.log('-'.repeat(40));
  for (const card of ok) {
    console.log(`  ${card.id} - ${card.name}`);
  }
  console.log('');

  if (!execute) {
    console.log('='.repeat(60));
    console.log('DRY RUN - No changes made.');
    console.log('');
    console.log('To execute the cleanup, run:');
    console.log('  npm run cleanup -- --execute');
    if (!includeWarnings && warnings.length > 0) {
      console.log('');
      console.log('To also clear WARNING cards, add --include-warnings:');
      console.log('  npm run cleanup -- --execute --include-warnings');
    }
    console.log('='.repeat(60));
    return;
  }

  // Create backup
  console.log('Creating backup...');
  const backupPath = await createBackup(cardsToClear);
  console.log(`Backup saved to: ${backupPath}`);
  console.log('');

  // Clear effects
  console.log('Clearing mismatched effects...');
  const cleared = await clearEffects(cardsToClear);
  console.log(`Cleared effects from ${cleared} cards.`);
  console.log('');

  console.log('='.repeat(60));
  console.log('CLEANUP COMPLETE');
  console.log('');
  console.log(`- ${cleared} cards had their effects cleared`);
  console.log(`- These cards will now use effectTextParser`);
  console.log(`- Backup saved to: ${backupPath}`);
  console.log('');
  console.log('Run validation again to verify:');
  console.log('  npm run validate');
  console.log('='.repeat(60));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
