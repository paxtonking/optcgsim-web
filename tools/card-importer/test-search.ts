import { effectTextParser, extractSearchAndSelectDetails } from '@optcgsim/shared';

const text = "Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [Saint Shalria] and add it to your hand. Then, trash the rest and trash 1 card from your hand.";

console.log("Testing effect text parsing:");
console.log("Text:", text);
console.log("");

const result = effectTextParser.parse(text, "TEST-001");
console.log("Parse result:", JSON.stringify(result, null, 2));

console.log("\nSearch and Select details:");
const details = extractSearchAndSelectDetails(text);
console.log(JSON.stringify(details, null, 2));
