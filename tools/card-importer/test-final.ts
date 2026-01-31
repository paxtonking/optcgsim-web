import { effectTextParser, extractAction, extractTriggers, extractCosts } from '@optcgsim/shared';

const tests = [
  {
    id: 'ST04-001',
    text: "[Activate: Main] [Once Per Turn] DON!! −7 (You may return the specified number of DON!! cards from your field to your DON!! deck.) : Trash up to 1 of your opponent's Life cards."
  },
  {
    id: 'ST26-005',
    text: "[On Play]/[When Attacking] DON!! −2 (You may return the specified number of DON!! cards from your field to your DON!! deck.) : If your Leader is multicolored and your opponent has 5 or more DON!! cards on their field, rest up to 2 of your opponent's DON!! cards."
  }
];

for (const test of tests) {
  console.log(`\n=== Testing ${test.id} ===`);
  console.log(`Effect: ${test.text}`);

  // Test triggers
  const triggers = extractTriggers(test.text);
  console.log(`Triggers found: ${triggers.map(t => t.type).join(', ') || 'NONE'}`);

  // Test costs
  const costs = extractCosts(test.text);
  console.log(`Costs found: ${JSON.stringify(costs)}`);

  // Test action on the action part
  const actionPart = "Trash up to 1 of your opponent's Life cards.";
  const action = extractAction(actionPart);
  console.log(`Action from "${actionPart}": ${action ? action.type : 'NONE'}`);

  // Full parse
  const result = effectTextParser.parse(test.text, test.id);
  console.log(`Parse result: ${result.length > 0 ? 'PARSED' : 'NOT PARSED'}`);
  if (result.length > 0) {
    console.log(`  Trigger: ${result[0].trigger}`);
    console.log(`  Effects: ${result[0].effects.map(e => e.type).join(', ')}`);
    console.log(`  Costs: ${JSON.stringify(result[0].costs)}`);
  }
}

// Test the regex directly
console.log('\n=== Regex Test ===');
const trashLifePattern = /[Tt]rash\s+(?:up to\s+)?(\d+)?\s*cards?\s+from.*[Ll]ife/i;
const testText = "Trash up to 1 of your opponent's Life cards.";
console.log(`Pattern test on "${testText}": ${trashLifePattern.test(testText)}`);
