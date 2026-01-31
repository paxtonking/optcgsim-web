import { PrismaClient } from '@prisma/client';
import { effectTextParser } from '@optcgsim/shared';

const prisma = new PrismaClient();

async function main() {
  const card = await prisma.card.findUnique({
    where: { id: 'OP05-084' },
    select: { id: true, name: true, effectText: true }
  });

  if (card) {
    console.log('Card:', card.id, '-', card.name);
    console.log('Effect Text:', card.effectText);
    console.log('');
    
    const parsed = effectTextParser.parse(card.effectText || '', card.id);
    console.log('Parsed effects:');
    console.log(JSON.stringify(parsed, null, 2));
  }
}

main().then(() => prisma.$disconnect());
