import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find cards with "Five Elders" in traits (traits is an array)
  const cards = await prisma.card.findMany({
    where: {
      traits: {
        hasSome: ['Five Elders']
      }
    },
    select: {
      id: true,
      name: true,
      type: true,
      traits: true
    },
    take: 10
  });

  console.log('Cards with "Five Elders" trait:\n');
  for (const card of cards) {
    console.log(card.id + ' - ' + card.name);
    console.log('  Type: ' + card.type);
    console.log('  Traits: ' + JSON.stringify(card.traits));
    console.log('');
  }

  // Check Celestial Dragons cards
  const celestialCards = await prisma.card.findMany({
    where: {
      traits: {
        hasSome: ['Celestial Dragons']
      }
    },
    select: {
      id: true,
      name: true,
      traits: true
    },
    take: 5
  });

  console.log('\nCards with "Celestial Dragons" trait:\n');
  for (const card of celestialCards) {
    console.log(card.id + ' - ' + card.name);
    console.log('  Traits: ' + JSON.stringify(card.traits));
    console.log('');
  }
}

main().then(() => prisma.$disconnect());
