import { effectTextParser } from '@optcgsim/shared';

const text = "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [Saint Shalria] and add it to your hand. Then, trash the rest and trash 1 card from your hand.";

console.log("Testing Saint Shalria effect:");
console.log("Text:", text);
console.log("");

const result = effectTextParser.parse(text, "OP13-086");
console.log("Trigger:", result[0]?.trigger);
console.log("Effects:", result[0]?.effects.map(e => e.type));
console.log("Full result:");
console.log(JSON.stringify(result, null, 2));
