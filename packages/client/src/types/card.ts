export interface Card {
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
  life?: number;  // Life count for leaders (4 or 5)
  imageUrl: string;
}

/**
 * Loose card definition type used by game components.
 * Superset of all fields that any component may reference.
 * Most fields are optional because not all data sources provide every field.
 */
export interface ClientCardDefinition {
  id: string;
  name: string;
  type?: string;
  cardType?: string;
  color?: string;
  colors?: string[];
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  life?: number | null;
  attribute?: string | null;
  effect?: string | null;
  trigger?: string | null;
  imageUrl?: string;
  images?: { small?: string; large?: string };
  keywords?: string[];
  traits?: string[];
  effectText?: string;
}

export interface DeckCard {
  card: Card;
  count: number;
}

export interface Deck {
  id: string;
  serverId?: string; // Database ID - undefined means not synced to server
  name: string;
  leader: Card | null;
  cards: DeckCard[];
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CardType = 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE';
export type CardColor = 'RED' | 'GREEN' | 'BLUE' | 'PURPLE' | 'BLACK' | 'YELLOW';

export const CARD_COLORS: CardColor[] = ['RED', 'GREEN', 'BLUE', 'PURPLE', 'BLACK', 'YELLOW'];
export const CARD_TYPES: CardType[] = ['LEADER', 'CHARACTER', 'EVENT', 'STAGE'];

export const COLOR_HEX: Record<CardColor, string> = {
  RED: '#DC2626',
  GREEN: '#16A34A',
  BLUE: '#2563EB',
  PURPLE: '#9333EA',
  BLACK: '#1F2937',
  YELLOW: '#EAB308',
};
