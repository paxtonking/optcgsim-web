#!/usr/bin/env tsx
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://onepiece.limitlesstcg.com';

interface DeckCard {
  cardId: string;
  count: number;
  name: string;
}

interface ScrapedDeck {
  name: string;
  leaderId: string;
  leaderName: string;
  cards: DeckCard[];
  sourceUrl: string;
}

// Top 10 deck archetypes with their first-place deck list IDs
// These are sourced from limitlesstcg.com/decks archetype pages
const TOP_DECKS = [
  { name: 'Black Imu', listId: '5989' },
  { name: 'Red/Blue Ace', listId: '5714' },
  { name: 'Green Zoro', listId: '5971' },
  { name: 'Red Rayleigh', listId: '5982' },
  { name: 'Green/Purple Lim', listId: '4988' },
  { name: 'Red/Purple Roger', listId: '5969' },
  { name: 'Green Bonney', listId: '5986' },
  { name: 'Red/Black Sabo', listId: '5967' },
  { name: 'Red/Yellow Betty', listId: '6009' },
  { name: 'Green/Blue Zoro & Sanji', listId: '5669' },
];

// Delay between requests to be respectful to the server
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  console.log(`  Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

// Parse a deck list page using data attributes
async function parseDeckList(url: string): Promise<{ leader: DeckCard | null; cards: DeckCard[]; deckName: string }> {
  const html = await fetchPage(url);

  const cards: DeckCard[] = [];
  let leader: DeckCard | null = null;

  // Extract deck name from title
  const titleMatch = html.match(/<title>([^–]+)/i);
  const deckName = titleMatch ? titleMatch[1].trim() : 'Unknown Deck';

  // Find all cards using data-count and data-id attributes
  // Pattern: data-count="4" data-id="OP13-086"
  const cardPattern = /data-count="(\d+)"\s+data-id="([A-Z0-9-]+)"/gi;

  let match;
  let isFirstCard = true;

  while ((match = cardPattern.exec(html)) !== null) {
    const count = parseInt(match[1], 10);
    const cardId = match[2].toUpperCase();

    // Skip if already added (dedup)
    if (cards.find(c => c.cardId === cardId)) continue;

    const card: DeckCard = {
      cardId,
      count,
      name: '' // Will be filled in later
    };

    // First card is usually the leader
    if (isFirstCard) {
      leader = card;
      isFirstCard = false;
    } else {
      cards.push(card);
    }
  }

  return { leader, cards, deckName };
}

// Load cards.json to get card names and validate existence
async function loadCardData(): Promise<Map<string, { name: string; type: string }>> {
  const cardsPath = path.join(__dirname, '../../../packages/client/public/data/cards.json');
  const cardsData = await fs.readFile(cardsPath, 'utf-8');
  const cards = JSON.parse(cardsData);

  const cardMap = new Map<string, { name: string; type: string }>();
  for (const card of cards) {
    cardMap.set(card.id, { name: card.name, type: card.type });
  }
  return cardMap;
}

async function main() {
  console.log('=== Limitless TCG Deck Scraper ===\n');

  // Load card data for validation
  console.log('Loading card database...');
  const cardData = await loadCardData();
  console.log(`Loaded ${cardData.size} cards\n`);

  const scrapedDecks: ScrapedDeck[] = [];

  for (let i = 0; i < TOP_DECKS.length; i++) {
    const deck = TOP_DECKS[i];
    const url = `${BASE_URL}/decks/list/${deck.listId}`;

    console.log(`\n[${i + 1}/${TOP_DECKS.length}] ${deck.name}`);

    try {
      await delay(300); // Be respectful

      const { leader, cards, deckName } = await parseDeckList(url);

      if (!leader) {
        console.log('  Warning: No leader found, skipping');
        continue;
      }

      // Validate and fill in card names
      const leaderData = cardData.get(leader.cardId);
      if (!leaderData) {
        console.log(`  Warning: Leader ${leader.cardId} not found in database`);
        leader.name = 'Unknown';
      } else {
        leader.name = leaderData.name;
        if (leaderData.type !== 'LEADER') {
          console.log(`  Warning: ${leader.cardId} is not a LEADER type`);
        }
      }

      let missingCards: string[] = [];
      for (const card of cards) {
        const data = cardData.get(card.cardId);
        if (data) {
          card.name = data.name;
        } else {
          missingCards.push(card.cardId);
          card.name = 'Unknown';
        }
      }

      if (missingCards.length > 0) {
        console.log(`  Warning: ${missingCards.length} cards not in database: ${missingCards.slice(0, 5).join(', ')}${missingCards.length > 5 ? '...' : ''}`);
      }

      // Calculate totals
      const totalCards = cards.reduce((sum, c) => sum + c.count, 0);
      console.log(`  Leader: ${leader.cardId} (${leader.name})`);
      console.log(`  Cards: ${cards.length} unique, ${totalCards} total`);

      scrapedDecks.push({
        name: deck.name,
        leaderId: leader.cardId,
        leaderName: leader.name,
        cards: cards,
        sourceUrl: url
      });

    } catch (error) {
      console.log(`  Error: ${error}`);
    }
  }

  // Save results to the canonical data location (same as cards.json)
  const outputPath = path.join(__dirname, '../../../packages/client/public/data/decks.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(scrapedDecks, null, 2));

  console.log(`\n=== Complete ===`);
  console.log(`Scraped ${scrapedDecks.length} decks`);
  console.log(`Saved to: ${outputPath}`);
  console.log(`\nRun 'npm run import:cards' from tools/card-importer to import decks into database`);
}

main().catch(console.error);
