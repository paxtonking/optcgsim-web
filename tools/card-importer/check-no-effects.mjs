import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const cards = await prisma.card.findMany({
  where: { 
    effectText: { not: null },
    NOT: { effectText: '' }
  },
  select: { id: true, name: true, type: true, effectText: true, effects: true }
});

const noEffectsCards = cards.filter(c => !Array.isArray(c.effects) || c.effects.length === 0);

console.log('Cards with effectText but no DB effects: ' + noEffectsCards.length);
console.log('\nSample cards by type:');

const byType = {};
for (const c of noEffectsCards) {
  if (!byType[c.type]) byType[c.type] = [];
  if (byType[c.type].length < 3) byType[c.type].push(c);
}

for (const [type, cards] of Object.entries(byType)) {
  console.log('\n=== ' + type + ' ===');
  for (const c of cards) {
    console.log(c.id + ': ' + c.name);
    const text = c.effectText || '';
    console.log('  Effect: ' + text.substring(0, 150) + '...');
  }
}

await prisma.$disconnect();
