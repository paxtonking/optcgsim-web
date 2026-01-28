#!/usr/bin/env tsx
/**
 * audit-effects.ts
 *
 * Audits all card effects to identify implementation gaps.
 * Generates prioritized reports showing which effects/triggers affect the most cards.
 *
 * Usage:
 *   npm run audit              # Run full audit with console output
 *   npm run audit -- --summary # Summary only
 *   npm run audit -- --cards   # Include affected cards list
 *   npm run audit -- --json    # Export JSON report to audit-report.json
 */

import { PrismaClient } from '@prisma/client';
import {
  EffectTrigger,
  EffectType,
  IMPLEMENTED_EFFECT_TYPES,
  IMPLEMENTED_TRIGGERS,
  STUB_EFFECT_TYPES,
  effectTextParser,
  type CardEffectDefinition,
} from '@optcgsim/shared';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ============================================
// AUDIT DATA STRUCTURES
// ============================================

interface CardTypeCount {
  leader: number;
  character: number;
  event: number;
  stage: number;
}

interface EffectUsage {
  type: string;
  status: 'implemented' | 'stub' | 'unknown';
  count: number;
  cardsByType: CardTypeCount;
  sampleCards: Array<{ id: string; name: string; type: string }>;
  affectedSets: Set<string>;
}

interface TriggerUsage {
  trigger: string;
  status: 'implemented' | 'unknown';
  count: number;
  cardsByType: CardTypeCount;
  sampleCards: Array<{ id: string; name: string; type: string }>;
  affectedSets: Set<string>;
}

interface AuditReport {
  generatedAt: string;
  summary: {
    totalCards: number;
    cardsWithStructuredEffects: number;
    cardsWithoutEffects: number;
    effectTypesImplemented: number;
    effectTypesStub: number;
    effectTypesUnknown: number;
    triggersImplemented: number;
    triggersUnknown: number;
    cardsByType: CardTypeCount;
  };

  // Sorted by impact (card count)
  effectsByImpact: Array<{
    type: string;
    status: 'implemented' | 'stub' | 'unknown';
    cardCount: number;
    cardsByType: CardTypeCount;
    affectedSets: string[];
    sampleCards: Array<{ id: string; name: string; type: string }>;
  }>;

  // Sorted by impact (card count)
  triggersByImpact: Array<{
    trigger: string;
    status: 'implemented' | 'unknown';
    cardCount: number;
    cardsByType: CardTypeCount;
    affectedSets: string[];
    sampleCards: Array<{ id: string; name: string; type: string }>;
  }>;

  // Cards with unimplemented effects
  cardIssues: Array<{
    cardId: string;
    cardName: string;
    cardType: string;
    setCode: string;
    issues: string[];
  }>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createEmptyCardTypeCount(): CardTypeCount {
  return { leader: 0, character: 0, event: 0, stage: 0 };
}

function incrementCardType(counts: CardTypeCount, cardType: string): void {
  const type = cardType.toLowerCase() as keyof CardTypeCount;
  if (type in counts) {
    counts[type]++;
  }
}

function getEffectStatus(type: string): 'implemented' | 'stub' | 'unknown' {
  if (IMPLEMENTED_EFFECT_TYPES.has(type as EffectType)) return 'implemented';
  if (STUB_EFFECT_TYPES.has(type as EffectType)) return 'stub';
  return 'unknown';
}

function getTriggerStatus(trigger: string): 'implemented' | 'unknown' {
  if (IMPLEMENTED_TRIGGERS.has(trigger as EffectTrigger)) return 'implemented';
  return 'unknown';
}

function extractEffectTypes(effects: CardEffectDefinition[] | null | undefined): string[] {
  const types: string[] = [];

  if (!effects || !Array.isArray(effects)) {
    return types;
  }

  for (const effect of effects) {
    if (effect.effects && Array.isArray(effect.effects)) {
      for (const action of effect.effects) {
        if (action.type) {
          types.push(action.type);
        }
        // Check child effects
        if (action.childEffects && Array.isArray(action.childEffects)) {
          for (const child of action.childEffects) {
            if (child.type) {
              types.push(child.type);
            }
          }
        }
      }
    }
  }

  return types;
}

function extractTriggers(effects: CardEffectDefinition[] | null | undefined): string[] {
  const triggers: string[] = [];

  if (!effects || !Array.isArray(effects)) {
    return triggers;
  }

  for (const effect of effects) {
    if (effect.trigger) {
      triggers.push(effect.trigger);
    }
  }

  return triggers;
}

// ============================================
// AUDIT FUNCTIONS
// ============================================

async function runAudit(): Promise<AuditReport> {
  const effectTypes = new Map<string, EffectUsage>();
  const triggers = new Map<string, TriggerUsage>();
  const cardIssues: AuditReport['cardIssues'] = [];
  const cardsByType = createEmptyCardTypeCount();

  let cardsWithStructuredEffects = 0;
  let cardsWithoutEffects = 0;

  // Load all cards from database
  const cards = await prisma.card.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      setCode: true,
      effectText: true,
      effects: true,
    },
  });

  for (const card of cards) {
    incrementCardType(cardsByType, card.type);

    // Priority 1: Use effects from database if available
    let effects: CardEffectDefinition[] = [];
    const rawEffects = card.effects;

    if (Array.isArray(rawEffects) && rawEffects.length > 0) {
      effects = rawEffects as CardEffectDefinition[];
    }
    // Priority 2: Parse from effect text (fallback)
    else if (card.effectText) {
      try {
        effects = effectTextParser.parse(card.effectText, card.id);
      } catch (e) {
        // Failed to parse - treat as no effects
        effects = [];
      }
    }

    if (effects.length === 0) {
      cardsWithoutEffects++;
      continue;
    }

    cardsWithStructuredEffects++;

    // Track effect types
    const cardEffectTypes = extractEffectTypes(effects);
    const cardTriggers = extractTriggers(effects);
    const issues: string[] = [];

    for (const type of cardEffectTypes) {
      const status = getEffectStatus(type);

      if (!effectTypes.has(type)) {
        effectTypes.set(type, {
          type,
          status,
          count: 0,
          cardsByType: createEmptyCardTypeCount(),
          sampleCards: [],
          affectedSets: new Set(),
        });
      }

      const usage = effectTypes.get(type)!;
      usage.count++;
      incrementCardType(usage.cardsByType, card.type);
      usage.affectedSets.add(card.setCode);

      if (usage.sampleCards.length < 5) {
        usage.sampleCards.push({ id: card.id, name: card.name, type: card.type });
      }

      if (status !== 'implemented') {
        issues.push(`Uses ${type} (${status})`);
      }
    }

    for (const trigger of cardTriggers) {
      const status = getTriggerStatus(trigger);

      if (!triggers.has(trigger)) {
        triggers.set(trigger, {
          trigger,
          status,
          count: 0,
          cardsByType: createEmptyCardTypeCount(),
          sampleCards: [],
          affectedSets: new Set(),
        });
      }

      const usage = triggers.get(trigger)!;
      usage.count++;
      incrementCardType(usage.cardsByType, card.type);
      usage.affectedSets.add(card.setCode);

      if (usage.sampleCards.length < 5) {
        usage.sampleCards.push({ id: card.id, name: card.name, type: card.type });
      }

      if (status !== 'implemented') {
        issues.push(`Uses ${trigger} trigger (not implemented)`);
      }
    }

    if (issues.length > 0) {
      cardIssues.push({
        cardId: card.id,
        cardName: card.name,
        cardType: card.type,
        setCode: card.setCode,
        issues,
      });
    }
  }

  // Build sorted arrays
  const effectsByImpact = [...effectTypes.values()]
    .sort((a, b) => b.count - a.count)
    .map(e => ({
      type: e.type,
      status: e.status,
      cardCount: e.count,
      cardsByType: e.cardsByType,
      affectedSets: [...e.affectedSets].sort(),
      sampleCards: e.sampleCards,
    }));

  const triggersByImpact = [...triggers.values()]
    .sort((a, b) => b.count - a.count)
    .map(t => ({
      trigger: t.trigger,
      status: t.status,
      cardCount: t.count,
      cardsByType: t.cardsByType,
      affectedSets: [...t.affectedSets].sort(),
      sampleCards: t.sampleCards,
    }));

  // Count statuses
  const effectTypesImplemented = effectsByImpact.filter(e => e.status === 'implemented').length;
  const effectTypesStub = effectsByImpact.filter(e => e.status === 'stub').length;
  const effectTypesUnknown = effectsByImpact.filter(e => e.status === 'unknown').length;
  const triggersImplemented = triggersByImpact.filter(t => t.status === 'implemented').length;
  const triggersUnknown = triggersByImpact.filter(t => t.status === 'unknown').length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCards: cards.length,
      cardsWithStructuredEffects,
      cardsWithoutEffects,
      effectTypesImplemented,
      effectTypesStub,
      effectTypesUnknown,
      triggersImplemented,
      triggersUnknown,
      cardsByType,
    },
    effectsByImpact,
    triggersByImpact,
    cardIssues,
  };
}

// ============================================
// OUTPUT FUNCTIONS
// ============================================

function getPriority(count: number): string {
  if (count >= 50) return '[CRITICAL]';
  if (count >= 20) return '[HIGH]    ';
  if (count >= 10) return '[MEDIUM]  ';
  return '[LOW]     ';
}

function printReport(report: AuditReport, showCards: boolean = false): void {
  console.log('');
  console.log('='.repeat(80));
  console.log('                    EFFECT SYSTEM AUDIT REPORT');
  console.log('                    Generated: ' + report.generatedAt);
  console.log('='.repeat(80));
  console.log('');

  // Summary
  console.log('SUMMARY');
  console.log('-'.repeat(50));
  console.log(`Total Cards:                    ${report.summary.totalCards}`);
  console.log(`Cards with structured effects:  ${report.summary.cardsWithStructuredEffects}`);
  console.log(`Cards without effects:          ${report.summary.cardsWithoutEffects}`);
  console.log('');
  console.log('Cards by Type:');
  console.log(`   Leaders:    ${report.summary.cardsByType.leader}`);
  console.log(`   Characters: ${report.summary.cardsByType.character}`);
  console.log(`   Events:     ${report.summary.cardsByType.event}`);
  console.log(`   Stages:     ${report.summary.cardsByType.stage}`);
  console.log('');
  console.log('Effect Types:');
  console.log(`   Implemented: ${report.summary.effectTypesImplemented}`);
  console.log(`   Stub:        ${report.summary.effectTypesStub}`);
  console.log(`   Unknown:     ${report.summary.effectTypesUnknown}`);
  console.log('');
  console.log('Triggers:');
  console.log(`   Implemented: ${report.summary.triggersImplemented}`);
  console.log(`   Unknown:     ${report.summary.triggersUnknown}`);
  console.log('');

  // Implemented Effect Types (sorted by impact)
  console.log('IMPLEMENTED EFFECTS (by impact)');
  console.log('-'.repeat(50));
  const implementedEffects = report.effectsByImpact.filter(e => e.status === 'implemented');
  for (const effect of implementedEffects) {
    console.log(`  ${effect.type.padEnd(30)} ${effect.cardCount} cards`);
  }
  console.log('');

  // NOT Implemented Effect Types (prioritized)
  console.log('NOT IMPLEMENTED EFFECTS (prioritized by impact)');
  console.log('-'.repeat(50));
  const notImplementedEffects = report.effectsByImpact.filter(e => e.status !== 'implemented');

  if (notImplementedEffects.length === 0) {
    console.log('  All effect types are implemented!');
  } else {
    for (const effect of notImplementedEffects) {
      const priority = getPriority(effect.cardCount);
      const status = effect.status === 'stub' ? '[STUB]' : '[UNKNOWN]';
      console.log(`  ${priority} ${status} ${effect.type.padEnd(25)} ${effect.cardCount} cards`);
      console.log(`           L:${effect.cardsByType.leader} C:${effect.cardsByType.character} E:${effect.cardsByType.event} S:${effect.cardsByType.stage}`);
      if (effect.sampleCards.length > 0) {
        console.log(`           Sample: ${effect.sampleCards.slice(0, 3).map(c => c.id).join(', ')}`);
      }
    }
  }
  console.log('');

  // Implemented Triggers
  console.log('IMPLEMENTED TRIGGERS (by impact)');
  console.log('-'.repeat(50));
  const implementedTriggers = report.triggersByImpact.filter(t => t.status === 'implemented');
  for (const trigger of implementedTriggers) {
    console.log(`  ${trigger.trigger.padEnd(30)} ${trigger.cardCount} cards`);
  }
  console.log('');

  // NOT Implemented Triggers (prioritized)
  console.log('NOT IMPLEMENTED TRIGGERS (prioritized by impact)');
  console.log('-'.repeat(50));
  const notImplementedTriggers = report.triggersByImpact.filter(t => t.status !== 'implemented');

  if (notImplementedTriggers.length === 0) {
    console.log('  All triggers are implemented!');
  } else {
    for (const trigger of notImplementedTriggers) {
      const priority = getPriority(trigger.cardCount);
      console.log(`  ${priority} ${trigger.trigger.padEnd(25)} ${trigger.cardCount} cards`);
      console.log(`           L:${trigger.cardsByType.leader} C:${trigger.cardsByType.character} E:${trigger.cardsByType.event} S:${trigger.cardsByType.stage}`);
      if (trigger.sampleCards.length > 0) {
        console.log(`           Sample: ${trigger.sampleCards.slice(0, 3).map(c => c.id).join(', ')}`);
      }
    }
  }
  console.log('');

  // Cards with Issues
  if (showCards && report.cardIssues.length > 0) {
    console.log('CARDS WITH UNIMPLEMENTED EFFECTS');
    console.log('-'.repeat(50));
    for (const card of report.cardIssues.slice(0, 50)) {
      console.log(`${card.cardId} [${card.cardType}]: ${card.cardName}`);
      for (const issue of card.issues) {
        console.log(`   - ${issue}`);
      }
    }
    if (report.cardIssues.length > 50) {
      console.log(`... and ${report.cardIssues.length - 50} more cards`);
    }
    console.log('');
  }

  // Implementation Queue Suggestion
  console.log('SUGGESTED IMPLEMENTATION QUEUE');
  console.log('-'.repeat(50));
  const queue = [...notImplementedEffects, ...notImplementedTriggers]
    .sort((a, b) => b.cardCount - a.cardCount)
    .slice(0, 10);

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const itemType = 'type' in item ? `Effect: ${item.type}` : `Trigger: ${(item as typeof notImplementedTriggers[0]).trigger}`;
    const cardCount = 'cardCount' in item ? item.cardCount : 0;
    console.log(`  ${i + 1}. ${itemType.padEnd(40)} (${cardCount} cards)`);
  }
  console.log('');

  console.log('='.repeat(80));
}

function exportJsonReport(report: AuditReport): void {
  const outputPath = path.join(process.cwd(), 'audit-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`JSON report exported to: ${outputPath}`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const showSummary = process.argv.includes('--summary');
  const showCards = process.argv.includes('--cards');
  const exportJson = process.argv.includes('--json');

  console.log('Running effect system audit...');

  try {
    const report = await runAudit();

    if (!showSummary) {
      printReport(report, showCards);
    } else {
      // Summary only
      console.log('');
      console.log('Summary:');
      console.log(`  Total cards: ${report.summary.totalCards}`);
      console.log(`  Effects implemented: ${report.summary.effectTypesImplemented}`);
      console.log(`  Effects not implemented: ${report.summary.effectTypesStub + report.summary.effectTypesUnknown}`);
      console.log(`  Triggers implemented: ${report.summary.triggersImplemented}`);
      console.log(`  Triggers not implemented: ${report.summary.triggersUnknown}`);
    }

    if (exportJson) {
      exportJsonReport(report);
    }

    // Exit status
    const totalNotImplemented = report.summary.effectTypesStub + report.summary.effectTypesUnknown + report.summary.triggersUnknown;
    if (totalNotImplemented > 0) {
      console.log(`\n${totalNotImplemented} effect types/triggers need implementation`);
    }
  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
