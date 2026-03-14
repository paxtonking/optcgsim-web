const cards = require('./packages/client/public/data/cards.json');

// Find continuous effects (not once per turn, not stage)
const yourTurn = cards.filter(c => c.effect && c.effect.includes('[Your Turn]'));
const oppTurn = cards.filter(c => c.effect && (c.effect.includes("[Opponent's Turn]") || c.effect.includes('[Opponent Turn]')));

const continuousYourTurn = yourTurn.filter(c => {
  const part = c.effect.split('[Your Turn]')[1] || '';
  return !part.includes('[Once Per Turn]') && c.type !== 'STAGE';
});

const continuousOppTurn = oppTurn.filter(c => c.type !== 'STAGE');

const allContinuous = [...continuousYourTurn, ...continuousOppTurn];

// Find "other" - effects not matching basic patterns
const other = allContinuous.filter(c => {
  const effect = c.effect || '';
  // Skip if matches known patterns
  if (effect.match(/\+\d+.*power|gains?\s+\+\d+/i)) return false;
  if (effect.match(/-\d+.*power|loses?\s+-?\d+.*power/i)) return false;
  if (effect.match(/cost.*-\d+|reduce.*cost|-\d+.*cost/i)) return false;
  if (effect.match(/cost.*\+\d+|\+\d+.*cost/i)) return false;
  if (effect.match(/gains?\s+\[/i)) return false;
  if (effect.match(/set.*base\s*power|base\s*power.*becomes/i)) return false;
  return true;
});

console.log('=== "Other" Continuous Effects - Potential Gaps ===');
console.log('Total:', other.length);
console.log('');

// Categorize them
const categories = {
  opponent_cost_debuff: [], // Give opponent's cards -cost
  opponent_power_debuff: [], // Give opponent's cards power debuff
  attack_restriction: [], // Cannot attack / redirect
  ko_immunity: [], // Cannot be KO'd
  don_effects: [], // DON related
  on_ko_effects: [], // When KO'd triggers (mixed with continuous)
  mixed_triggers: [], // Has both continuous and triggered parts
  unknown: []
};

other.forEach(c => {
  const effect = c.effect || '';
  const lower = effect.toLowerCase();

  if (lower.includes("opponent's characters") && lower.includes('cost')) {
    categories.opponent_cost_debuff.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (lower.includes("opponent's") && lower.includes('power')) {
    categories.opponent_power_debuff.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (lower.includes('cannot attack') || lower.includes('cannot be attacked')) {
    categories.attack_restriction.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (lower.includes("cannot be k.o") || lower.includes("can't be k.o")) {
    categories.ko_immunity.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (lower.includes('don!!') || lower.includes('don cards')) {
    categories.don_effects.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (lower.includes('[on k.o.]') || lower.includes("when this character is k.o")) {
    categories.on_ko_effects.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else if (effect.includes('[On Play]') || effect.includes('[When Attacking]')) {
    categories.mixed_triggers.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 150) });
  } else {
    categories.unknown.push({ card: c.cardNumber, type: c.type, effect: effect.substring(0, 200) });
  }
});

Object.entries(categories).forEach(([cat, items]) => {
  if (items.length > 0) {
    console.log('--- ' + cat.toUpperCase() + ' (' + items.length + ' cards) ---');
    items.forEach(item => {
      console.log(item.type + ' ' + item.card + ':');
      console.log('  ' + item.effect);
      console.log('');
    });
  }
});
