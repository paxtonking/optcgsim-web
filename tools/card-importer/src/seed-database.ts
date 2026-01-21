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
  imageUrl: string;
}

async function main() {
  try {
    console.log('Loading card data...');
    const cardsPath = path.join(__dirname, '../output/cards.json');
    const cardsData = await fs.readFile(cardsPath, 'utf-8');
    const cards: CardData[] = JSON.parse(cardsData);
    
    console.log(`Found ${cards.length} cards to import`);

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
            traits: [], // Not in the current data
            effects: card.effect ? { raw: card.effect } : {},
            effectText: card.effect || '',
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

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();