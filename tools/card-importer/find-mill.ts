import { PrismaClient } from '@prisma/client';
import { effectTextParser } from '@optcgsim/shared';

const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      effectText: {
        contains: 'Trash'
      },
      AND: {
        effectText: {
          contains: 'top of your deck'
        }
      }
    },
    select: { id: true, name: true, effectText: true },
    take: 10
  });

  console.log('Found', cards.length, 'cards with "Trash...top of your deck":\n');
  for (const card of cards) {
    console.log('=== ' + card.id + ' - ' + card.name + ' ===');
    console.log('Effect:', card.effectText);
    console.log('');
    
    const parsed = effectTextParser.parse(card.effectText || '', card.id);
    console.log('Parsed trigger:', parsed[0]?.trigger);
    console.log('Parsed effects:', parsed[0]?.effects.map(e => e.type));
    console.log('');
  }
}

main().then(() => prisma.$disconnect());
