#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface DeckCard {
  cardId: string;
  count: number;
  name: string;
}

interface ScrapedDeck {
  name: string;
  leaderId: string;
  leaderName: string;
  cards: DeckCard[];
  sourceUrl: string;
}

async function getOrCreateSystemUser(): Promise<string> {
  // Look for existing system user
  let systemUser = await prisma.user.findFirst({
    where: { username: 'System' }
  });

  if (!systemUser) {
    // Create system user for sample decks
    systemUser = await prisma.user.create({
      data: {
        username: 'System',
        email: 'system@optcgsim.local',
        passwordHash: 'SYSTEM_USER_NO_LOGIN',
        isAdmin: false,
      }
    });
    console.log('Created System user for sample decks');
  } else {
    console.log('Using existing System user');
  }

  return systemUser.id;
}

async function main() {
  console.log('=== Deck Importer ===\n');

  // Load scraped decks from the canonical data location
  const decksPath = path.join(__dirname, '../../../packages/client/public/data/decks.json');
  let decks: ScrapedDeck[];

  try {
    const decksData = await fs.readFile(decksPath, 'utf-8');
    decks = JSON.parse(decksData);
  } catch (error) {
    console.error('Failed to load decks.json from packages/client/public/data/decks.json.');
    console.error('Run scrape-decks.ts first or ensure decks.json exists.');
    process.exit(1);
  }

  console.log(`Found ${decks.length} decks to import\n`);

  // Get or create system user
  const userId = await getOrCreateSystemUser();

  // Import each deck
  let imported = 0;
  let skipped = 0;

  for (const deck of decks) {
    // Check if deck already exists (by name and leader)
    const existing = await prisma.deck.findFirst({
      where: {
        name: deck.name,
        leaderId: deck.leaderId,
        userId: userId
      }
    });

    if (existing) {
      console.log(`Skipping "${deck.name}" - already exists`);
      skipped++;
      continue;
    }

    // Convert cards to the format expected by the Deck model
    const cardsJson = deck.cards.map(c => ({
      cardId: c.cardId,
      count: c.count
    }));

    // Create the deck
    await prisma.deck.create({
      data: {
        name: deck.name,
        leaderId: deck.leaderId,
        cards: cardsJson,
        isPublic: true,
        userId: userId,
      }
    });

    console.log(`Imported "${deck.name}" - Leader: ${deck.leaderName}`);
    imported++;
  }

  console.log(`\n=== Complete ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
