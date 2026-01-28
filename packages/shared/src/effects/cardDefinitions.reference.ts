// Card Effect Definitions
// These define card effects using the effect system.
//
// IMPORTANT: Each card ID must be unique across ALL arrays in this file!
// Arrays are combined in allExampleCards and loaded into EffectEngine.
//
// Organization:
// - exampleCards: Basic example characters
// - exampleLeaders: Example leader cards
// - starterDeck01Cards: Starter Deck 1 (Straw Hat Crew - RED)
// - starterDeck02Cards: Starter Deck 2 (Worst Generation - GREEN)
// - popularCards: Popular/meta cards and additional definitions
//
// When adding a new card, search for the ID first to avoid duplicates!

import {
  EffectTrigger,
  EffectType,
  TargetType,
  ConditionType,
  EffectDuration,
} from './types';
import { CardDefinition } from './EffectEngine';

// ============================================
// EXAMPLE CHARACTER CARDS
// ============================================

export const exampleCards: CardDefinition[] = [
  // Monkey D. Luffy - Basic Rush character
  {
    id: 'OP01-003',
    name: 'Monkey D. Luffy',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 4,
    power: 5000,
    counter: 1000,
    traits: ['Straw Hat Crew', 'Supernovas'],
    keywords: ['Rush'],
    effects: [],
  },

  // Roronoa Zoro - Blocker
  {
    id: 'OP01-006',
    name: 'Roronoa Zoro',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 3,
    power: 4000,
    counter: 1000,
    traits: ['Straw Hat Crew', 'Supernovas'],
    keywords: ['Blocker'],
    effects: [],
  },

  // Nami - On Play: Draw 1 card
  {
    id: 'OP01-016',
    name: 'Nami',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 1000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'OP01-016-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.DRAW_CARDS,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: Draw 1 card.',
      },
    ],
  },

  // Tony Tony Chopper - On Play: Give +2000 power to one character
  {
    id: 'OP01-015',
    name: 'Tony Tony Chopper',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 2000,
    counter: 2000,
    traits: ['Straw Hat Crew', 'Animal'],
    keywords: [],
    effects: [
      {
        id: 'OP01-015-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.BUFF_ANY,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        isOptional: true,
        description: 'On Play: Give up to 1 of your Characters +2000 power during this turn.',
      },
    ],
  },

  // Nico Robin - DON!! x2: +2000 power
  {
    id: 'OP01-017',
    name: 'Nico Robin',
    type: 'CHARACTER',
    colors: ['PURPLE'],
    cost: 3,
    power: 4000,
    counter: 1000,
    traits: ['Straw Hat Crew', 'Baroque Works'],
    keywords: [],
    effects: [
      {
        id: 'OP01-017-effect-1',
        trigger: EffectTrigger.DON_X,
        triggerValue: 2,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.WHILE_ON_FIELD,
          },
        ],
        description: 'DON!! x2: This Character gains +2000 power.',
      },
    ],
  },

  // Sanji - On Attack: Rest 1 DON!! to give +2000 power
  {
    id: 'OP01-013',
    name: 'Sanji',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 4,
    power: 5000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'OP01-013-effect-1',
        trigger: EffectTrigger.ON_ATTACK,
        costs: [
          {
            type: 'REST_DON',
            count: 1,
          },
        ],
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        isOptional: true,
        description: 'On Attack: Rest 1 DON!! to give this Character +2000 power during this turn.',
      },
    ],
  },

  // Marco - Blocker + On Block ability
  {
    id: 'OP02-018',
    name: 'Marco',
    type: 'CHARACTER',
    colors: ['BLUE'],
    cost: 4,
    power: 5000,
    counter: null,
    traits: ['Whitebeard Pirates'],
    keywords: ['Blocker'],
    effects: [
      {
        id: 'OP02-018-effect-1',
        trigger: EffectTrigger.ON_BLOCK,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 3000,
            duration: EffectDuration.UNTIL_END_OF_BATTLE,
          },
        ],
        description: 'On Block: This Character gains +3000 power during this battle.',
      },
    ],
  },

  // Eustass Kid - Rush + Double Attack
  {
    id: 'OP01-051',
    name: 'Eustass Kid',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 7,
    power: 7000,
    counter: null,
    traits: ['Kid Pirates', 'Supernovas'],
    keywords: ['Rush', 'Double Attack'],
    effects: [],
  },

  // Trafalgar Law - Banish + On Play KO
  {
    id: 'OP01-047',
    name: 'Trafalgar Law',
    type: 'CHARACTER',
    colors: ['BLUE'],
    cost: 5,
    power: 6000,
    counter: null,
    traits: ['Heart Pirates', 'Supernovas'],
    keywords: ['Banish'],
    effects: [
      {
        id: 'OP01-047-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.KO_COST_OR_LESS,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 3,
                },
              ],
            },
            value: 3,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: K.O. 1 of your opponent\'s Characters with 3 cost or less.',
      },
    ],
  },

  // Kaido - On KO: Return to hand
  {
    id: 'OP04-044',
    name: 'Kaido',
    type: 'CHARACTER',
    colors: ['PURPLE'],
    cost: 9,
    power: 10000,
    counter: null,
    traits: ['Animal Kingdom Pirates', 'Four Emperors'],
    keywords: [],
    effects: [
      {
        id: 'OP04-044-effect-1',
        trigger: EffectTrigger.ON_KO,
        effects: [
          {
            type: EffectType.RETURN_TO_HAND,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
            },
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On K.O.: Return 1 of your opponent\'s Characters to their hand.',
      },
    ],
  },

  // Counter card example
  {
    id: 'OP01-024',
    name: 'Gum-Gum Jet Pistol',
    type: 'EVENT',
    colors: ['RED'],
    cost: 1,
    power: null,
    counter: 2000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'OP01-024-effect-1',
        trigger: EffectTrigger.COUNTER,
        effects: [
          {
            type: EffectType.BUFF_ANY,
            target: {
              type: TargetType.YOUR_LEADER,
              count: 1,
            },
            value: 3000,
            duration: EffectDuration.UNTIL_END_OF_BATTLE,
          },
        ],
        description: 'Counter: Give your Leader +3000 power during this battle.',
      },
    ],
  },

  // Trigger card example
  {
    id: 'OP01-025',
    name: 'Gum-Gum Red Hawk',
    type: 'EVENT',
    colors: ['RED'],
    cost: 2,
    power: null,
    counter: null,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'OP01-025-effect-1',
        trigger: EffectTrigger.TRIGGER,
        effects: [
          {
            type: EffectType.KO_COST_OR_LESS,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 3,
                },
              ],
            },
            value: 3,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Trigger: K.O. up to 1 of your opponent\'s Characters with a cost of 3 or less.',
      },
    ],
  },
];

// ============================================
// EXAMPLE LEADER CARDS
// ============================================

export const exampleLeaders: CardDefinition[] = [
  // Monkey D. Luffy Leader - Activate Main: Give Rush
  {
    id: 'OP01-001',
    name: 'Monkey D. Luffy',
    type: 'LEADER',
    colors: ['RED'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Straw Hat Crew', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'OP01-001-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        costs: [
          {
            type: 'REST_DON',
            count: 1,
          },
        ],
        effects: [
          {
            type: EffectType.GRANT_KEYWORD,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            keyword: 'Rush',
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'Activate: Main Once Per Turn (Rest 1 DON!!): Give 1 of your Characters \"Rush\" during this turn.',
      },
    ],
  },

  // Trafalgar Law Leader - DON!! +1 for low life
  {
    id: 'OP01-002',
    name: 'Trafalgar Law',
    type: 'LEADER',
    colors: ['BLUE'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Heart Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'OP01-002-effect-1',
        trigger: EffectTrigger.START_OF_TURN,
        conditions: [
          {
            type: ConditionType.LIFE_COUNT_OR_LESS,
            value: 2,
          },
        ],
        effects: [
          {
            type: EffectType.GAIN_ACTIVE_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'When your Life is 2 or less, at the start of your turn, gain +1 DON!!.',
      },
    ],
  },

  // Kaido Leader - End of Turn: KO if you have more characters
  {
    id: 'OP04-031',
    name: 'Kaido',
    type: 'LEADER',
    colors: ['PURPLE'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Animal Kingdom Pirates', 'Four Emperors'],
    keywords: [],
    effects: [
      {
        id: 'OP04-031-effect-1',
        trigger: EffectTrigger.END_OF_TURN,
        conditions: [
          {
            type: ConditionType.CHARACTER_COUNT_OR_MORE,
            value: 3,
          },
        ],
        effects: [
          {
            type: EffectType.KO_COST_OR_LESS,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 4,
                },
              ],
            },
            value: 4,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'End of Your Turn: If you have 3 or more Characters, K.O. up to 1 of your opponent\'s Characters with a cost of 4 or less.',
      },
    ],
  },
];

// ============================================
// STARTER DECK 01 - STRAW HAT CREW (RED)
// ============================================

export const starterDeck01Cards: CardDefinition[] = [
  // ST01-004 Usopp
  {
    id: 'ST01-004',
    name: 'Usopp',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 2000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-004-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.LOOK_AT_TOP_DECK,
            value: 5,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: Look at the top 5 cards of your deck and place them in any order.',
      },
    ],
  },

  // ST01-005 Karoo
  {
    id: 'ST01-005',
    name: 'Karoo',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 3000,
    counter: 1000,
    traits: ['Alabasta', 'Animal'],
    keywords: [],
    effects: [],
  },

  // ST01-006 Sanji
  {
    id: 'ST01-006',
    name: 'Sanji',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 4000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [],
  },

  // Note: ST01-007 (Nami) is defined later in this file with ATTACH_DON effect

  // ST01-008 Tony Tony Chopper
  {
    id: 'ST01-008',
    name: 'Tony Tony Chopper',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 1000,
    counter: 2000,
    traits: ['Animal', 'Straw Hat Crew'],
    keywords: [],
    effects: [],
  },

  // ST01-009 Nami
  {
    id: 'ST01-009',
    name: 'Nami',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 1000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-009-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.DRAW_CARDS,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: Draw 1 card.',
      },
    ],
  },

  // ST01-010 Nico Robin
  {
    id: 'ST01-010',
    name: 'Nico Robin',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 3,
    power: 5000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [],
  },

  // ST01-011 Franky
  {
    id: 'ST01-011',
    name: 'Franky',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 4,
    power: 5000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-011-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'On Play: This Character gains +2000 power during this turn.',
      },
    ],
  },

  // ST01-012 Sanji (Rush)
  {
    id: 'ST01-012',
    name: 'Sanji',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 3,
    power: 4000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: ['Rush'],
    effects: [],
  },

  // ST01-013 Roronoa Zoro (Blocker)
  {
    id: 'ST01-013',
    name: 'Roronoa Zoro',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 3,
    power: 5000,
    counter: null,
    traits: ['Straw Hat Crew', 'Supernovas'],
    keywords: ['Blocker'],
    effects: [],
  },

  // ST01-014 Guard Point (Event with Counter)
  {
    id: 'ST01-014',
    name: 'Guard Point',
    type: 'EVENT',
    colors: ['RED'],
    cost: 1,
    power: null,
    counter: null,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-014-effect-1',
        trigger: EffectTrigger.COUNTER,
        effects: [
          {
            type: EffectType.BUFF_COMBAT,
            target: {
              type: TargetType.YOUR_LEADER_OR_CHARACTER,
              count: 1,
            },
            value: 3000,
            duration: EffectDuration.UNTIL_END_OF_BATTLE,
          },
        ],
        description: '[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle.',
      },
      {
        id: 'ST01-014-effect-2',
        trigger: EffectTrigger.TRIGGER,
        effects: [
          {
            type: EffectType.BUFF_POWER,
            target: {
              type: TargetType.YOUR_LEADER_OR_CHARACTER,
              count: 1,
            },
            value: 1000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: '[Trigger] Up to 1 of your Leader or Character cards gains +1000 power during this turn.',
      },
    ],
  },

  // ST01-015 Gum-Gum Jet Pistol (Event)
  // [Main] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.
  // [Trigger] Activate this card's [Main] effect.
  {
    id: 'ST01-015',
    name: 'Gum-Gum Jet Pistol',
    type: 'EVENT',
    colors: ['RED'],
    cost: 4,
    power: null,
    counter: null,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-015-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        effects: [
          {
            type: EffectType.KO_COST_OR_LESS,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 4,
                },
              ],
            },
            value: 4,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: '[Main] K.O. up to 1 of your opponent\'s Characters with a cost of 4 or less.',
      },
      {
        id: 'ST01-015-effect-2',
        trigger: EffectTrigger.TRIGGER,
        effects: [
          {
            type: EffectType.KO_COST_OR_LESS,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 4,
                },
              ],
            },
            value: 4,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: '[Trigger] Activate this card\'s [Main] effect.',
      },
    ],
  },

  // ST01-001 Monkey D. Luffy (Leader) - Give DON ability
  {
    id: 'ST01-001',
    name: 'Monkey D. Luffy',
    type: 'LEADER',
    colors: ['RED'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Straw Hat Crew', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST01-001-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give this Leader or 1 of your Characters up to 1 rested DON!! card.',
      },
    ],
  },

  // ST01-007 Nami - Give DON ability
  {
    id: 'ST01-007',
    name: 'Nami',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 1000,
    counter: 1000,
    traits: ['Straw Hat Crew'],
    keywords: [],
    effects: [
      {
        id: 'ST01-007-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
      },
    ],
  },
];

// ============================================
// STARTER DECK 02 - WORST GENERATION (GREEN)
// ============================================

export const starterDeck02Cards: CardDefinition[] = [
  // ST02-001 Eustass Kid (Leader)
  {
    id: 'ST02-001',
    name: 'Eustass Kid',
    type: 'LEADER',
    colors: ['GREEN'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Kid Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-001-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        costs: [
          {
            type: 'REST_DON',
            count: 2,
          },
        ],
        effects: [
          {
            type: EffectType.ACTIVATE_CHARACTER,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Rest 2 DON!! to activate 1 of your rested Characters.',
      },
    ],
  },

  // ST02-002 Killer
  {
    id: 'ST02-002',
    name: 'Killer',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 3,
    power: 4000,
    counter: 1000,
    traits: ['Kid Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-002-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.ACTIVATE_CHARACTER,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            duration: EffectDuration.INSTANT,
          },
        ],
        isOptional: true,
        description: 'On Play: You may activate 1 of your rested Characters.',
      },
    ],
  },

  // ST02-003 Scratchmen Apoo
  {
    id: 'ST02-003',
    name: 'Scratchmen Apoo',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 3,
    power: 5000,
    counter: 1000,
    traits: ['On Air Pirates', 'Supernovas'],
    keywords: [],
    effects: [],
  },

  // ST02-004 Jewelry Bonney
  {
    id: 'ST02-004',
    name: 'Jewelry Bonney',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 1,
    power: 0,
    counter: 1000,
    traits: ['Bonney Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-004-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.DRAW_CARDS,
            value: 2,
            duration: EffectDuration.INSTANT,
          },
          {
            type: EffectType.DISCARD_FROM_HAND,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: Draw 2 cards, then discard 1 card from your hand.',
      },
    ],
  },

  // ST02-005 Trafalgar Law
  {
    id: 'ST02-005',
    name: 'Trafalgar Law',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 5,
    power: 6000,
    counter: 1000,
    traits: ['Heart Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-005-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.RETURN_TO_HAND,
            target: {
              type: TargetType.OPPONENT_CHARACTER,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 3,
                },
              ],
            },
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On Play: Return up to 1 of your opponent\'s Characters with a cost of 3 or less to the owner\'s hand.',
      },
    ],
  },

  // ST02-006 Basil Hawkins
  {
    id: 'ST02-006',
    name: 'Basil Hawkins',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 4,
    power: 6000,
    counter: 1000,
    traits: ['Hawkins Pirates', 'Supernovas'],
    keywords: [],
    effects: [],
  },

  // ST02-007 Heat
  {
    id: 'ST02-007',
    name: 'Heat',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 2,
    power: 4000,
    counter: 1000,
    traits: ['Kid Pirates'],
    keywords: [],
    effects: [],
  },

  // ST02-008 Bepo
  {
    id: 'ST02-008',
    name: 'Bepo',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 2,
    power: 4000,
    counter: 1000,
    traits: ['Heart Pirates', 'Mink Tribe'],
    keywords: [],
    effects: [],
  },

  // ST02-009 Capone Bege
  {
    id: 'ST02-009',
    name: 'Capone Bege',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 2,
    power: 3000,
    counter: 1000,
    traits: ['Fire Tank Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-009-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'On Play: This Character gains +2000 power during this turn.',
      },
    ],
  },

  // ST02-010 Urouge
  {
    id: 'ST02-010',
    name: 'Urouge',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 4,
    power: 5000,
    counter: 1000,
    traits: ['Fallen Monk Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-010-effect-1',
        trigger: EffectTrigger.ON_ATTACK,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'On Attack: This Character gains +2000 power during this turn.',
      },
    ],
  },

  // ST02-011 X Drake
  {
    id: 'ST02-011',
    name: 'X Drake',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 4,
    power: 5000,
    counter: 1000,
    traits: ['Drake Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-011-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.BUFF_ANY,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            value: 3000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        isOptional: true,
        description: 'On Play: Give up to 1 of your Characters +3000 power during this turn.',
      },
    ],
  },

  // ST02-013 Eustass Kid (Character)
  {
    id: 'ST02-013',
    name: 'Eustass Kid',
    type: 'CHARACTER',
    colors: ['GREEN'],
    cost: 5,
    power: 7000,
    counter: null,
    traits: ['Kid Pirates', 'Supernovas'],
    keywords: [],
    effects: [
      {
        id: 'ST02-013-effect-1',
        trigger: EffectTrigger.DON_X,
        triggerValue: 1,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 1000,
            duration: EffectDuration.WHILE_ON_FIELD,
          },
        ],
        description: 'DON!! x1: This Character gains +1000 power.',
      },
    ],
  },
];

// ============================================
// MORE POPULAR CARDS
// ============================================

export const popularCards: CardDefinition[] = [
  // OP01-004 Koby - Blocker
  {
    id: 'OP01-004',
    name: 'Koby',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 3000,
    counter: 1000,
    traits: ['Navy'],
    keywords: ['Blocker'],
    effects: [],
  },

  // OP01-005 Sabo - Rush
  {
    id: 'OP01-005',
    name: 'Sabo',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 5,
    power: 6000,
    counter: null,
    traits: ['Revolutionary Army'],
    keywords: ['Rush'],
    effects: [
      {
        id: 'OP01-005-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'On Play: This Character gains +2000 power during this turn.',
      },
    ],
  },

  // OP01-008 Portgas D. Ace
  {
    id: 'OP01-008',
    name: 'Portgas D. Ace',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 7,
    power: 7000,
    counter: null,
    traits: ['Whitebeard Pirates'],
    keywords: ['Rush'],
    effects: [
      {
        id: 'OP01-008-effect-1',
        trigger: EffectTrigger.ON_KO,
        effects: [
          {
            type: EffectType.TAKE_LIFE,
            target: {
              type: TargetType.OPPONENT_LEADER,
              count: 1,
            },
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'On K.O.: Deal 1 damage to your opponent\'s Leader.',
      },
    ],
  },

  // OP01-011 Dadan Family
  {
    id: 'OP01-011',
    name: 'Dadan Family',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 2000,
    counter: 1000,
    traits: ['Mountain Bandits'],
    keywords: [],
    effects: [
      {
        id: 'OP01-011-effect-1',
        trigger: EffectTrigger.TRIGGER,
        effects: [
          {
            type: EffectType.PLAY_FROM_TRASH,
            target: {
              type: TargetType.YOUR_TRASH,
              count: 1,
              filters: [
                {
                  property: 'COST',
                  operator: 'OR_LESS',
                  value: 2,
                },
              ],
            },
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Trigger: Play up to 1 Character with a cost of 2 or less from your trash.',
      },
    ],
  },

  // OP01-020 Makino
  {
    id: 'OP01-020',
    name: 'Makino',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 0,
    counter: 2000,
    traits: ['Windmill Village'],
    keywords: [],
    effects: [
      {
        id: 'OP01-020-effect-1',
        trigger: EffectTrigger.ON_PLAY,
        effects: [
          {
            type: EffectType.ADD_TO_LIFE,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        conditions: [
          {
            type: ConditionType.LIFE_COUNT_OR_LESS,
            value: 2,
          },
        ],
        description: 'On Play: If you have 2 or less life, add the top card of your deck to your life.',
      },
    ],
  },

  // OP02-001 Edward Newgate (Whitebeard) Leader
  {
    id: 'OP02-001',
    name: 'Edward Newgate',
    type: 'LEADER',
    colors: ['RED'],
    cost: null,
    power: 6000,
    counter: null,
    traits: ['Whitebeard Pirates', 'Four Emperors'],
    keywords: [],
    effects: [
      {
        id: 'OP02-001-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        costs: [
          {
            type: 'LIFE',
            count: 1,
          },
        ],
        effects: [
          {
            type: EffectType.BUFF_ANY,
            target: {
              type: TargetType.YOUR_CHARACTER,
              count: 1,
            },
            value: 2000,
            duration: EffectDuration.UNTIL_END_OF_TURN,
          },
        ],
        description: 'Activate: Main Once Per Turn: Place 1 card from the top of your life face down at the bottom of your deck to give 1 of your Characters +2000 power during this turn.',
      },
    ],
  },

  // OP03-001 Charlotte Linlin (Big Mom) Leader
  {
    id: 'OP03-001',
    name: 'Charlotte Linlin',
    type: 'LEADER',
    colors: ['YELLOW'],
    cost: null,
    power: 5000,
    counter: null,
    traits: ['Big Mom Pirates', 'Four Emperors'],
    keywords: [],
    effects: [
      {
        id: 'OP03-001-effect-1',
        trigger: EffectTrigger.ON_ATTACK,
        conditions: [
          {
            type: ConditionType.LIFE_COUNT_OR_MORE,
            value: 3,
          },
        ],
        effects: [
          {
            type: EffectType.BUFF_SELF,
            value: 1000,
            duration: EffectDuration.UNTIL_END_OF_BATTLE,
          },
        ],
        description: 'When Attacking: If you have 3 or more life, this Leader gains +1000 power during this battle.',
      },
    ],
  },

  // ============================================
  // GIVE DON ABILITY CARDS
  // ============================================

  // OP03-009 Haruta - Give DON
  {
    id: 'OP03-009',
    name: 'Haruta',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 3000,
    counter: 1000,
    traits: ['Whitebeard Pirates'],
    keywords: [],
    effects: [
      {
        id: 'OP03-009-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
      },
    ],
  },

  // EB01-007 Yamato - Give DON
  {
    id: 'EB01-007',
    name: 'Yamato',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 5,
    power: 5000,
    counter: 2000,
    traits: ['Land of Wano'],
    keywords: [],
    effects: [
      {
        id: 'EB01-007-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
      },
    ],
  },

  // OP06-011 Otama - Give DON (common red card)
  {
    id: 'OP06-011',
    name: 'Otama',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 1,
    power: 2000,
    counter: 1000,
    traits: ['Land of Wano'],
    keywords: [],
    effects: [
      {
        id: 'OP06-011-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
      },
    ],
  },

  // ST13-003 Koby - Give DON (Starter Deck)
  {
    id: 'ST13-003',
    name: 'Koby',
    type: 'CHARACTER',
    colors: ['RED'],
    cost: 2,
    power: 3000,
    counter: 1000,
    traits: ['Navy'],
    keywords: [],
    effects: [
      {
        id: 'ST13-003-effect-1',
        trigger: EffectTrigger.ACTIVATE_MAIN,
        oncePerTurn: true,
        effects: [
          {
            type: EffectType.ATTACH_DON,
            value: 1,
            duration: EffectDuration.INSTANT,
          },
        ],
        description: 'Activate: Main Once Per Turn: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
      },
    ],
  },
];

// All example cards combined
export const allExampleCards: CardDefinition[] = [
  ...exampleCards,
  ...exampleLeaders,
  ...starterDeck01Cards,
  ...starterDeck02Cards,
  ...popularCards,
];

// Validation function to check for duplicate IDs (call during development)
export function validateCardDefinitions(): { valid: boolean; duplicates: string[] } {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  allExampleCards.forEach(card => {
    if (seen.has(card.id)) {
      duplicates.push(`${card.id} (${seen.get(card.id)} vs ${card.name})`);
    } else {
      seen.set(card.id, card.name);
    }
  });

  if (duplicates.length > 0) {
    console.error('[cardDefinitions] DUPLICATE IDs FOUND:');
    duplicates.forEach(d => console.error(`  - ${d}`));
  }

  return { valid: duplicates.length === 0, duplicates };
}

// Uncomment to validate on module load during development:
// validateCardDefinitions();
