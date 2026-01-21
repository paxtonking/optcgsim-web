#!/usr/bin/env node
/**
 * Fetches card data from OPTCG API and saves to JSON
 * API: https://optcgapi.com/
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'https://www.optcgapi.com/api';

interface APICard {
  card_name: string;
  card_set_id: string;
  set_name: string;
  rarity: string;
  card_color: string;
  card_type: string;
  card_cost: string;
  card_power: string;
  card_counter: string;
  card_attribute: string;
  card_effect: string;
  card_trigger: string;
  inventory_price: number;
  market_price: number;
  card_image: string;
}

interface TransformedCard {
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
  imageUrl: string;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value || value === 'NULL' || value === 'null' || value === '-') {
    return null;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

function parseColors(colorStr: string): string[] {
  if (!colorStr || colorStr === 'NULL') return [];
  // Colors can be like "Red", "Red/Green", "Blue/Purple"
  return colorStr.split('/').map(c => c.trim().toUpperCase());
}

function transformCard(apiCard: APICard): TransformedCard {
  const id = apiCard.card_set_id;
  const parts = id.split('-');
  const setCode = parts[0] || '';
  const cardNumber = parts[1] || '';

  return {
    id,
    name: apiCard.card_name.replace(/\s*\(\d+\)$/, ''), // Remove trailing (001) etc
    setCode,
    setName: apiCard.set_name,
    cardNumber,
    rarity: apiCard.rarity,
    colors: parseColors(apiCard.card_color),
    type: apiCard.card_type?.toUpperCase() || 'CHARACTER',
    cost: parseNumber(apiCard.card_cost),
    power: parseNumber(apiCard.card_power),
    counter: parseNumber(apiCard.card_counter),
    attribute: apiCard.card_attribute && apiCard.card_attribute !== 'NULL' ? apiCard.card_attribute : null,
    effect: apiCard.card_effect && apiCard.card_effect !== 'NULL' ? apiCard.card_effect : null,
    trigger: apiCard.card_trigger && apiCard.card_trigger !== 'NULL' ? apiCard.card_trigger : null,
    imageUrl: `/cards/${setCode}/${id}.png`, // Local path to our images
  };
}

async function safeFetch(url: string): Promise<APICard[]> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (text.startsWith('<')) {
      console.log(`  Warning: ${url} returned HTML, skipping`);
      return [];
    }
    return JSON.parse(text);
  } catch (error) {
    console.log(`  Warning: Failed to fetch ${url}:`, error);
    return [];
  }
}

async function fetchAllCards(): Promise<APICard[]> {
  console.log('Fetching all set cards...');
  const setCards = await safeFetch(`${API_BASE}/allSetCards/`);
  console.log(`  Found ${setCards.length} set cards`);

  console.log('Fetching all starter deck cards...');
  const starterCards = await safeFetch(`${API_BASE}/allSTCards/`);
  console.log(`  Found ${starterCards.length} starter deck cards`);

  console.log('Fetching all promo cards...');
  const promoCards = await safeFetch(`${API_BASE}/allPromoCards/`);
  console.log(`  Found ${promoCards.length} promo cards`);

  return [...setCards, ...starterCards, ...promoCards];
}

async function main() {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const allCards = await fetchAllCards();
    console.log(`\nTotal cards fetched: ${allCards.length}`);

    // Transform cards
    const transformedCards = allCards.map(transformCard);

    // Remove duplicates by ID
    const cardMap = new Map<string, TransformedCard>();
    for (const card of transformedCards) {
      if (!cardMap.has(card.id)) {
        cardMap.set(card.id, card);
      }
    }
    const uniqueCards = Array.from(cardMap.values());
    console.log(`Unique cards: ${uniqueCards.length}`);

    // Sort by ID
    uniqueCards.sort((a, b) => a.id.localeCompare(b.id));

    // Save full card data
    const outputPath = path.join(outputDir, 'cards.json');
    fs.writeFileSync(outputPath, JSON.stringify(uniqueCards, null, 2));
    console.log(`\nSaved to ${outputPath}`);

    // Also create a summary by set
    const setMap = new Map<string, number>();
    for (const card of uniqueCards) {
      const count = setMap.get(card.setCode) || 0;
      setMap.set(card.setCode, count + 1);
    }
    console.log('\nCards per set:');
    for (const [set, count] of Array.from(setMap.entries()).sort()) {
      console.log(`  ${set}: ${count}`);
    }

    // Copy to client public folder as well
    const clientCardsPath = path.resolve(process.cwd(), '../../packages/client/public/data');
    if (!fs.existsSync(clientCardsPath)) {
      fs.mkdirSync(clientCardsPath, { recursive: true });
    }
    fs.writeFileSync(path.join(clientCardsPath, 'cards.json'), JSON.stringify(uniqueCards, null, 2));
    console.log(`\nAlso saved to ${path.join(clientCardsPath, 'cards.json')}`);

  } catch (error) {
    console.error('Error fetching cards:', error);
    process.exit(1);
  }
}

main();
