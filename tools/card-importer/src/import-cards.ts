import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

interface CardImageInfo {
  id: string;
  setCode: string;
  cardNumber: string;
  filename: string;
  sourcePath: string;
}

export async function importCards(streamingAssetsPath: string, outputDir: string) {
  console.log('Starting card image import...');
  console.log(`Source: ${streamingAssetsPath}`);
  console.log(`Output: ${outputDir}`);

  const cardsPath = path.join(streamingAssetsPath, 'Cards');

  // Check if path exists
  try {
    await fs.access(cardsPath);
  } catch {
    console.error(`Cards folder not found at: ${cardsPath}`);
    process.exit(1);
  }

  // Find all card images
  const imageFiles = await glob('**/*.{png,jpg,jpeg}', {
    cwd: cardsPath,
    nodir: true,
  });

  console.log(`Found ${imageFiles.length} card images`);

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Process each image
  const cards: CardImageInfo[] = [];
  const setFolders = new Set<string>();

  for (const file of imageFiles) {
    const parsed = parseCardFilename(file);
    if (parsed) {
      cards.push({
        ...parsed,
        sourcePath: path.join(cardsPath, file),
      });
      setFolders.add(parsed.setCode);
    } else {
      console.warn(`Could not parse filename: ${file}`);
    }
  }

  // Create set folders in output
  for (const set of setFolders) {
    await fs.mkdir(path.join(outputDir, set), { recursive: true });
  }

  // Copy and rename files
  console.log('Copying card images...');
  let copied = 0;

  for (const card of cards) {
    const destPath = path.join(outputDir, card.setCode, `${card.id}.png`);
    try {
      await fs.copyFile(card.sourcePath, destPath);
      copied++;

      if (copied % 100 === 0) {
        console.log(`Copied ${copied}/${cards.length} images...`);
      }
    } catch (error) {
      console.error(`Failed to copy ${card.sourcePath}: ${error}`);
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Total cards: ${cards.length}`);
  console.log(`Sets found: ${setFolders.size}`);
  console.log(`Sets: ${Array.from(setFolders).sort().join(', ')}`);

  // Write manifest file
  const manifest = {
    importedAt: new Date().toISOString(),
    totalCards: cards.length,
    sets: Array.from(setFolders).sort(),
    cards: cards.map(c => ({
      id: c.id,
      setCode: c.setCode,
      cardNumber: c.cardNumber,
    })),
  };

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('Manifest written to manifest.json');
}

function parseCardFilename(filename: string): Omit<CardImageInfo, 'sourcePath'> | null {
  // Remove directory and extension
  const basename = path.basename(filename, path.extname(filename));

  // Common patterns:
  // OP01-001 -> setCode: OP01, cardNumber: 001
  // ST01-001 -> setCode: ST01, cardNumber: 001
  // P-001 -> setCode: P, cardNumber: 001 (promo)
  // EB01-001 -> setCode: EB01, cardNumber: 001

  const match = basename.match(/^([A-Z]+\d*)-(\d+)$/i);
  if (match) {
    const setCode = match[1].toUpperCase();
    const cardNumber = match[2];
    return {
      id: `${setCode}-${cardNumber}`,
      setCode,
      cardNumber,
      filename: basename,
    };
  }

  // Try alternate pattern with underscore
  const altMatch = basename.match(/^([A-Z]+\d*)_(\d+)$/i);
  if (altMatch) {
    const setCode = altMatch[1].toUpperCase();
    const cardNumber = altMatch[2];
    return {
      id: `${setCode}-${cardNumber}`,
      setCode,
      cardNumber,
      filename: basename,
    };
  }

  return null;
}

// Run directly if called as script
if (process.argv[1]?.endsWith('import-cards.ts')) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: tsx import-cards.ts <streamingAssetsPath> [outputDir]');
    process.exit(1);
  }
  importCards(args[0], args[1] || './output').catch(console.error);
}
