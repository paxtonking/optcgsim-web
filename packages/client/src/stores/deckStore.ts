import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card, Deck, DeckCard } from '../types/card';

const DECK_SIZE = 50;
const MAX_CARD_COPIES = 4;

interface DeckStore {
  decks: Deck[];
  currentDeck: Deck | null;

  // Deck management
  createDeck: (name: string) => string;
  deleteDeck: (id: string) => void;
  renameDeck: (id: string, name: string) => void;
  selectDeck: (id: string) => void;
  closeDeck: () => void;
  duplicateDeck: (id: string) => string;

  // Card management
  setLeader: (card: Card) => void;
  addCard: (card: Card) => boolean;
  removeCard: (cardId: string) => void;
  setCardCount: (cardId: string, count: number) => void;
  clearDeck: () => void;

  // Validation
  getDeckCardCount: () => number;
  isValidDeck: () => { valid: boolean; errors: string[] };
  canAddCard: (card: Card) => boolean;
  getCardCount: (cardId: string) => number;

  // Import/Export
  exportDeck: () => string;
  importDeck: (data: string) => boolean;
}

function generateId(): string {
  return `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useDeckStore = create<DeckStore>()(
  persist(
    (set, get) => ({
      decks: [],
      currentDeck: null,

      createDeck: (name: string) => {
        const id = generateId();
        const newDeck: Deck = {
          id,
          name,
          leader: null,
          cards: [],
          isPublic: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          decks: [...state.decks, newDeck],
          currentDeck: newDeck,
        }));
        return id;
      },

      deleteDeck: (id: string) => {
        set((state) => ({
          decks: state.decks.filter(d => d.id !== id),
          currentDeck: state.currentDeck?.id === id ? null : state.currentDeck,
        }));
      },

      renameDeck: (id: string, name: string) => {
        set((state) => {
          const decks = state.decks.map(d =>
            d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d
          );
          const currentDeck = state.currentDeck?.id === id
            ? { ...state.currentDeck, name, updatedAt: new Date().toISOString() }
            : state.currentDeck;
          return { decks, currentDeck };
        });
      },

      selectDeck: (id: string) => {
        const deck = get().decks.find(d => d.id === id);
        if (deck) {
          set({ currentDeck: deck });
        }
      },

      closeDeck: () => {
        set({ currentDeck: null });
      },

      duplicateDeck: (id: string) => {
        const deck = get().decks.find(d => d.id === id);
        if (!deck) return '';

        const newId = generateId();
        const newDeck: Deck = {
          ...deck,
          id: newId,
          name: `${deck.name} (Copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          decks: [...state.decks, newDeck],
        }));
        return newId;
      },

      setLeader: (card: Card) => {
        if (card.type !== 'LEADER') return;

        set((state) => {
          if (!state.currentDeck) return state;

          const updatedDeck = {
            ...state.currentDeck,
            leader: card,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentDeck: updatedDeck,
            decks: state.decks.map(d =>
              d.id === updatedDeck.id ? updatedDeck : d
            ),
          };
        });
      },

      addCard: (card: Card) => {
        if (!get().canAddCard(card)) return false;

        set((state) => {
          if (!state.currentDeck) return state;

          const existingIndex = state.currentDeck.cards.findIndex(
            dc => dc.card.id === card.id
          );

          let newCards: DeckCard[];
          if (existingIndex >= 0) {
            newCards = state.currentDeck.cards.map((dc, i) =>
              i === existingIndex ? { ...dc, count: dc.count + 1 } : dc
            );
          } else {
            newCards = [...state.currentDeck.cards, { card, count: 1 }];
          }

          const updatedDeck = {
            ...state.currentDeck,
            cards: newCards,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentDeck: updatedDeck,
            decks: state.decks.map(d =>
              d.id === updatedDeck.id ? updatedDeck : d
            ),
          };
        });

        return true;
      },

      removeCard: (cardId: string) => {
        set((state) => {
          if (!state.currentDeck) return state;

          const existingIndex = state.currentDeck.cards.findIndex(
            dc => dc.card.id === cardId
          );

          if (existingIndex < 0) return state;

          let newCards: DeckCard[];
          const existing = state.currentDeck.cards[existingIndex];

          if (existing.count > 1) {
            newCards = state.currentDeck.cards.map((dc, i) =>
              i === existingIndex ? { ...dc, count: dc.count - 1 } : dc
            );
          } else {
            newCards = state.currentDeck.cards.filter((_, i) => i !== existingIndex);
          }

          const updatedDeck = {
            ...state.currentDeck,
            cards: newCards,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentDeck: updatedDeck,
            decks: state.decks.map(d =>
              d.id === updatedDeck.id ? updatedDeck : d
            ),
          };
        });
      },

      setCardCount: (cardId: string, count: number) => {
        if (count < 0 || count > MAX_CARD_COPIES) return;

        set((state) => {
          if (!state.currentDeck) return state;

          let newCards: DeckCard[];

          if (count === 0) {
            newCards = state.currentDeck.cards.filter(dc => dc.card.id !== cardId);
          } else {
            newCards = state.currentDeck.cards.map(dc =>
              dc.card.id === cardId ? { ...dc, count } : dc
            );
          }

          const updatedDeck = {
            ...state.currentDeck,
            cards: newCards,
            updatedAt: new Date().toISOString(),
          };

          return {
            currentDeck: updatedDeck,
            decks: state.decks.map(d =>
              d.id === updatedDeck.id ? updatedDeck : d
            ),
          };
        });
      },

      clearDeck: () => {
        set((state) => {
          if (!state.currentDeck) return state;

          const updatedDeck = {
            ...state.currentDeck,
            leader: null,
            cards: [],
            updatedAt: new Date().toISOString(),
          };

          return {
            currentDeck: updatedDeck,
            decks: state.decks.map(d =>
              d.id === updatedDeck.id ? updatedDeck : d
            ),
          };
        });
      },

      getDeckCardCount: () => {
        const deck = get().currentDeck;
        if (!deck) return 0;
        return deck.cards.reduce((sum, dc) => sum + dc.count, 0);
      },

      isValidDeck: () => {
        const deck = get().currentDeck;
        const errors: string[] = [];

        if (!deck) {
          return { valid: false, errors: ['No deck selected'] };
        }

        if (!deck.leader) {
          errors.push('Deck must have a leader');
        }

        const cardCount = deck.cards.reduce((sum, dc) => sum + dc.count, 0);
        if (cardCount !== DECK_SIZE) {
          errors.push(`Deck must have exactly ${DECK_SIZE} cards (currently ${cardCount})`);
        }

        // Check for cards exceeding max copies
        for (const dc of deck.cards) {
          if (dc.count > MAX_CARD_COPIES) {
            errors.push(`${dc.card.name} exceeds max ${MAX_CARD_COPIES} copies`);
          }
        }

        // Check color restrictions (cards must match leader colors)
        if (deck.leader) {
          const leaderColors = deck.leader.colors;
          for (const dc of deck.cards) {
            const cardColors = dc.card.colors;
            const hasValidColor = cardColors.some(c => leaderColors.includes(c));
            if (!hasValidColor && cardColors.length > 0) {
              errors.push(`${dc.card.name} (${cardColors.join('/')}) doesn't match leader colors (${leaderColors.join('/')})`);
            }
          }
        }

        return { valid: errors.length === 0, errors };
      },

      canAddCard: (card: Card) => {
        const deck = get().currentDeck;
        if (!deck) return false;

        // Leaders are handled separately
        if (card.type === 'LEADER') return false;

        // Check deck size
        const currentCount = deck.cards.reduce((sum, dc) => sum + dc.count, 0);
        if (currentCount >= DECK_SIZE) return false;

        // Check card copy limit
        const existingCard = deck.cards.find(dc => dc.card.id === card.id);
        if (existingCard && existingCard.count >= MAX_CARD_COPIES) return false;

        return true;
      },

      getCardCount: (cardId: string) => {
        const deck = get().currentDeck;
        if (!deck) return 0;
        const deckCard = deck.cards.find(dc => dc.card.id === cardId);
        return deckCard?.count || 0;
      },

      exportDeck: () => {
        const deck = get().currentDeck;
        if (!deck) return '';

        const exportData = {
          name: deck.name,
          leaderId: deck.leader?.id,
          cards: deck.cards.map(dc => ({ id: dc.card.id, count: dc.count })),
        };

        return JSON.stringify(exportData);
      },

      importDeck: (data: string) => {
        try {
          const imported = JSON.parse(data);
          // Validate structure
          if (!imported.name || !Array.isArray(imported.cards)) {
            return false;
          }
          // Create deck with imported data
          // Note: Card objects would need to be resolved from card store
          // This is a simplified version
          get().createDeck(imported.name);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'optcgsim-decks',
      partialize: (state) => ({ decks: state.decks }),
    }
  )
);
