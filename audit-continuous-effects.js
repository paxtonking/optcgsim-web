const cards = require('./packages/client/public/data/cards.json');

// Find cards with [Your Turn], [Opponent's Turn]
const yourTurn = cards.filter(c => c.effect && c.effect.includes('[Your Turn]'));
const oppTurn = cards.filter(c => c.effect && (c.effect.includes("[Opponent's Turn]") || c.effect.includes('[Opponent Turn]')));

// Effect patterns in [Your Turn] effects
const yourTurnPatterns = {};
yourTurn.forEach(c => {
  const part = c.effect.split('[Your Turn]')[1] || '';
  if (part.includes('power')) yourTurnPatterns['power'] = (yourTurnPatterns['power'] || 0) + 1;
  if (part.includes('cost')) yourTurnPatterns['cost'] = (yourTurnPatterns['cost'] || 0) + 1;
  if (part.includes('gains [')) yourTurnPatterns['keyword'] = (yourTurnPatterns['keyword'] || 0) + 1;
  if (part.includes('set the base power')) yourTurnPatterns['set_base_power'] = (yourTurnPatterns['set_base_power'] || 0) + 1;
  if (part.includes('[Once Per Turn]')) yourTurnPatterns['once_per_turn'] = (yourTurnPatterns['once_per_turn'] || 0) + 1;
});

console.log('=== [Your Turn] Effects ===');
console.log('Total cards:', yourTurn.length);
console.log('By type:');
['LEADER', 'CHARACTER', 'STAGE', 'EVENT'].forEach(t => {
  console.log('  ' + t + ':', yourTurn.filter(c => c.type === t).length);
});
console.log('Patterns found:', yourTurnPatterns);

console.log('');
console.log("=== [Opponent's Turn] Effects ===");
console.log('Total cards:', oppTurn.length);
console.log('By type:');
['LEADER', 'CHARACTER', 'STAGE', 'EVENT'].forEach(t => {
  console.log('  ' + t + ':', oppTurn.filter(c => c.type === t).length);
});

// Sample non-stage cards with [Your Turn] that DON'T have [Once Per Turn]
const continuousYourTurn = yourTurn.filter(c => {
  const part = c.effect.split('[Your Turn]')[1] || '';
  return !part.includes('[Once Per Turn]') && c.type !== 'STAGE';
});
console.log('');
console.log('=== Continuous [Your Turn] effects (non-stage, not once per turn) ===');
console.log('Total:', continuousYourTurn.length);
continuousYourTurn.slice(0, 15).forEach(c => {
  const part = c.effect.split('[Your Turn]')[1] || '';
  console.log(c.type + ' ' + c.cardNumber + ': [Your Turn]' + part.substring(0, 100));
});

// Opponent turn non-stage
const continuousOppTurn = oppTurn.filter(c => c.type !== 'STAGE');
console.log('');
console.log("=== Continuous [Opponent's Turn] effects (non-stage) ===");
console.log('Total:', continuousOppTurn.length);
continuousOppTurn.slice(0, 15).forEach(c => {
  const effect = c.effect || '';
  const match = effect.match(/\[Opponent'?s?\s*Turn\](.*?)(?:\[|$)/s);
  const part = match ? match[1] : '';
  console.log(c.type + ' ' + c.cardNumber + ": [Opponent's Turn]" + part.substring(0, 100));
});

// Categorize effect types needed
console.log('');
console.log('=== Effect Type Analysis ===');

const allContinuous = [...continuousYourTurn, ...continuousOppTurn];
const effectTypes = {
  power_buff: [],
  power_debuff: [],
  cost_reduction: [],
  cost_increase: [],
  grant_keyword: [],
  set_base_power: [],
  grant_ability: [],
  other: []
};

allContinuous.forEach(c => {
  const effect = c.effect || '';
  if (effect.match(/\+\d+.*power|gains?\s+\+\d+/i)) effectTypes.power_buff.push(c.cardNumber);
  else if (effect.match(/-\d+.*power|loses?\s+-?\d+.*power/i)) effectTypes.power_debuff.push(c.cardNumber);
  else if (effect.match(/cost.*-\d+|reduce.*cost|-\d+.*cost/i)) effectTypes.cost_reduction.push(c.cardNumber);
  else if (effect.match(/cost.*\+\d+|\+\d+.*cost/i)) effectTypes.cost_increase.push(c.cardNumber);
  else if (effect.match(/gains?\s+\[/i)) effectTypes.grant_keyword.push(c.cardNumber);
  else if (effect.match(/set.*base\s*power|base\s*power.*becomes/i)) effectTypes.set_base_power.push(c.cardNumber);
  else effectTypes.other.push(c.cardNumber);
});

Object.entries(effectTypes).forEach(([type, cards]) => {
  if (cards.length > 0) {
    console.log(type + ':', cards.length, 'cards');
    console.log('  Sample:', cards.slice(0, 5).join(', '));
  }
});
