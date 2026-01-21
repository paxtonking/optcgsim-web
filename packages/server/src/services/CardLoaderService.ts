/**
 * CardLoaderService - Loads cards from database and converts to CardDefinition format
 * for use with the EffectEngine
 */

import { prisma } from './prisma.js';
import type { CardDefinition, CardEffectDefinition } from '@optcgsim/shared';
import {
  EffectTrigger,
  EffectType,
  TargetType,
  EffectDuration,
} from '@optcgsim/shared';

// Manual effect definitions for key cards
// This allows us to define effects without parsing text
const CARD_EFFECTS: Record<string, Partial<CardDefinition>> = {
  // ============================================
  // STARTER DECK 01 - STRAW HAT CREW (RED)
  // ============================================
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
  'ST01-004': {
    name: 'Usopp',
    keywords: [],
    effects: [{
      id: 'ST01-004-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER_OR_CHARACTER, count: 1 },
        value: 2000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'On Play: Give your Leader or 1 of your Characters +2000 power during this turn.',
    }],
  },
  'ST01-005': {
    name: 'Karoo',
    keywords: [],
    effects: [{
      id: 'ST01-005-e1',
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
  'ST01-006': {
    name: 'Sanji',
    keywords: [],
    effects: [{
      id: 'ST01-006-e1',
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
  'ST01-007': {
    name: 'Jinbe',
    keywords: [],
    effects: [{
      id: 'ST01-007-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_LEADER, count: 1 },
        value: 3000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'On Play: Give your Leader +3000 power during this turn.',
    }],
  },
  'ST01-008': {
    name: 'Tony Tony Chopper',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST01-009': {
    name: 'Nami',
    keywords: [],
    effects: [{
      id: 'ST01-009-e1',
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
  'ST01-010': {
    name: 'Nico Robin',
    keywords: [],
    effects: [{
      id: 'ST01-010-e1',
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
  'ST01-011': {
    name: 'Franky',
    keywords: [],
    effects: [{
      id: 'ST01-011-e1',
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
  'ST01-012': {
    name: 'Sanji',
    keywords: ['Rush'],
    effects: [],
  },
  'ST01-013': {
    name: 'Roronoa Zoro',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST01-014': {
    name: 'Gum-Gum Jet Pistol',
    keywords: [],
    effects: [{
      id: 'ST01-014-e1',
      trigger: EffectTrigger.MAIN,
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        value: 4,
        duration: EffectDuration.INSTANT,
      }],
      description: 'Main: K.O. up to 1 of your opponent\'s Characters with a cost of 4 or less.',
    }],
  },
  'ST01-015': {
    name: 'Gum-Gum Pistol',
    keywords: [],
    effects: [{
      id: 'ST01-015-e1',
      trigger: EffectTrigger.TRIGGER,
      effects: [{
        type: EffectType.KO_COST_OR_LESS,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        value: 3,
        duration: EffectDuration.INSTANT,
      }],
      description: 'Trigger: K.O. up to 1 of your opponent\'s Characters with a cost of 3 or less.',
    }],
  },
  'ST01-016': {
    name: 'Thousand Sunny',
    keywords: [],
    effects: [{
      id: 'ST01-016-e1',
      trigger: EffectTrigger.ACTIVATE_MAIN,
      oncePerTurn: true,
      effects: [{
        type: EffectType.BUFF_ANY,
        target: { type: TargetType.YOUR_CHARACTER, count: 1 },
        value: 1000,
        duration: EffectDuration.UNTIL_END_OF_TURN,
      }],
      description: 'Activate: Main Once Per Turn: Give 1 of your Characters +1000 power during this turn.',
    }],
  },

  // ============================================
  // STARTER DECK 02 - WORST GENERATION (GREEN)
  // ============================================
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
  'ST02-002': {
    name: 'Killer',
    keywords: [],
    effects: [{
      id: 'ST02-002-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.REST_CHARACTER,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Rest up to 1 of your opponent\'s Characters with a cost of 3 or less.',
    }],
  },
  'ST02-003': {
    name: 'Scratchmen Apoo',
    keywords: [],
    effects: [{
      id: 'ST02-003-e1',
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
  'ST02-004': {
    name: 'Jewelry Bonney',
    keywords: [],
    effects: [{
      id: 'ST02-004-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.ACTIVE_DON,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Set up to 1 of your rested DON!! cards as active.',
    }],
  },
  'ST02-005': {
    name: 'Trafalgar Law',
    keywords: [],
    effects: [{
      id: 'ST02-005-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.REST_CHARACTER,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Rest up to 1 of your opponent\'s Characters with a cost of 4 or less.',
    }],
  },
  'ST02-006': {
    name: 'Basil Hawkins',
    keywords: [],
    effects: [{
      id: 'ST02-006-e1',
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
  'ST02-007': {
    name: 'Heat',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST02-008': {
    name: 'Bepo',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST02-009': {
    name: 'Capone Bege',
    keywords: [],
    effects: [{
      id: 'ST02-009-e1',
      trigger: EffectTrigger.ON_KO,
      effects: [{
        type: EffectType.REST_CHARACTER,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On K.O.: Rest up to 1 of your opponent\'s Characters with a cost of 2 or less.',
    }],
  },
  'ST02-010': {
    name: 'Urouge',
    keywords: ['Rush'],
    effects: [],
  },
  'ST02-011': {
    name: 'X Drake',
    keywords: [],
    effects: [{
      id: 'ST02-011-e1',
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
  'ST02-013': {
    name: 'Eustass Kid',
    keywords: [],
    effects: [{
      id: 'ST02-013-e1',
      trigger: EffectTrigger.ON_ATTACK,
      effects: [{
        type: EffectType.REST_CHARACTER,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Attack: Rest up to 1 of your opponent\'s Characters with a cost of 5 or less.',
    }],
  },

  // ============================================
  // STARTER DECK 03 - THE SEVEN WARLORDS (BLUE)
  // ============================================
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
  'ST03-002': {
    name: 'Gecko Moria',
    keywords: [],
    effects: [{
      id: 'ST03-002-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.RETURN_TO_HAND,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Return up to 1 of your opponent\'s Characters with a cost of 3 or less to their hand.',
    }],
  },
  'ST03-003': {
    name: 'Dracule Mihawk',
    keywords: [],
    effects: [{
      id: 'ST03-003-e1',
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
  'ST03-005': {
    name: 'Donquixote Doflamingo',
    keywords: [],
    effects: [{
      id: 'ST03-005-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.RETURN_TO_HAND,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Return up to 1 of your opponent\'s Characters with a cost of 5 or less to their hand.',
    }],
  },
  'ST03-006': {
    name: 'Bartholomew Kuma',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST03-007': {
    name: 'Boa Hancock',
    keywords: [],
    effects: [{
      id: 'ST03-007-e1',
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
  'ST03-008': {
    name: 'Marshall D. Teach',
    keywords: [],
    effects: [{
      id: 'ST03-008-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.OPPONENT_TRASH_FROM_HAND,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Your opponent trashes 1 card from their hand.',
    }],
  },
  'ST03-009': {
    name: 'Buggy',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST03-010': {
    name: 'Crocodile',
    keywords: [],
    effects: [{
      id: 'ST03-010-e1',
      trigger: EffectTrigger.ON_ATTACK,
      effects: [{
        type: EffectType.RETURN_TO_HAND,
        target: { type: TargetType.OPPONENT_CHARACTER, count: 1 },
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Attack: Return up to 1 of your opponent\'s Characters with a cost of 2 or less to their hand.',
    }],
  },
  'ST03-012': {
    name: 'Jinbe',
    keywords: ['Blocker'],
    effects: [{
      id: 'ST03-012-e1',
      trigger: EffectTrigger.ON_BLOCK,
      effects: [{
        type: EffectType.BUFF_SELF,
        value: 2000,
        duration: EffectDuration.UNTIL_END_OF_BATTLE,
      }],
      description: 'On Block: This Character gains +2000 power during this battle.',
    }],
  },

  // ============================================
  // STARTER DECK 04 - ANIMAL KINGDOM PIRATES (PURPLE)
  // ============================================
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
  'ST04-003': {
    name: 'Ulti',
    keywords: [],
    effects: [{
      id: 'ST04-003-e1',
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
  'ST04-004': {
    name: 'King',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST04-005': {
    name: 'Sasaki',
    keywords: [],
    effects: [{
      id: 'ST04-005-e1',
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
  'ST04-006': {
    name: 'Jack',
    keywords: ['Blocker'],
    effects: [],
  },
  'ST04-007': {
    name: "Who's Who",
    keywords: [],
    effects: [{
      id: 'ST04-007-e1',
      trigger: EffectTrigger.ON_PLAY,
      effects: [{
        type: EffectType.ADD_DON,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On Play: Add up to 1 DON!! card from your DON!! deck and rest it.',
    }],
  },
  'ST04-008': {
    name: 'Black Maria',
    keywords: [],
    effects: [{
      id: 'ST04-008-e1',
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
  'ST04-009': {
    name: 'Page One',
    keywords: [],
    effects: [{
      id: 'ST04-009-e1',
      trigger: EffectTrigger.ON_KO,
      effects: [{
        type: EffectType.ADD_DON,
        value: 1,
        duration: EffectDuration.INSTANT,
      }],
      description: 'On K.O.: Add up to 1 DON!! card from your DON!! deck and rest it.',
    }],
  },
  'ST04-012': {
    name: 'Kaido',
    keywords: [],
    effects: [{
      id: 'ST04-012-e1',
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
  'ST04-013': {
    name: 'Queen',
    keywords: [],
    effects: [{
      id: 'ST04-013-e1',
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

  // ============================================
  // STARTER DECK 05 - FILM EDITION (MULTI-COLOR)
  // ============================================
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

  // ============================================
  // ROMANCE DAWN (OP01) - KEY CARDS
  // ============================================
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
      description: 'On Play: Look at 5 cards from the top of your deck. Reveal up to 1 [Straw Hat Crew] card and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
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

  // ============================================
  // ROMANCE DAWN (OP01) - GREEN CARDS
  // ============================================
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

  // ============================================
  // ROMANCE DAWN (OP01) - BLUE CARDS
  // ============================================
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

  // ============================================
  // ROMANCE DAWN (OP01) - PURPLE CARDS
  // ============================================
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

  // ============================================
  // PARAMOUNT WAR (OP02) - KEY CARDS
  // ============================================
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

  // ============================================
  // ADDITIONAL POPULAR CHARACTERS
  // ============================================

  // Shanks cards
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

  // More powerful blockers
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

  // Additional Counter Events
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

  // Rush characters
  'OP02-114': {
    name: 'Monkey D. Luffy',
    keywords: ['Rush'],
    effects: [],
  },

  // Unblockable characters - These are rare but powerful
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

  // Double Attack characters
  'OP03-092': {
    name: 'Charlotte Katakuri',
    keywords: ['Double Attack'],
    effects: [],
  },
};

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
   */
  private convertToCardDefinition(dbCard: any): CardDefinition {
    // Check if we have manual effect definitions for this card
    const manualDef = CARD_EFFECTS[dbCard.id];

    // Detect keywords from effect text if available
    const detectedKeywords = this.detectKeywords(dbCard.effectText || '');

    // Merge manual definitions with detected ones
    const keywords = [
      ...detectedKeywords,
      ...(manualDef?.keywords || []),
    ];
    const uniqueKeywords = [...new Set(keywords)];

    const cardDef: CardDefinition = {
      id: dbCard.id,
      name: dbCard.name,
      type: dbCard.type as 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE',
      colors: dbCard.colors || [],
      cost: dbCard.cost,
      power: dbCard.power,
      counter: dbCard.counter,
      traits: dbCard.traits || [],
      keywords: uniqueKeywords,
      effects: manualDef?.effects || [],
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
   * Add or update a card's effect definition
   */
  updateCardEffects(cardId: string, effects: CardEffectDefinition[]): void {
    const card = this.cardDefinitions.get(cardId);
    if (card) {
      card.effects = effects;
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
