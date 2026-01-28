#!/usr/bin/env tsx
import { effectTextParser, EffectType } from '@optcgsim/shared';

const text1 = '[On Play] Look at up to 5 cards from the top of your deck; reveal up to 1 red Character with a cost of 1 and add it to your hand. Then, place the rest at the bottom of your deck in any order.';
const text2 = '[DON!! x1] [When Attacking] [Once Per Turn] Reveal 1 card from the top of your deck and add up to 1 {FILM} type card to your hand. Then, place the rest at the bottom of your deck.';

console.log('=== OP02-005 - Curly.Dadan ===');
const parsed1 = effectTextParser.parse(text1, 'OP02-005');
console.log(JSON.stringify(parsed1, null, 2));

console.log('\n=== ST11-001 - Uta ===');
const parsed2 = effectTextParser.parse(text2, 'ST11-001');
console.log(JSON.stringify(parsed2, null, 2));
