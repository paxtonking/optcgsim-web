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
  imageUrl: string;
}

export interface DeckCard {
  card: Card;
  count: number;
}

export interface Deck {
  id: string;
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
