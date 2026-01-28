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
  leaderColors: string[];  // Auto-set when leader is selected in deck builder
}

interface CardStore {
  cards: Card[];
  isLoading: boolean;
  error: string | null;
  filters: CardFilters;

  loadCards: () => Promise<void>;
  setFilter: <K extends keyof CardFilters>(key: K, value: CardFilters[K]) => void;
  resetFilters: () => void;
  setLeaderColors: (colors: string[]) => void;
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
  leaderColors: [],
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

  setLeaderColors: (colors: string[]) => {
    // Handle dual-color leaders where colors are stored as "GREEN RED" instead of ["GREEN", "RED"]
    // Split any combined color strings into individual colors
    const expandedColors = colors.flatMap(c => c.split(' '));
    set((state) => ({
      filters: { ...state.filters, leaderColors: expandedColors }
    }));
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

      // Color filter (handle dual-color cards stored as "GREEN RED")
      if (filters.colors.length > 0) {
        const cardColors = card.colors.flatMap(c => c.split(' '));
        const hasColor = cardColors.some(c => filters.colors.includes(c));
        if (!hasColor) return false;
      }

      // Leader colors filter (auto-set when leader is selected)
      // Only filter non-leader cards - leaders can still be viewed to change selection
      if (filters.leaderColors.length > 0 && card.type !== 'LEADER') {
        // Handle dual-color cards where colors may be stored as "GREEN RED"
        const cardColors = card.colors.flatMap(c => c.split(' '));
        const hasLeaderColor = cardColors.some(c => filters.leaderColors.includes(c));
        if (!hasLeaderColor) return false;
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
