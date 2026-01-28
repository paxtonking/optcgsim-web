#!/usr/bin/env tsx
/**
 * analyze-unparsed.ts
 *
 * Analyzes cards with effectText to identify which ones have no parsed effects
 * and categorizes them for tracking purposes.
 */

import { PrismaClient } from '@prisma/client';
import { effectTextParser } from '@optcgsim/shared';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface CardInfo {
  id: string;
  name: string;
  type: string;
  effectText: string;
}

interface AnalysisResult {
  generatedAt: string;
  summary: {
    totalWithEffectText: number;
    parsedSuccessfully: number;
    keywordsOnly: number;
    counterOnly: number;
    triggerOnly: number;
    needsReview: number;
  };
  // Cards that are correctly identified as having no actionable effects
  verifiedNoEffects: {
    keywordsOnly: string[];  // Card IDs
    counterOnly: string[];
    triggerOnly: string[];
  };
  // Cards that need manual review - parser couldn't handle them
  needsReview: Array<{
    id: string;
    name: string;
    type: string;
    effectText: string;
  }>;
}

async function analyze(): Promise<AnalysisResult> {
  console.log('Loading cards from database...');

  const cards = await prisma.card.findMany({
    where: {
      effectText: { not: '' }
    },
    select: {
      id: true,
      name: true,
      type: true,
      effectText: true
    }
  });

  console.log(`Found ${cards.length} cards with effectText`);

  const result: AnalysisResult = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalWithEffectText: cards.length,
      parsedSuccessfully: 0,
      keywordsOnly: 0,
      counterOnly: 0,
      triggerOnly: 0,
      needsReview: 0,
    },
    verifiedNoEffects: {
      keywordsOnly: [],
      counterOnly: [],
      triggerOnly: [],
    },
    needsReview: [],
  };

  let processed = 0;
  for (const card of cards) {
    processed++;
    if (processed % 500 === 0) {
      console.log(`Processing ${processed}/${cards.length}...`);
    }

    // Try to parse the effect
    let parsed: any[] = [];
    try {
      parsed = effectTextParser.parse(card.effectText, card.id);
    } catch (e) {
      // Parse failed
    }

    if (parsed && parsed.length > 0) {
      result.summary.parsedSuccessfully++;
      continue;
    }

    // Card has effectText but no parsed effects - categorize it
    const text = card.effectText.trim();
    const textLower = text.toLowerCase();

    // Check if it's keywords only (Rush, Blocker, etc.)
    if (/^(Rush|Blocker|Double Attack|Banish)$/i.test(text)) {
      result.summary.keywordsOnly++;
      result.verifiedNoEffects.keywordsOnly.push(card.id);
      continue;
    }

    // Check if it's just a counter value
    if (/^Counter \+\d+$/i.test(text)) {
      result.summary.counterOnly++;
      result.verifiedNoEffects.counterOnly.push(card.id);
      continue;
    }

    // Check if it's just "[Trigger] Add this card to your hand"
    if (/^\[Trigger\]\s*Add this card to your hand\.?$/i.test(text)) {
      result.summary.triggerOnly++;
      result.verifiedNoEffects.triggerOnly.push(card.id);
      continue;
    }

    // This card needs review - has effect text but we couldn't parse it
    result.summary.needsReview++;
    result.needsReview.push({
      id: card.id,
      name: card.name,
      type: card.type,
      effectText: card.effectText,
    });
  }

  return result;
}

async function main() {
  try {
    const result = await analyze();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total cards with effectText: ${result.summary.totalWithEffectText}`);
    console.log(`Parsed successfully:         ${result.summary.parsedSuccessfully}`);
    console.log(`Keywords only (no effects):  ${result.summary.keywordsOnly}`);
    console.log(`Counter only (no effects):   ${result.summary.counterOnly}`);
    console.log(`Trigger only (no effects):   ${result.summary.triggerOnly}`);
    console.log(`NEEDS REVIEW:                ${result.summary.needsReview}`);
    console.log('');

    // Show first 30 cards needing review
    if (result.needsReview.length > 0) {
      console.log('='.repeat(60));
      console.log('CARDS NEEDING REVIEW (first 30)');
      console.log('='.repeat(60));
      for (const card of result.needsReview.slice(0, 30)) {
        console.log(`\n${card.id} [${card.type}] - ${card.name}`);
        console.log(`  ${card.effectText.substring(0, 150).replace(/\n/g, ' ')}...`);
      }
    }

    // Save full report to JSON
    const outputPath = path.join(__dirname, '..', 'unparsed-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nFull report saved to: ${outputPath}`);

  } catch (error) {
    console.error('Analysis failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
