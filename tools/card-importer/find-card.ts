import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      effectText: {
        contains: 'Celestial Dragons'
      }
    },
    select: {
      id: true,
      name: true,
      type: true,
      effectText: true,
      effects: true
    }
  });

  console.log('Found ' + cards.length + ' cards:\n');
  for (const card of cards) {
    console.log('=== ' + card.id + ' - ' + card.name + ' (' + card.type + ') ===');
    console.log('Effect: ' + card.effectText);
    console.log('');
  }
}

main().then(() => prisma.$disconnect());
