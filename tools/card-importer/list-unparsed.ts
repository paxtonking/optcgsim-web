import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('unparsed-analysis.json', 'utf8'));

console.log('=== REMAINING UNPARSED CARDS (' + data.needsReview.length + ') ===\n');

// Group by pattern type
const patterns: Record<string, Array<{id: string, name: string, text: string}>> = {};

for (const card of data.needsReview) {
  const text = card.effectText;
  let patternType = 'OTHER';

  if (/DON!!\s*[−\-]\d+/.test(text)) {
    patternType = 'DON_MINUS_COST';
  } else if (/rest this card and/.test(text)) {
    patternType = 'REST_MULTIPLE_COST';
  } else if (/would be K\.?O\.?'?d/.test(text)) {
    patternType = 'REPLACEMENT_EFFECT';
  } else if (/[Ss]wap.*power/.test(text)) {
    patternType = 'SWAP_POWER';
  } else if (/[Cc]hange.*attack target/.test(text)) {
    patternType = 'REDIRECT_ATTACK';
  } else if (/cannot.*K\.?O\.?'?d.*until/.test(text)) {
    patternType = 'TEMP_IMMUNITY';
  } else if (/rest up to.*Leader or Character/.test(text)) {
    patternType = 'REST_LEADER_OR_CHAR';
  } else if (/Look at all.*Life/.test(text)) {
    patternType = 'LOOK_ALL_LIFE';
  } else if (/cannot.*add Life/.test(text)) {
    patternType = 'PREVENT_LIFE_ADD';
  } else if (/opponent rests/.test(text)) {
    patternType = 'OPPONENT_RESTS';
  } else if (/cannot be rested/.test(text)) {
    patternType = 'PREVENT_REST';
  }

  if (!patterns[patternType]) patterns[patternType] = [];
  patterns[patternType].push({ id: card.id, name: card.name, text: card.effectText });
}

// Print grouped
for (const [pattern, cards] of Object.entries(patterns).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n=== ${pattern} (${cards.length} cards) ===`);
  for (const card of cards) {
    console.log(`\n[${card.id}] ${card.name}`);
    console.log(`  ${card.text.substring(0, 200)}${card.text.length > 200 ? '...' : ''}`);
  }
}
