import { effectTextParser, extractAction } from '@optcgsim/shared';

// Test the individual action extraction
const text1 = "Trash 1 card from the top of your deck.";
console.log("Testing action extraction for:", text1);
const action = extractAction(text1);
console.log("Action found:", action ? action.type : "NONE");
console.log("");

// Test full parsing of Saint Charlos
const fullText = "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.) [On Play] Trash 1 card from the top of your deck.";
console.log("Full text:", fullText);
console.log("");

const result = effectTextParser.parse(fullText, "OP13-087");
console.log("Number of parsed effects:", result.length);
for (let i = 0; i < result.length; i++) {
  console.log("Effect " + i + ":");
  console.log("  Trigger:", result[i].trigger);
  console.log("  Effects:", result[i].effects.map(e => e.type + (e.value ? "(" + e.value + ")" : "")));
}
