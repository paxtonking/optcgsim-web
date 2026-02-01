/**
 * CardLoaderService - Loads cards from database and converts to CardDefinition format
 * for use with the EffectEngine.
 *
 * Card effects are now stored directly in the database's effects JSON field.
 * This is the single source of truth for card effect definitions.
 *
 * Fallback: If a card has no effects in database but has effectText,
 * the effectTextParser will attempt to parse effects from text.
 */

import { prisma } from './prisma.js';
import type { CardDefinition, CardEffectDefinition } from '@optcgsim/shared';
import { effectTextParser, validateCardEffects } from '@optcgsim/shared';

// Keyword detection from effect text patterns
const KEYWORD_PATTERNS: { pattern: RegExp; keyword: string }[] = [
  { pattern: /\[rush\]/i, keyword: 'Rush' },
  { pattern: /\[blocker\]/i, keyword: 'Blocker' },
  { pattern: /\[banish\]/i, keyword: 'Banish' },
  { pattern: /\[double attack\]/i, keyword: 'Double Attack' },
];

export class CardLoaderService {
  private cardDefinitions: Map<string, CardDefinition> = new Map();
  private loaded = false;

  /**
   * Load all cards from database and convert to CardDefinition format
   */
  async loadAllCards(): Promise<CardDefinition[]> {
    if (this.loaded) {
      return Array.from(this.cardDefinitions.values());
    }

    console.log('[CardLoader] Loading cards from database...');

    const dbCards = await prisma.card.findMany();
    console.log(`[CardLoader] Found ${dbCards.length} cards in database`);

    for (const dbCard of dbCards) {
      const cardDef = this.convertToCardDefinition(dbCard);
      this.cardDefinitions.set(dbCard.id, cardDef);
    }

    this.loaded = true;
    console.log(`[CardLoader] Loaded ${this.cardDefinitions.size} card definitions`);

    // Log stats
    const withEffects = Array.from(this.cardDefinitions.values()).filter(c => c.effects.length > 0).length;
    const withKeywords = Array.from(this.cardDefinitions.values()).filter(c => c.keywords.length > 0).length;
    console.log(`[CardLoader] Cards with effects: ${withEffects}, with keywords: ${withKeywords}`);

    // Validate effect implementations
    this.validateEffectImplementations();

    return Array.from(this.cardDefinitions.values());
  }

  /**
   * Get a single card definition
   */
  getCard(cardId: string): CardDefinition | undefined {
    return this.cardDefinitions.get(cardId);
  }

  /**
   * Get all loaded card definitions
   */
  getAllCards(): CardDefinition[] {
    return Array.from(this.cardDefinitions.values());
  }

  /**
   * Convert a database card to CardDefinition format
   *
   * Effects priority:
   * 1. Database effects field (if it's an array with effects)
   * 2. Parse from effectText using effectTextParser (fallback)
   */
  private convertToCardDefinition(dbCard: any): CardDefinition {
    // Detect keywords from effect text
    const detectedKeywords = this.detectKeywords(dbCard.effectText || '');

    // Get effects from database or parse from text
    let effects: CardEffectDefinition[] = [];

    // Priority 1: Use effects from database if available
    if (Array.isArray(dbCard.effects) && dbCard.effects.length > 0) {
      effects = dbCard.effects as CardEffectDefinition[];
      // Debug: log for Imu
      if (dbCard.id === 'OP13-079') {
        console.log(`[CardLoader] OP13-079: Using ${effects.length} effects from database`);
        console.log(`[CardLoader] OP13-079 effects:`, JSON.stringify(effects.map(e => ({ id: e.id, trigger: e.trigger })), null, 2));
      }
    }
    // Priority 2: Parse from effect text (fallback)
    else if (dbCard.effectText) {
      try {
        effects = effectTextParser.parse(dbCard.effectText, dbCard.id);
        // Debug: log for Imu
        if (dbCard.id === 'OP13-079') {
          console.log(`[CardLoader] OP13-079: Parsed ${effects.length} effects from effectText`);
          console.log(`[CardLoader] OP13-079 effectText:`, dbCard.effectText);
          console.log(`[CardLoader] OP13-079 parsed effects:`, JSON.stringify(effects.map(e => ({ id: e.id, trigger: e.trigger })), null, 2));
        }
      } catch (e) {
        // Log error but continue - card will work without effects
        console.warn(`[CardLoader] Failed to parse effects for ${dbCard.id}:`, e);
        effects = [];
      }
    } else if (dbCard.id === 'OP13-079') {
      console.log(`[CardLoader] OP13-079: No effects in DB and no effectText`);
    }

    const cardDef: CardDefinition = {
      id: dbCard.id,
      name: dbCard.name,
      type: dbCard.type as 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE',
      colors: dbCard.colors || [],
      cost: dbCard.cost,
      power: dbCard.power,
      counter: dbCard.counter,
      traits: dbCard.traits || [],
      life: dbCard.life ?? (dbCard.type === 'LEADER' ? 5 : undefined),
      effectText: dbCard.effectText || undefined,  // Raw effect text for leader restrictions, etc.
      keywords: [...new Set(detectedKeywords)],
      effects,
    };

    return cardDef;
  }

  /**
   * Detect keywords from effect text
   */
  private detectKeywords(effectText: string): string[] {
    const keywords: string[] = [];

    for (const { pattern, keyword } of KEYWORD_PATTERNS) {
      if (pattern.test(effectText)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  /**
   * Add or update a card's effect definition (in memory only)
   * To persist, use the admin API to update the database
   */
  updateCardEffects(cardId: string, effects: CardEffectDefinition[]): void {
    const card = this.cardDefinitions.get(cardId);
    if (card) {
      card.effects = effects;
    }
  }

  /**
   * Validate that all card effects are implemented
   * Logs warnings for any unimplemented effects
   */
  private validateEffectImplementations(): void {
    const cards = Array.from(this.cardDefinitions.values())
      .filter(c => c.effects.length > 0)
      .map(c => ({ id: c.id, effects: c.effects }));

    const report = validateCardEffects(cards);

    if (!report.valid) {
      console.warn('[CardLoader] ⚠️  EFFECT VALIDATION WARNINGS:');
      console.warn(`[CardLoader]   - Total effects: ${report.stats.totalEffects}`);
      console.warn(`[CardLoader]   - Implemented: ${report.stats.implementedEffects}`);
      console.warn(`[CardLoader]   - Stub (need impl): ${report.stats.stubEffects}`);
      console.warn(`[CardLoader]   - Unknown: ${report.stats.unknownEffects}`);

      // Group issues by type
      const byType = new Map<string, string[]>();
      for (const issue of report.issues) {
        const key = issue.type;
        if (!byType.has(key)) {
          byType.set(key, []);
        }
        byType.get(key)!.push(`${issue.cardId}: ${issue.detail}`);
      }

      // Log first few issues of each type
      for (const [type, issues] of byType) {
        console.warn(`[CardLoader]   ${type}: ${issues.length} issues`);
        for (const issue of issues.slice(0, 3)) {
          console.warn(`[CardLoader]     - ${issue}`);
        }
        if (issues.length > 3) {
          console.warn(`[CardLoader]     ... and ${issues.length - 3} more`);
        }
      }
    } else {
      console.log('[CardLoader] ✅ All card effects are implemented');
    }
  }

  /**
   * Reload cards from database
   */
  async reload(): Promise<void> {
    this.cardDefinitions.clear();
    this.loaded = false;
    await this.loadAllCards();
  }
}

// Export singleton instance
export const cardLoaderService = new CardLoaderService();
