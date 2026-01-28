#!/usr/bin/env tsx
/**
 * Fetches life data for leader cards from Limitless TCG
 * and updates the cards.json file with life counts
 */

import * as fs from 'fs';
import * as path from 'path';

interface Card {
  id: string;
  name: string;
  type: string;
  life?: number;
  [key: string]: unknown;
}

const LIMITLESS_BASE = 'https://onepiece.limitlesstcg.com/cards';

// Rate limit delay (ms) to avoid overwhelming the server
const DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLifeCount(cardId: string): Promise<number | null> {
  try {
    const url = `${LIMITLESS_BASE}/${cardId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OPTCGSim-CardImporter/1.0'
      }
    });

    if (!response.ok) {
      console.log(`  Warning: ${cardId} returned ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Look for life count pattern in the HTML
    // The page shows "X Life" for leaders
    const lifeMatch = html.match(/(\d+)\s*Life/i);
    if (lifeMatch) {
      return parseInt(lifeMatch[1], 10);
    }

    // Alternative patterns
    const altMatch = html.match(/Life:\s*(\d+)/i);
    if (altMatch) {
      return parseInt(altMatch[1], 10);
    }

    return null;
  } catch (error) {
    console.log(`  Error fetching ${cardId}:`, error);
    return null;
  }
}

async function main() {
  const cardsPath = path.join(process.cwd(), 'output/cards.json');
  const clientCardsPath = path.resolve(process.cwd(), '../../packages/client/public/data/cards.json');

  // Try to load from output first, then from client
  let cards: Card[];
  let sourcePath: string;

  if (fs.existsSync(cardsPath)) {
    sourcePath = cardsPath;
    cards = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
  } else if (fs.existsSync(clientCardsPath)) {
    sourcePath = clientCardsPath;
    cards = JSON.parse(fs.readFileSync(clientCardsPath, 'utf-8'));
  } else {
    console.error('No cards.json found. Run fetch-cards.ts first.');
    process.exit(1);
  }

  console.log(`Loaded ${cards.length} cards from ${sourcePath}`);

  // Find all leader cards
  const leaders = cards.filter(card => card.type === 'LEADER');
  console.log(`Found ${leaders.length} leader cards`);

  // Fetch life data for each leader
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < leaders.length; i++) {
    const leader = leaders[i];
    console.log(`[${i + 1}/${leaders.length}] Fetching life for ${leader.id} - ${leader.name}...`);

    const life = await fetchLifeCount(leader.id);

    if (life !== null) {
      leader.life = life;
      updated++;
      console.log(`  Found: ${life} life`);
    } else {
      // Default to 5 if we couldn't fetch
      leader.life = 5;
      failed++;
      console.log(`  Not found, defaulting to 5 life`);
    }

    // Rate limit
    await sleep(DELAY_MS);
  }

  console.log(`\nResults:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed (defaulted to 5): ${failed}`);

  // Count leaders by life
  const lifeCounts = new Map<number, number>();
  for (const leader of leaders) {
    const count = lifeCounts.get(leader.life!) || 0;
    lifeCounts.set(leader.life!, count + 1);
  }

  console.log(`\nLife distribution:`);
  for (const [life, count] of Array.from(lifeCounts.entries()).sort()) {
    console.log(`  ${life} life: ${count} leaders`);
  }

  // Save updated cards
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2));
  console.log(`\nSaved to ${cardsPath}`);

  // Also update client cards
  const clientDataDir = path.dirname(clientCardsPath);
  if (!fs.existsSync(clientDataDir)) {
    fs.mkdirSync(clientDataDir, { recursive: true });
  }
  fs.writeFileSync(clientCardsPath, JSON.stringify(cards, null, 2));
  console.log(`Also saved to ${clientCardsPath}`);
}

main().catch(console.error);
