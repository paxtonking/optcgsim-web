import { create } from 'zustand';
import type { Card } from '../types/card';

interface CardFilters {
  search: string;
  colors: string[];
  types: string[];
  sets: string[];
  minCost: number | null;
  maxCost: number | null;
  minPower: number | null;
  maxPower: number | null;
}

interface CardStore {
  cards: Card[];
  isLoading: boolean;
  error: string | null;
  filters: CardFilters;

  loadCards: () => Promise<void>;
  setFilter: <K extends keyof CardFilters>(key: K, value: CardFilters[K]) => void;
  resetFilters: () => void;
  getFilteredCards: () => Card[];
  getCardById: (id: string) => Card | undefined;
  getLeaders: () => Card[];
  getSets: () => string[];
}

const defaultFilters: CardFilters = {
  search: '',
  colors: [],
  types: [],
  sets: [],
  minCost: null,
  maxCost: null,
  minPower: null,
  maxPower: null,
};

export const useCardStore = create<CardStore>((set, get) => ({
  cards: [],
  isLoading: false,
  error: null,
  filters: { ...defaultFilters },

  loadCards: async () => {
    if (get().cards.length > 0) return; // Already loaded

    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/data/cards.json');
      if (!response.ok) {
        throw new Error('Failed to load card data');
      }
      const cards: Card[] = await response.json();
      set({ cards, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value }
    }));
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  getFilteredCards: () => {
    const { cards, filters } = get();

    return cards.filter((card) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const nameMatch = card.name.toLowerCase().includes(searchLower);
        const idMatch = card.id.toLowerCase().includes(searchLower);
        const effectMatch = card.effect?.toLowerCase().includes(searchLower);
        if (!nameMatch && !idMatch && !effectMatch) return false;
      }

      // Color filter
      if (filters.colors.length > 0) {
        const hasColor = card.colors.some(c => filters.colors.includes(c));
        if (!hasColor) return false;
      }

      // Type filter
      if (filters.types.length > 0) {
        if (!filters.types.includes(card.type)) return false;
      }

      // Set filter
      if (filters.sets.length > 0) {
        if (!filters.sets.includes(card.setCode)) return false;
      }

      // Cost filter
      if (filters.minCost !== null && card.cost !== null) {
        if (card.cost < filters.minCost) return false;
      }
      if (filters.maxCost !== null && card.cost !== null) {
        if (card.cost > filters.maxCost) return false;
      }

      // Power filter
      if (filters.minPower !== null && card.power !== null) {
        if (card.power < filters.minPower) return false;
      }
      if (filters.maxPower !== null && card.power !== null) {
        if (card.power > filters.maxPower) return false;
      }

      return true;
    });
  },

  getCardById: (id: string) => {
    return get().cards.find(c => c.id === id);
  },

  getLeaders: () => {
    return get().cards.filter(c => c.type === 'LEADER');
  },

  getSets: () => {
    const sets = new Set(get().cards.map(c => c.setCode));
    return Array.from(sets).sort();
  },
}));
