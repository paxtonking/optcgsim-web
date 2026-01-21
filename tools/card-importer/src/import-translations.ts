import fs from 'fs/promises';
import path from 'path';

interface CardTranslation {
  id: string;
  name: string;
  effectText: string;
  traits: string[];
  type?: string;
  cost?: number;
  power?: number;
  counter?: number;
  colors?: string[];
}

export async function importTranslations(translationFilePath: string): Promise<Map<string, CardTranslation>> {
  console.log('Starting translation import...');
  console.log(`Source: ${translationFilePath}`);

  // Check if file exists
  try {
    await fs.access(translationFilePath);
  } catch {
    console.error(`Translation file not found at: ${translationFilePath}`);
    process.exit(1);
  }

  const content = await fs.readFile(translationFilePath, 'utf-8');
  const lines = content.split('\n');

  const cards = new Map<string, CardTranslation>();
  let currentCard: Partial<CardTranslation> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // Check for card ID pattern (e.g., [OP01-001] or OP01-001:)
    const cardIdMatch = line.match(/^\[?([A-Z]+\d*-\d+)\]?:?\s*(.*)$/i);
    if (cardIdMatch) {
      // Save previous card if exists
      if (currentCard?.id) {
        cards.set(currentCard.id, currentCard as CardTranslation);
      }

      // Start new card
      currentCard = {
        id: cardIdMatch[1].toUpperCase(),
        name: cardIdMatch[2] || '',
        effectText: '',
        traits: [],
      };
      continue;
    }

    // If we have a current card, parse additional fields
    if (currentCard) {
      // Parse key:value pairs
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        switch (key.toLowerCase()) {
          case 'name':
            currentCard.name = value;
            break;
          case 'effect':
          case 'text':
          case 'ability':
            currentCard.effectText = value;
            break;
          case 'trait':
          case 'traits':
            currentCard.traits = value.split(/[,/]/).map(t => t.trim());
            break;
          case 'type':
            currentCard.type = value.toUpperCase();
            break;
          case 'cost':
            currentCard.cost = parseInt(value) || undefined;
            break;
          case 'power':
            currentCard.power = parseInt(value) || undefined;
            break;
          case 'counter':
            currentCard.counter = parseInt(value) || undefined;
            break;
          case 'color':
          case 'colors':
            currentCard.colors = value.split(/[,/]/).map(c => c.trim().toUpperCase());
            break;
        }
      } else if (!currentCard.name && line.length > 0) {
        // If no name yet, this line might be the name
        currentCard.name = line;
      } else if (line.length > 0) {
        // Append to effect text
        if (currentCard.effectText) {
          currentCard.effectText += ' ' + line;
        } else {
          currentCard.effectText = line;
        }
      }
    }
  }

  // Don't forget the last card
  if (currentCard?.id) {
    cards.set(currentCard.id, currentCard as CardTranslation);
  }

  console.log(`\nTranslation import complete!`);
  console.log(`Total cards parsed: ${cards.size}`);

  // Write output
  const outputPath = path.join(path.dirname(translationFilePath), 'translations.json');
  const output = Object.fromEntries(cards);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Translations written to: ${outputPath}`);

  return cards;
}

// Helper to parse effect text into structured effects
export function parseEffectText(text: string): { trigger: string; description: string }[] {
  const effects: { trigger: string; description: string }[] = [];

  // Common triggers to look for
  const triggers = [
    { pattern: /\[On Play\]/gi, trigger: 'ON_PLAY' },
    { pattern: /\[When Attacking\]/gi, trigger: 'ON_ATTACK' },
    { pattern: /\[Blocker\]/gi, trigger: 'BLOCKER' },
    { pattern: /\[Rush\]/gi, trigger: 'RUSH' },
    { pattern: /\[Banish\]/gi, trigger: 'BANISH' },
    { pattern: /\[Double Attack\]/gi, trigger: 'DOUBLE_ATTACK' },
    { pattern: /\[Counter\]/gi, trigger: 'COUNTER' },
    { pattern: /\[Trigger\]/gi, trigger: 'TRIGGER' },
    { pattern: /\[Main\]/gi, trigger: 'MAIN' },
    { pattern: /\[Activate: Main\]/gi, trigger: 'ACTIVATE' },
    { pattern: /\[End of Your Turn\]/gi, trigger: 'END_OF_TURN' },
    { pattern: /\[Start of Your Turn\]/gi, trigger: 'START_OF_TURN' },
    { pattern: /\[On K\.O\.\]/gi, trigger: 'ON_KO' },
  ];

  // Split by common effect delimiters
  const parts = text.split(/(?=\[)/);

  for (const part of parts) {
    if (!part.trim()) continue;

    let matched = false;
    for (const { pattern, trigger } of triggers) {
      if (pattern.test(part)) {
        effects.push({
          trigger,
          description: part.replace(pattern, '').trim(),
        });
        matched = true;
        break;
      }
    }

    // If no trigger matched, it might be a passive effect
    if (!matched && part.trim()) {
      effects.push({
        trigger: 'PASSIVE',
        description: part.trim(),
      });
    }
  }

  return effects;
}

// Run directly if called as script
if (process.argv[1]?.endsWith('import-translations.ts')) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: tsx import-translations.ts <translationFilePath>');
    process.exit(1);
  }
  importTranslations(args[0]).catch(console.error);
}
