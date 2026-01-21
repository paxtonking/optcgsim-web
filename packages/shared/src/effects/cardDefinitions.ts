// Example Card Effect Definitions
// These show how to define card effects using the effect system

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

// All example cards combined
export const allExampleCards: CardDefinition[] = [...exampleCards, ...exampleLeaders];
