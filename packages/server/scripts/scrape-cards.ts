/**
 * Card Scraper for Limitless TCG
 *
 * Scrapes card effect text from https://onepiece.limitlesstcg.com/cards
 * and updates the cards.json file with effect data.
 *
 * Usage: npx tsx scripts/scrape-cards.ts
 *
 * Options:
 *   --resume    Resume from last saved progress
 *   --test      Test with first 5 cards only
 *   --delay=N   Set delay between requests in ms (default: 1000)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'https://onepiece.limitlesstcg.com/cards',
  cardsJsonPath: path.join(__dirname, '../..', 'client/public/data/cards.json'),
  progressPath: path.join(__dirname, 'scrape-progress.json'),
  outputPath: path.join(__dirname, 'scraped-cards.json'),
  delayMs: 200, // 200ms between requests (faster scraping)
  batchSize: 50, // Save progress every N cards
  maxRetries: 3,
  retryDelayMs: 5000,
};

// Types
interface Card {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  colors: string[];
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string | null;
  effect: string | null;
  trigger: string | null;
  traits?: string[];
  imageUrl: string;
}

interface ScrapedData {
  effect: string | null;
  trigger: string | null;
  counter: number | null;
  traits: string[];
  keywords: string[];
}

interface Progress {
  lastProcessedIndex: number;
  processedIds: string[];
  scrapedData: Record<string, ScrapedData>;
  startTime: string;
  lastUpdateTime: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
const shouldResume = args.includes('--resume');
const isTest = args.includes('--test');
const delayArg = args.find(a => a.startsWith('--delay='));
if (delayArg) {
  CONFIG.delayMs = parseInt(delayArg.split('=')[1], 10);
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function loadProgress(): Progress | null {
  try {
    if (fs.existsSync(CONFIG.progressPath)) {
      const data = fs.readFileSync(CONFIG.progressPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    log(`Warning: Could not load progress file: ${error}`);
  }
  return null;
}

function saveProgress(progress: Progress): void {
  progress.lastUpdateTime = new Date().toISOString();
  fs.writeFileSync(CONFIG.progressPath, JSON.stringify(progress, null, 2));
}

function loadCards(): Card[] {
  const data = fs.readFileSync(CONFIG.cardsJsonPath, 'utf-8');
  return JSON.parse(data);
}

function saveScrapedData(data: Record<string, ScrapedData>): void {
  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(data, null, 2));
}

/**
 * Extract card data from the HTML page
 * Uses the card-text-section div structure from Limitless TCG
 */
function parseCardPage(html: string, cardId: string): ScrapedData {
  const result: ScrapedData = {
    effect: null,
    trigger: null,
    counter: null,
    traits: [],
    keywords: [],
  };

  // Clean HTML entities
  const cleanHtml = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Extract counter value from the stats section
  // Format: "5000 Power • Special • +1000 Counter"
  const counterMatch = cleanHtml.match(/\+(\d+)\s*Counter/i);
  if (counterMatch) {
    const counterValue = parseInt(counterMatch[1], 10);
    if (!isNaN(counterValue)) {
      result.counter = counterValue;
    }
  }

  // Extract all card-text-section divs
  // Structure:
  //   Section 0: Card name, ID, type info (skip)
  //   Section 1: Effect text (what we want)
  //   Section 2: Traits like "Straw Hat Crew", "Revolutionary Army" (extract)
  const sections = cleanHtml.match(/<div class="card-text-section">[\s\S]*?<\/div>/gi);

  if (sections && sections.length > 1) {
    // Section 1 contains the effect text
    let effectSection = sections[1]
      .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();

    // Check if section 1 is traits instead of effect (for vanilla cards)
    const isTraitSection =
      effectSection.length < 50 &&
      !effectSection.includes('[') &&
      !effectSection.toLowerCase().includes('when') &&
      !effectSection.toLowerCase().includes('once per turn') &&
      !effectSection.toLowerCase().includes('you may') &&
      !effectSection.toLowerCase().includes('this card') &&
      !effectSection.toLowerCase().includes('this character') &&
      !effectSection.toLowerCase().includes('this leader');

    if (isTraitSection) {
      // Section 1 is actually traits or empty (for vanilla cards with no effect)
      if (effectSection.length > 0) {
        // Split by / for multi-type traits like "Supernovas/Straw Hat Crew"
        result.traits = effectSection.split('/').map(t => t.trim()).filter(t => t.length > 0);
      } else if (sections.length > 2) {
        // Section 1 is empty, check section 2 for traits
        let traitsSection = sections[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (traitsSection.length > 0 && traitsSection.length < 100) {
          result.traits = traitsSection.split('/').map(t => t.trim()).filter(t => t.length > 0);
        }
      }
    } else if (effectSection.length > 10) {
      // Section 1 is effect text
      result.effect = effectSection;

      // Extract trigger separately if present
      const triggerMatch = effectSection.match(/\[Trigger\][^[]+/i);
      if (triggerMatch) {
        result.trigger = triggerMatch[0].trim();
      }

      // Section 2 contains traits (if present)
      if (sections.length > 2) {
        let traitsSection = sections[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (traitsSection.length > 0 && traitsSection.length < 100) {
          // Split by / for multi-type traits like "Supernovas/Straw Hat Crew"
          result.traits = traitsSection.split('/').map(t => t.trim()).filter(t => t.length > 0);
        }
      }
    }
  }

  // Detect keywords from the effect text
  const effectText = result.effect || '';
  const keywordPatterns: { pattern: RegExp; keyword: string }[] = [
    { pattern: /\[Rush\]/i, keyword: 'Rush' },
    { pattern: /\[Blocker\]/i, keyword: 'Blocker' },
    { pattern: /\[Banish\]/i, keyword: 'Banish' },
    { pattern: /\[Double Attack\]/i, keyword: 'Double Attack' },
  ];

  for (const { pattern, keyword } of keywordPatterns) {
    if (pattern.test(effectText)) {
      result.keywords.push(keyword);
    }
  }

  return result;
}

/**
 * Fetch a single card page with retry logic
 */
async function fetchCardPage(cardId: string, retries = CONFIG.maxRetries): Promise<string | null> {
  const url = `${CONFIG.baseUrl}/${cardId}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OPTCGSim-CardScraper/1.0 (Educational Project)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (response.status === 404) {
        log(`Card ${cardId} not found (404)`);
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      log(`Attempt ${attempt}/${retries} failed for ${cardId}: ${error}`);
      if (attempt < retries) {
        log(`Retrying in ${CONFIG.retryDelayMs}ms...`);
        await sleep(CONFIG.retryDelayMs);
      }
    }
  }

  return null;
}

/**
 * Main scraping function
 */
async function scrapeCards(): Promise<void> {
  log('='.repeat(60));
  log('Card Scraper for Limitless TCG');
  log('='.repeat(60));

  // Load existing cards
  log(`Loading cards from ${CONFIG.cardsJsonPath}`);
  const cards = loadCards();
  log(`Found ${cards.length} cards to process`);

  // Load or initialize progress
  let progress: Progress;
  if (shouldResume) {
    const savedProgress = loadProgress();
    if (savedProgress) {
      progress = savedProgress;
      log(`Resuming from index ${progress.lastProcessedIndex}`);
      log(`Already processed ${progress.processedIds.length} cards`);
    } else {
      log('No progress file found, starting fresh');
      progress = {
        lastProcessedIndex: -1,
        processedIds: [],
        scrapedData: {},
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
      };
    }
  } else {
    progress = {
      lastProcessedIndex: -1,
      processedIds: [],
      scrapedData: {},
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    };
  }

  // Limit cards for test mode
  const cardsToProcess = isTest ? cards.slice(0, 5) : cards;
  const startIndex = progress.lastProcessedIndex + 1;

  log(`Processing cards from index ${startIndex} to ${cardsToProcess.length - 1}`);
  log(`Delay between requests: ${CONFIG.delayMs}ms`);
  log('-'.repeat(60));

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = startIndex; i < cardsToProcess.length; i++) {
    const card = cardsToProcess[i];

    // Skip if already processed
    if (progress.processedIds.includes(card.id)) {
      skipCount++;
      continue;
    }

    log(`[${i + 1}/${cardsToProcess.length}] Scraping ${card.id} - ${card.name}`);

    const html = await fetchCardPage(card.id);

    if (html) {
      const scrapedData = parseCardPage(html, card.id);
      progress.scrapedData[card.id] = scrapedData;
      progress.processedIds.push(card.id);
      successCount++;

      if (scrapedData.effect) {
        log(`  ✓ Effect: ${scrapedData.effect.substring(0, 60)}...`);
      } else {
        log(`  - No effect text found`);
      }

      if (scrapedData.counter !== null) {
        log(`  ✓ Counter: +${scrapedData.counter}`);
      }

      if (scrapedData.keywords.length > 0) {
        log(`  ✓ Keywords: ${scrapedData.keywords.join(', ')}`);
      }

      if (scrapedData.traits.length > 0) {
        log(`  ✓ Traits: ${scrapedData.traits.join(', ')}`);
      }
    } else {
      log(`  ✗ Failed to fetch card page`);
      failCount++;
    }

    progress.lastProcessedIndex = i;

    // Save progress periodically
    if ((i + 1) % CONFIG.batchSize === 0) {
      log(`Saving progress... (${i + 1} cards processed)`);
      saveProgress(progress);
      saveScrapedData(progress.scrapedData);
    }

    // Rate limiting
    if (i < cardsToProcess.length - 1) {
      await sleep(CONFIG.delayMs);
    }
  }

  // Final save
  log('-'.repeat(60));
  log('Scraping complete!');
  log(`Success: ${successCount}, Failed: ${failCount}, Skipped: ${skipCount}`);

  saveProgress(progress);
  saveScrapedData(progress.scrapedData);

  log(`Progress saved to: ${CONFIG.progressPath}`);
  log(`Scraped data saved to: ${CONFIG.outputPath}`);

  // Generate stats
  const withEffects = Object.values(progress.scrapedData).filter(d => d.effect).length;
  const withTriggers = Object.values(progress.scrapedData).filter(d => d.trigger).length;
  const withCounters = Object.values(progress.scrapedData).filter(d => d.counter !== null).length;
  const withKeywords = Object.values(progress.scrapedData).filter(d => d.keywords.length > 0).length;

  log('-'.repeat(60));
  log('Statistics:');
  log(`  Cards with effects: ${withEffects}`);
  log(`  Cards with triggers: ${withTriggers}`);
  log(`  Cards with counters: ${withCounters}`);
  log(`  Cards with keywords: ${withKeywords}`);
}

/**
 * Update cards.json with scraped data
 */
async function updateCardsJson(): Promise<void> {
  log('='.repeat(60));
  log('Updating cards.json with scraped data');
  log('='.repeat(60));

  // Load scraped data
  if (!fs.existsSync(CONFIG.outputPath)) {
    log('Error: Scraped data file not found. Run scrape first.');
    process.exit(1);
  }

  const scrapedData: Record<string, ScrapedData> = JSON.parse(
    fs.readFileSync(CONFIG.outputPath, 'utf-8')
  );

  log(`Loaded ${Object.keys(scrapedData).length} scraped cards`);

  // Load cards.json
  const cards = loadCards();
  log(`Loaded ${cards.length} cards from cards.json`);

  // Update cards with scraped data
  let updatedCount = 0;
  let counterCount = 0;
  let traitsCount = 0;
  for (const card of cards) {
    const data = scrapedData[card.id];
    if (data) {
      if (data.effect) {
        card.effect = data.effect;
        updatedCount++;
      }
      if (data.trigger) {
        card.trigger = data.trigger;
      }
      if (data.counter !== null && data.counter !== undefined) {
        card.counter = data.counter;
        counterCount++;
      }
      if (data.traits && data.traits.length > 0) {
        card.traits = data.traits;
        traitsCount++;
      }
    }
  }
  log(`Updated ${counterCount} cards with counter values`);
  log(`Updated ${traitsCount} cards with traits`);

  // Save updated cards.json
  const backupPath = CONFIG.cardsJsonPath.replace('.json', '.backup.json');
  fs.copyFileSync(CONFIG.cardsJsonPath, backupPath);
  log(`Backup saved to: ${backupPath}`);

  fs.writeFileSync(CONFIG.cardsJsonPath, JSON.stringify(cards, null, 2));
  log(`Updated ${updatedCount} cards in cards.json`);
}

// Main execution
const command = args.find(a => !a.startsWith('--'));

if (command === 'update') {
  updateCardsJson().catch(console.error);
} else {
  scrapeCards().catch(console.error);
}
