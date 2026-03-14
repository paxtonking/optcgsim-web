const cards = require('./packages/client/public/data/cards.json');
const yourTurnCards = cards.filter(c => c.effect && c.effect.includes('[Your Turn]') && c.type !== 'STAGE');

// Find cards with SET_BASE_POWER pattern
const setBasePower = yourTurnCards.filter(c => {
  const effect = c.effect.toLowerCase();
  return effect.includes('set the base power') || effect.includes('base power becomes');
});

console.log('=== Cards with SET_BASE_POWER in [Your Turn] effects ===');
setBasePower.forEach(c => {
  console.log('Type:', c.type, '| Card:', c.cardNumber || c.id);
  console.log('Effect:', c.effect);
  console.log('---');
});

// Find continuous power buff effects (not [Once Per Turn])
const continuousPower = yourTurnCards.filter(c => {
  const effect = c.effect;
  const yourTurnPart = effect.split('[Your Turn]')[1] || '';
  return !yourTurnPart.includes('[Once Per Turn]') &&
         !yourTurnPart.includes('[On Play]') &&
         (yourTurnPart.includes('gains') || yourTurnPart.includes('gain')) &&
         yourTurnPart.includes('power');
});

console.log('\n=== Continuous power buff effects (not Once Per Turn, not On Play) ===');
console.log('Total:', continuousPower.length);
continuousPower.forEach(c => {
  console.log('Type:', c.type, '| Card:', c.cardNumber);
  const part = c.effect.split('[Your Turn]')[1];
  console.log('  [Your Turn]' + (part ? part.substring(0, 120) : ''));
});

// Find cost reduction effects
const costReduction = yourTurnCards.filter(c => {
  const yourTurnPart = c.effect.split('[Your Turn]')[1] || '';
  return !yourTurnPart.includes('[Once Per Turn]') &&
         !yourTurnPart.includes('[On Play]') &&
         yourTurnPart.includes('cost');
});

console.log('\n=== Continuous cost reduction effects ===');
console.log('Total:', costReduction.length);
costReduction.forEach(c => {
  console.log('Type:', c.type, '| Card:', c.cardNumber);
  const part = c.effect.split('[Your Turn]')[1];
  console.log('  [Your Turn]' + (part ? part.substring(0, 120) : ''));
});

// Find leader power buff effects
const leaderBuff = yourTurnCards.filter(c => {
  const yourTurnPart = c.effect.split('[Your Turn]')[1] || '';
  return !yourTurnPart.includes('[Once Per Turn]') &&
         yourTurnPart.includes('Leader') &&
         yourTurnPart.includes('power');
});

console.log('\n=== Leader power buff effects ===');
console.log('Total:', leaderBuff.length);
leaderBuff.forEach(c => {
  console.log('Type:', c.type, '| Card:', c.cardNumber);
  const part = c.effect.split('[Your Turn]')[1];
  console.log('  [Your Turn]' + (part ? part.substring(0, 120) : ''));
});

// Find grant keyword effects
const grantKeyword = yourTurnCards.filter(c => {
  const yourTurnPart = c.effect.split('[Your Turn]')[1] || '';
  return !yourTurnPart.includes('[Once Per Turn]') &&
         !yourTurnPart.includes('[On Play]') &&
         (yourTurnPart.includes('[Double Attack]') || yourTurnPart.includes('gains ['));
});

console.log('\n=== Grant keyword effects ===');
console.log('Total:', grantKeyword.length);
grantKeyword.forEach(c => {
  console.log('Type:', c.type, '| Card:', c.cardNumber);
  const part = c.effect.split('[Your Turn]')[1];
  console.log('  [Your Turn]' + (part ? part.substring(0, 120) : ''));
});
