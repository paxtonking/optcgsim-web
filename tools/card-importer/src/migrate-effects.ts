#!/usr/bin/env tsx
/**
 * migrate-effects.ts
 *
 * Migrates card effect definitions from cardDefinitions.ts and CardLoaderService.ts
 * into the Prisma database's effects JSON field.
 *
 * This establishes a single source of truth for card effects.
 *
 * Usage:
 *   npm run migrate-effects         # Run migration
 *   npm run migrate-effects -- --dry-run  # Preview without changes
 */

import { PrismaClient } from '@prisma/client';
import {
  EffectTrigger,
  EffectType,
  TargetType,
  EffectDuration,
  ConditionType,
  type CardEffectDefinition,
} from '@optcgsim/shared';

const prisma = new PrismaClient();

// ============================================
// CARD_EFFECTS from CardLoaderService.ts
// (Copied here for migration - these override shared definitions)
// ============================================
const CARD_EFFECTS: Record<string, { name: string; keywords: string[]; effects: CardEffectDefinition[] }> = {
  // STARTER DECK LEADERS
  'ST01-001': {
    name: 'Monkey D. Luffy',
    keywords: [],
    effects: [{
      id: 'ST01-001-e1',
      trigger: EffectTrigger.ACTIVATE_MAIN,
      oncePerTurn: true,
      costs: [{ type: 'REST_DON', count: 1 }],
      effects: [{
        type: EffectType.GRANT_KEYWORD,
        target: { type: TargetType.YOUR_CHARACTER, count: 1 },
        keyword: 'Rush',
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'Activate: Main Once Per Turn: Rest 1 DON!! to give 1 of your Characters Rush during this turn.',
    }],
  },
  'ST02-001': {
    name: 'Eustass Kid',
    keywords: [],
    effects: [{
      id: 'ST02-001-e1',
      trigger: EffectTrigger.ON_ATTACK,
      costs: [{ type: 'REST_DON', count: 2 }],
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        value: 2,
        duration: EffectDuration.INSTANT,
      }],
      isOptional: true,
      description: 'On Attack: Rest 2 DON!! to K.O. up to 1 of your opponent\'s Characters with a cost of 2 or less.',
    }],
  },
  'ST03-001': {
    name: 'Crocodile',
    keywords: [],
    effects: [{
      id: 'ST03-001-e1',
      trigger: EffectTrigger.ACTIVATE_MAIN,
      oncePerTurn: true,
      costs: [{ type: 'TRASH_FROM_HAND', count: 1 }],
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'Activate: Main Once Per Turn: Trash 1 card from your hand to draw 1 card.',
    }],
  },
  'ST04-001': {
    name: 'Kaido',
    keywords: [],
    effects: [{
      id: 'ST04-001-e1',
      trigger: EffectTrigger.ACTIVATE_MAIN,
      oncePerTurn: true,
      costs: [{ type: 'REST_DON', count: 1 }],
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_CHARACTER, count: 1 },
        value: 2000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'Activate: Main Once Per Turn: Rest 1 DON!! to give 1 of your Characters +2000 power during this turn.',
    }],
  },
  'ST05-001': {
    name: 'Monkey D. Luffy',
    keywords: [],
    effects: [{
      id: 'ST05-001-e1',
      trigger: EffectTrigger.ON_ATTACK,
      costs: [{ type: 'REST_DON', count: 4 }],
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 2000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      isOptional: true,
      description: 'On Attack: Rest 4 DON!! to give this Leader +2000 power during this turn.',
    }],
  },

  // ROMANCE DAWN (OP01) - KEY CARDS
  'OP01-003': {
    name: 'Usopp',
    keywords: [],
    effects: [{
      id: 'OP01-003-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.LOOK_AT_TOP_DECK,
        value: 5,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Look at 5 cards from the top of your deck.',
    }],
  },
  'OP01-004': {
    name: 'Karoo',
    keywords: [],
    effects: [{
      id: 'OP01-004-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 1,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 1000,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x1: This Character gains +1000 power.',
    }],
  },
  'OP01-005': {
    name: 'Koby',
    keywords: ['Blocker'],
    effects: [],
  },
  'OP01-006': {
    name: 'Roronoa Zoro',
    keywords: ['Blocker'],
    effects: [],
  },
  'OP01-008': {
    name: 'Sanji',
    keywords: [],
    effects: [{
      id: 'OP01-008-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Draw 1 card.',
    }],
  },
  'OP01-011': {
    name: 'Jinbe',
    keywords: [],
    effects: [{
      id: 'OP01-011-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: 4000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'On Play: Give your Leader or 1 of your Characters +4000 power during this turn.',
    }],
  },
  'OP01-013': {
    name: 'Nefertari Vivi',
    keywords: [],
    effects: [{
      id: 'OP01-013-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 2,
        duration: EffectDuration.INSTANT,
      }, {
        type: EffectType.DISCARD_FROM_HAND,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Draw 2 cards, then trash 1 card from your hand.',
    }],
  },
  'OP01-016': {
    name: 'Nami',
    keywords: [],
    effects: [{
      id: 'OP01-016-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Draw 1 card.',
    }],
  },
  'OP01-017': {
    name: 'Nico Robin',
    keywords: [],
    effects: [{
      id: 'OP01-017-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 2,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 2000,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x2: This Character gains +2000 power.',
    }],
  },
  'OP01-021': {
    name: 'Guard Point',
    keywords: [],
    effects: [{
      id: 'OP01-021-e1',
      trigger: EffectTrigger.COUNTER,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: 4000,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'Counter: Give your Leader or 1 of your Characters +4000 power during this battle.',
    }],
  },
  'OP01-024': {
    name: 'Monkey D. Luffy',
    keywords: ['Rush'],
    effects: [{
      id: 'OP01-024-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 1,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 1000,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x1: This Character gains +1000 power.',
    }],
  },
  'OP01-025': {
    name: 'Roronoa Zoro',
    keywords: [],
    effects: [{
      id: 'OP01-025-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 2,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 2000,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x2: This Character gains +2000 power.',
    }],
  },
  'OP01-047': {
    name: 'Trafalgar Law',
    keywords: ['Banish'],
    effects: [{
      id: 'OP01-047-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: {
          type: TargetType.OPPONENT_CHARACTER,
          count: 1,
          filters: [{ property: 'COST', operator: 'OR_LESS', value: 3 }]
        },
        value: 3,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: K.O. up to 1 of your opponent\'s Characters with a cost of 3 or less.',
    }],
  },
  'OP01-051': {
    name: 'Eustass Kid',
    keywords: [],
    effects: [{
      id: 'OP01-051-e1',
      trigger: EffectTrigger.ON_ATTACK,
      effects: [{
        type: EffectType.REST_CHARACTER,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Attack: Rest up to 1 of your opponent\'s Characters with a cost of 5 or less.',
    }],
  },
  'OP01-060': {
    name: 'Crocodile',
    keywords: [],
    effects: [{
      id: 'OP01-060-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.RETURN_TO_HAND,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 2 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Return up to 2 of your opponent\'s Characters with a cost of 2 or less to their hand.',
    }],
  },
  'OP01-067': {
    name: 'Dracule Mihawk',
    keywords: [],
    effects: [{
      id: 'OP01-067-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 2,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 2000,
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x2: This Character gains +2000 power.',
    }],
  },
  'OP01-091': {
    name: 'Kaido',
    keywords: ['Blocker'],
    effects: [{
      id: 'OP01-091-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        value: 3,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: K.O. up to 1 of your opponent\'s Characters with a cost of 3 or less.',
    }],
  },
  'OP01-093': {
    name: 'King',
    keywords: [],
    effects: [{
      id: 'OP01-093-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.ADD_DON,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Add up to 1 DON!! card from your DON!! deck and rest it.',
    }],
  },
  'OP01-120': {
    name: 'Shanks',
    keywords: [],
    effects: [{
      id: 'OP01-120-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: 5000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'On Play: Give your Leader or 1 of your Characters +5000 power during this turn.',
    }],
  },

  // PARAMOUNT WAR (OP02)
  'OP02-001': {
    name: 'Edward Newgate',
    keywords: [],
    effects: [{
      id: 'OP02-001-e1',
      trigger: EffectTrigger.ACTIVATE_MAIN,
      oncePerTurn: true,
      costs: [{ type: 'LIFE', count: 1 }],
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_CHARACTER, count: 1 },
        value: 2000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'Activate: Main Once Per Turn: Take 1 damage to give 1 of your Characters +2000 power during this turn.',
    }],
  },
  'OP02-004': {
    name: 'Edward Newgate',
    keywords: ['Double Attack'],
    effects: [],
  },
  'OP02-013': {
    name: 'Marco',
    keywords: ['Blocker'],
    effects: [],
  },
  'OP02-018': {
    name: 'Marco',
    keywords: ['Blocker'],
    effects: [{
      id: 'OP02-018-e1',
      trigger: EffectTrigger.ON_BLOCK,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 3000,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'On Block: This Character gains +3000 power during this battle.',
    }],
  },
  'OP02-026': {
    name: 'Portgas D. Ace',
    keywords: ['Rush'],
    effects: [],
  },
  'OP02-046': {
    name: 'Sengoku',
    keywords: [],
    effects: [{
      id: 'OP02-046-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.DRAW_CARDS,
        value: 2,
        duration: EffectDuration.INSTANT,
      }, {
        type: EffectType.DISCARD_FROM_HAND,
        value: 2,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Draw 2 cards, then trash 2 cards from your hand.',
    }],
  },
  'OP02-062': {
    name: 'Coby',
    keywords: ['Blocker'],
    effects: [],
  },
  'OP02-066': {
    name: 'Garp',
    keywords: ['Blocker'],
    effects: [{
      id: 'OP02-066-e1',
      trigger: EffectTrigger.ON_BLOCK,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 4000,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'On Block: This Character gains +4000 power during this battle.',
    }],
  },
  'OP02-114': {
    name: 'Monkey D. Luffy',
    keywords: ['Rush'],
    effects: [],
  },
  'OP02-118': {
    name: 'Radical Beam!!',
    keywords: [],
    effects: [{
      id: 'OP02-118-e1',
      trigger: EffectTrigger.COUNTER,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: 6000,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'Counter: Give your Leader or 1 of your Characters +6000 power during this battle.',
    }],
  },
  'OP03-040': {
    name: 'Yamato',
    keywords: [],
    effects: [{
      id: 'OP03-040-e1',
      trigger: EffectTrigger.DON_X,
      triggerValue: 5,
      effects: [{
        type: EffectType.GRANT_KEYWORD,
        keyword: 'Unblockable',
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'DON!! x5: This Character cannot be blocked.',
    }],
  },
  'OP03-092': {
    name: 'Charlotte Katakuri',
    keywords: ['Double Attack'],
    effects: [],
  },

  // ============================================
  // STAGE CARDS - Continuous effects
  // ============================================

  // Mary Geoise - [Your Turn] Celestial Dragons Characters cost 2+ reduced by 1
  'OP05-097': {
    name: 'Mary Geoise',
    keywords: [],
    effects: [{
      id: 'OP05-097-stage-1',
      trigger: EffectTrigger.YOUR_TURN,
      effects: [{
        type: EffectType.REDUCE_COST,
        value: 1,
        target: {
          type: TargetType.YOUR_HAND,
          filters: [
            { property: 'TRAIT', operator: 'CONTAINS', value: ['Celestial Dragons'] },
            { property: 'COST', operator: 'OR_MORE', value: 2 }
          ]
        },
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: '[Your Turn] You may play Character cards with the {Celestial Dragons} type and a cost of 2 or more with their cost reduced by 1.',
    }],
  },

  // Thousand Sunny (Pirate Foil) - Black Straw Hat Crew Characters +1 cost for opponent (always)
  'ST14-017': {
    name: 'Thousand Sunny',
    keywords: [],
    effects: [{
      id: 'ST14-017-stage-1',
      trigger: EffectTrigger.PASSIVE,
      effects: [{
        type: EffectType.INCREASE_COST,
        value: 1,
        target: {
          type: TargetType.OPPONENT_HAND,
          filters: [
            { property: 'TRAIT', operator: 'CONTAINS', value: ['Straw Hat Crew'] },
            { property: 'COLOR', operator: 'CONTAINS', value: ['BLACK'] }
          ]
        },
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'Your opponent\'s black {Straw Hat Crew} type Character cards cost +1 to play.',
    }],
  },

  // Moby Dick (RED) - [Your Turn] If ≤1 Life, Whitebeard Pirates +2000 power
  'OP02-024': {
    name: 'Moby Dick',
    keywords: [],
    effects: [{
      id: 'OP02-024-stage-1',
      trigger: EffectTrigger.YOUR_TURN,
      conditions: [{
        type: ConditionType.LIFE_COUNT_OR_LESS,
        value: 1,
      }],
      effects: [{
        type: EffectType.BUFF_ANY,
        value: 2000,
        target: {
          type: TargetType.YOUR_LEADER_OR_CHARACTER,
          filters: [
            { property: 'TRAIT', operator: 'CONTAINS', value: ['Whitebeard Pirates'] }
          ]
        },
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: '[Your Turn] If your Life is 1 or less, all of your {Whitebeard Pirates} type Characters get +2000 power.',
    }],
  },

  // Drum Kingdom - [Opponent's Turn] Drum Kingdom Characters +1000 power
  'OP08-020': {
    name: 'Drum Kingdom',
    keywords: [],
    effects: [{
      id: 'OP08-020-stage-1',
      trigger: EffectTrigger.OPPONENT_TURN,
      effects: [{
        type: EffectType.BUFF_ANY,
        value: 1000,
        target: {
          type: TargetType.YOUR_CHARACTER,
          filters: [
            { property: 'TRAIT', operator: 'CONTAINS', value: ['Drum Kingdom'] }
          ]
        },
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: '[Opponent\'s Turn] All of your {Drum Kingdom} type Characters get +1000 power.',
    }],
  },

  // Empty Throne - [Your Turn] If 19+ trash, Leader +1000 power
  // [Activate: Main] Rest this + 3 DON: Play black Five Elders from hand (cost <= DON count)
  'OP13-099': {
    name: 'Empty Throne',
    keywords: [],
    effects: [
      // Effect 1: Continuous power buff
      {
        id: 'OP13-099-stage-1',
        trigger: EffectTrigger.YOUR_TURN,
        conditions: [{
          type: ConditionType.TRASH_COUNT_OR_MORE,
          value: 19,
        }],
        effects: [{
          type: EffectType.BUFF_ANY,
          value: 1000,
          target: { type: TargetType.YOUR_LEADER },
          duration: EffectDuration.UNTIL_END_OF_TURN,
        }],
        description: '[Your Turn] If there are 19 or more cards in your trash, your Leader gets +1000 power.',
      },
      // Effect 2: Activate ability - play from hand
      {
        id: 'OP13-099-stage-2',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        costs: [
          { type: 'REST_SELF', count: 1 },
          { type: 'REST_DON', count: 3 },
        ],
        effects: [{
          type: EffectType.PLAY_FROM_HAND,
          target: {
            type: TargetType.YOUR_HAND,
            count: 1,
            optional: true, // "up to 1"
            filters: [
              { property: 'COLOR', operator: 'CONTAINS', value: ['BLACK'] },
              { property: 'TRAIT', operator: 'CONTAINS', value: ['Five Elders'] },
              { property: 'TYPE', operator: 'EQUALS', value: 'CHARACTER' },
              { property: 'COST', operator: 'LESS_THAN_OR_EQUAL', value: 'DON_COUNT' },
            ],
          },
        }],
        description: '[Activate: Main] Rest this card and 3 DON: Play up to 1 black {Five Elders} Character with cost ≤ DON count from hand.',
      },
    ],
  },

  // Corrida Coliseum - Dressrosa Characters can attack Characters when played
  'OP04-096': {
    name: 'Corrida Coliseum',
    keywords: [],
    effects: [{
      id: 'OP04-096-stage-1',
      trigger: EffectTrigger.PASSIVE,
      effects: [{
        type: EffectType.GRANT_RUSH_VS_CHARACTERS,
        target: {
          type: TargetType.YOUR_CHARACTER,
          filters: [
            { property: 'TRAIT', operator: 'CONTAINS', value: ['Dressrosa'] }
          ]
        },
        duration: EffectDuration.WHILE_ON_FIELD,
      }],
      description: 'All of your {Dressrosa} type Characters can attack opponent\'s Characters during the turn they are played.',
    }],
  },
};

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  notFound: string[];
  errors: string[];
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Card Effects Migration');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log('');

  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    notFound: [],
    errors: [],
  };

  // Step 1: Build effects map from CARD_EFFECTS
  console.log('Step 1: Building effects map from CARD_EFFECTS...');
  const mergedEffects: Record<string, { keywords: string[]; effects: CardEffectDefinition[] }> = {};

  for (const [id, def] of Object.entries(CARD_EFFECTS)) {
    mergedEffects[id] = {
      keywords: def.keywords,
      effects: def.effects,
    };
  }
  console.log(`  - Total cards with effects: ${Object.keys(mergedEffects).length}`);
  console.log('');

  // Step 2: Update database
  console.log('Step 2: Updating database...');
  stats.total = Object.keys(mergedEffects).length;

  for (const [cardId, def] of Object.entries(mergedEffects)) {
    try {
      // Check if card exists in database
      const existingCard = await prisma.card.findUnique({
        where: { id: cardId },
        select: { id: true, name: true },
      });

      if (!existingCard) {
        stats.notFound.push(cardId);
        continue;
      }

      if (!isDryRun) {
        // Update the effects field with the CardEffectDefinition[] array
        await prisma.card.update({
          where: { id: cardId },
          data: {
            effects: def.effects as any,  // Prisma accepts JSON
          },
        });
      }

      stats.updated++;

      if (stats.updated % 20 === 0) {
        console.log(`  - Processed ${stats.updated}/${stats.total} cards...`);
      }
    } catch (error) {
      stats.errors.push(`${cardId}: ${error}`);
    }
  }

  // Step 3: Print results
  console.log('');
  console.log('='.repeat(60));
  console.log('Migration Results');
  console.log('='.repeat(60));
  console.log(`Total cards with effects: ${stats.total}`);
  console.log(`Successfully updated: ${stats.updated}`);
  console.log(`Not found in database: ${stats.notFound.length}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.notFound.length > 0) {
    console.log('');
    console.log('Cards not found in database:');
    for (const id of stats.notFound) {
      console.log(`  - ${id}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const error of stats.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (isDryRun) {
    console.log('');
    console.log('This was a DRY RUN. No changes were made.');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('');
    console.log('Migration complete!');

    // Verify by counting cards with effects
    const withEffects = await prisma.card.count({
      where: {
        NOT: {
          effects: { equals: [] }
        }
      }
    });
    console.log(`Verification: ${withEffects} cards now have structured effects in database.`);
  }
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
