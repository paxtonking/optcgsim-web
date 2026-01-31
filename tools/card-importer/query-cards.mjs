import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const cards = await prisma.card.findMany({
  where: { id: { in: ['EB01-012', 'EB02-010', 'OP14-003', 'OP14-102', 'OP14-111', 'ST22-002'] } },
  select: { id: true, name: true, effectText: true }
});
for (const c of cards) {
  console.log('---', c.id, c.name, '---');
  console.log(c.effectText);
  console.log('');
}
await prisma.$disconnect();
