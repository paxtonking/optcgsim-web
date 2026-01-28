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
  traits?: string[];
}

async function main() {
  try {
    console.log('Loading card data with traits...');
    // Use the client data which has traits
    const cardsPath = path.join(__dirname, '../../../packages/client/public/data/cards.json');
    const cardsData = await fs.readFile(cardsPath, 'utf-8');
    const cards: CardData[] = JSON.parse(cardsData);

    console.log(`Found ${cards.length} cards`);

    // Filter to only cards with traits
    const cardsWithTraits = cards.filter(c => c.traits && c.traits.length > 0);
    console.log(`Found ${cardsWithTraits.length} cards with traits`);

    // Update each card's traits
    let updated = 0;
    for (const card of cardsWithTraits) {
      try {
        await prisma.card.update({
          where: { id: card.id },
          data: { traits: card.traits }
        });
        updated++;
        if (updated % 100 === 0) {
          console.log(`  Updated ${updated} cards...`);
        }
      } catch (error) {
        // Card might not exist in DB, skip it
      }
    }

    console.log(`\nSuccessfully updated traits for ${updated} cards`);

    // Verify a sample card
    const sample = await prisma.card.findUnique({
      where: { id: 'OP13-082' },
      select: { id: true, name: true, traits: true }
    });
    console.log('\nSample card verification:');
    console.log(`  ${sample?.id} - ${sample?.name}: traits = ${JSON.stringify(sample?.traits)}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
