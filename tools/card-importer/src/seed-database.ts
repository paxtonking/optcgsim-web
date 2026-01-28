#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface CardData {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  colors: string[];
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string | null;
  effect: string | null;
  trigger: string | null;
  traits?: string[];
  life?: number;  // Life count for leaders (4 or 5)
  imageUrl: string;
}

interface DeckCard {
  cardId: string;
  count: number;
  name: string;
}

interface DeckData {
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
  }

  return systemUser.id;
}

async function main() {
  try {
    console.log('Loading card data...');
    // Use the client data which has traits
    const cardsPath = path.join(__dirname, '../../../packages/client/public/data/cards.json');
    const cardsData = await fs.readFile(cardsPath, 'utf-8');
    const cards: CardData[] = JSON.parse(cardsData);

    console.log(`Found ${cards.length} cards to import`);

    // Preserve existing structured effects before clearing
    console.log('Preserving existing structured effects...');
    const existingCards = await prisma.card.findMany({
      select: { id: true, effects: true }
    });
    const preservedEffects = new Map<string, unknown>();
    let preservedCount = 0;
    for (const card of existingCards) {
      // Only preserve if effects is an array with items (structured effects)
      if (Array.isArray(card.effects) && card.effects.length > 0) {
        preservedEffects.set(card.id, card.effects);
        preservedCount++;
      }
    }
    console.log(`  Preserved effects for ${preservedCount} cards`);

    // Clear existing cards
    console.log('Clearing existing cards...');
    await prisma.card.deleteMany();
    await prisma.cardSet.deleteMany();

    // Track unique sets
    const sets = new Map<string, { name: string; count: number }>();

    // Import cards
    console.log('Importing cards...');
    let imported = 0;
    
    for (const card of cards) {
      // Track sets
      if (!sets.has(card.setCode)) {
        sets.set(card.setCode, { 
          name: card.setName || card.setCode, 
          count: 0 
        });
      }
      sets.get(card.setCode)!.count++;

      try {
        // Use preserved structured effects if available, otherwise use raw effect text
        const existingEffects = preservedEffects.get(card.id);
        const effects = existingEffects ?? (card.effect ? { raw: card.effect } : {});

        // Combine effect and trigger fields into effectText
        // The effect field may already contain trigger text (from new scraper)
        // But for backwards compatibility, also check trigger field separately
        let effectText = card.effect || '';
        if (card.trigger && !effectText.includes(card.trigger)) {
          effectText = effectText ? `${effectText} ${card.trigger}` : card.trigger;
        }

        await prisma.card.create({
          data: {
            id: card.id,
            setCode: card.setCode,
            cardNumber: card.cardNumber,
            name: card.name,
            type: card.type || 'UNKNOWN',
            colors: card.colors || [],
            cost: card.cost,
            power: card.power,
            counter: card.counter,
            attribute: card.attribute,
            traits: card.traits || [],
            life: card.type === 'LEADER' ? (card.life ?? 5) : null,
            effects,
            effectText,
            imageUrl: card.imageUrl || `/cards/${card.setCode}/${card.id}.png`,
          }
        });
        imported++;
        
        if (imported % 100 === 0) {
          console.log(`  Imported ${imported} cards...`);
        }
      } catch (error) {
        console.error(`Failed to import card ${card.cardID}:`, error);
      }
    }

    // Import card sets
    console.log('\nImporting card sets...');
    for (const [code, info] of sets.entries()) {
      await prisma.cardSet.create({
        data: {
          code: code,
          name: info.name,
          releaseDate: new Date(), // We don't have real dates from the API
          cardCount: info.count,
        }
      });
    }

    console.log(`\nSuccessfully imported:`);
    console.log(`  - ${imported} cards`);
    console.log(`  - ${sets.size} card sets`);
    console.log(`  - ${preservedCount} cards with preserved structured effects`);

    // Show some stats
    const leaders = await prisma.card.count({ where: { type: 'LEADER' } });
    const characters = await prisma.card.count({ where: { type: 'CHARACTER' } });
    const events = await prisma.card.count({ where: { type: 'EVENT' } });
    const stages = await prisma.card.count({ where: { type: 'STAGE' } });

    console.log(`\nCard types:`);
    console.log(`  - Leaders: ${leaders}`);
    console.log(`  - Characters: ${characters}`);
    console.log(`  - Events: ${events}`);
    console.log(`  - Stages: ${stages}`);

    // === DECK SEEDING ===
    console.log('\n--- Seeding Decks ---');

    // Load deck data
    const decksPath = path.join(__dirname, '../../../packages/client/public/data/decks.json');
    let decks: DeckData[] = [];

    try {
      const decksData = await fs.readFile(decksPath, 'utf-8');
      decks = JSON.parse(decksData);
      console.log(`Found ${decks.length} decks to import`);
    } catch (error) {
      console.log('No decks.json found, skipping deck seeding');
    }

    if (decks.length > 0) {
      // Get or create system user
      const userId = await getOrCreateSystemUser();

      // Import each deck
      let decksImported = 0;
      let decksSkipped = 0;

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
          console.log(`  Skipping "${deck.name}" - already exists`);
          decksSkipped++;
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

        console.log(`  Imported "${deck.name}" - Leader: ${deck.leaderName}`);
        decksImported++;
      }

      console.log(`\nDeck import complete:`);
      console.log(`  - Imported: ${decksImported}`);
      console.log(`  - Skipped: ${decksSkipped}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();