import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card, Deck, DeckCard } from '../types/card';
import { api } from '../services/api';
import { useCardStore } from './cardStore';

const DECK_SIZE = 50;
const MAX_CARD_COPIES = 4;

// Starter Deck card IDs (50 cards each, max 4 copies per card)
const STARTER_DECKS = {
  'Starter Deck 01 - Straw Hat Crew (Red)': {
    leader: 'ST01-001', // Luffy
    cards: [
      { id: 'ST01-002', count: 4 }, // Monkey.D.Luffy
      { id: 'ST01-003', count: 4 }, // Roronoa Zoro
      { id: 'ST01-004', count: 4 }, // Usopp
      { id: 'ST01-005', count: 4 }, // Karoo
      { id: 'ST01-006', count: 4 }, // Sanji
      { id: 'ST01-007', count: 4 }, // Jinbe
      { id: 'ST01-008', count: 4 }, // Chopper
      { id: 'ST01-009', count: 4 }, // Nami
      { id: 'ST01-010', count: 4 }, // Nico Robin
      { id: 'ST01-011', count: 4 }, // Franky
      { id: 'ST01-012', count: 4 }, // Brook
      { id: 'ST01-014', count: 4 }, // Gum-Gum Jet Pistol
      { id: 'ST01-015', count: 2 }, // Guard Point
    ],
    // Total: 12×4 + 1×2 = 48 + 2 = 50 cards
  },
  'Starter Deck 02 - Worst Generation (Green)': {
    leader: 'ST02-001', // Eustass Kid
    cards: [
      { id: 'ST02-002', count: 4 }, // Killer
      { id: 'ST02-003', count: 4 }, // Scratchmen Apoo
      { id: 'ST02-004', count: 4 }, // Jewelry Bonney
      { id: 'ST02-005', count: 4 }, // Trafalgar Law
      { id: 'ST02-006', count: 4 }, // Basil Hawkins
      { id: 'ST02-007', count: 4 }, // Heat
      { id: 'ST02-008', count: 4 }, // Bepo
      { id: 'ST02-009', count: 4 }, // Capone Bege
      { id: 'ST02-010', count: 4 }, // Urouge
      { id: 'ST02-011', count: 4 }, // X Drake
      { id: 'ST02-012', count: 4 }, // Wire
      { id: 'ST02-013', count: 4 }, // Eustass Kid
      { id: 'ST02-014', count: 2 }, // Punk Gibson
    ],
    // Total: 12×4 + 1×2 = 48 + 2 = 50 cards
  },
};

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
  exportDeckJson: () => string;
  importDeck: (data: string) => { success: boolean; error?: string };
  importDeckWithCards: (data: string, cardLookup: (id: string) => Card | undefined) => { success: boolean; error?: string; deckId?: string };

  // Guest starter decks
  initializeStarterDecks: (cards: Card[]) => void;
  hasStarterDecks: () => boolean;

  // Server sync
  saveDeckToServer: (localDeckId: string) => Promise<string | null>;
  syncDecksWithServer: () => Promise<void>;
  getServerDeckId: (localDeckId: string) => string | null;
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

        // Create a human-readable format
        const lines: string[] = [];
        lines.push(`// ${deck.name}`);
        lines.push(`// Exported from OPTCGSim Web`);
        lines.push('');

        if (deck.leader) {
          lines.push(`// Leader`);
          lines.push(`1 ${deck.leader.id} // ${deck.leader.name}`);
          lines.push('');
        }

        lines.push(`// Main Deck (${deck.cards.reduce((s, c) => s + c.count, 0)} cards)`);
        // Sort by cost then by ID
        const sortedCards = [...deck.cards].sort((a, b) => {
          const costDiff = (a.card.cost ?? 0) - (b.card.cost ?? 0);
          if (costDiff !== 0) return costDiff;
          return a.card.id.localeCompare(b.card.id);
        });

        for (const { card, count } of sortedCards) {
          lines.push(`${count} ${card.id} // ${card.name}`);
        }

        return lines.join('\n');
      },

      // Export as JSON for programmatic use
      exportDeckJson: () => {
        const deck = get().currentDeck;
        if (!deck) return '';

        const exportData = {
          name: deck.name,
          leaderId: deck.leader?.id,
          cards: deck.cards.map(dc => ({ id: dc.card.id, count: dc.count })),
        };

        return JSON.stringify(exportData, null, 2);
      },

      importDeck: (_data: string) => {
        // This function just parses the deck, the actual card resolution
        // must be done by the component using card data
        return { success: false, error: 'Use importDeckWithCards instead' };
      },

      importDeckWithCards: (data: string, cardLookup: (id: string) => Card | undefined) => {
        try {
          let leaderId: string | undefined;
          let deckName = 'Imported Deck';
          const cardEntries: { id: string; count: number }[] = [];

          // Try to parse as JSON first
          try {
            const json = JSON.parse(data);
            if (json.name) deckName = json.name;
            if (json.leaderId) leaderId = json.leaderId;
            if (Array.isArray(json.cards)) {
              for (const entry of json.cards) {
                if (entry.id && typeof entry.count === 'number') {
                  cardEntries.push({ id: entry.id, count: entry.count });
                }
              }
            }
          } catch {
            // Not JSON, parse as text format
            const lines = data.split('\n');
            let isLeaderSection = false;

            for (const line of lines) {
              const trimmed = line.trim();

              // Skip empty lines
              if (!trimmed) continue;

              // Check for deck name in comments
              if (trimmed.startsWith('// ') && !trimmed.includes('Leader') && !trimmed.includes('Deck') && !trimmed.includes('Exported')) {
                deckName = trimmed.slice(3);
                continue;
              }

              // Check for section markers
              if (trimmed.toLowerCase().includes('leader')) {
                isLeaderSection = true;
                continue;
              }
              if (trimmed.toLowerCase().includes('main deck') || trimmed.toLowerCase().includes('cards')) {
                isLeaderSection = false;
                continue;
              }

              // Skip comment-only lines
              if (trimmed.startsWith('//')) continue;

              // Parse card entry: "count cardId" or "count cardId // name"
              const match = trimmed.match(/^(\d+)\s+([A-Z0-9-]+)/i);
              if (match) {
                const count = parseInt(match[1], 10);
                const cardId = match[2].toUpperCase();

                if (isLeaderSection) {
                  leaderId = cardId;
                } else {
                  cardEntries.push({ id: cardId, count });
                }
              }
            }
          }

          // Resolve cards
          let leader: Card | undefined;
          if (leaderId) {
            leader = cardLookup(leaderId);
            if (!leader) {
              return { success: false, error: `Leader card not found: ${leaderId}` };
            }
          }

          const deckCards: DeckCard[] = [];
          const notFoundCards: string[] = [];

          for (const entry of cardEntries) {
            const card = cardLookup(entry.id);
            if (card) {
              deckCards.push({ card, count: Math.min(entry.count, MAX_CARD_COPIES) });
            } else {
              notFoundCards.push(entry.id);
            }
          }

          if (notFoundCards.length > 0 && deckCards.length === 0) {
            return { success: false, error: `No valid cards found. Missing: ${notFoundCards.slice(0, 5).join(', ')}${notFoundCards.length > 5 ? '...' : ''}` };
          }

          // Create the deck
          const id = generateId();
          const newDeck: Deck = {
            id,
            name: deckName,
            leader: leader || null,
            cards: deckCards,
            isPublic: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          set((state) => ({
            decks: [...state.decks, newDeck],
            currentDeck: newDeck,
          }));

          const warning = notFoundCards.length > 0
            ? `. Warning: ${notFoundCards.length} cards not found`
            : '';

          return { success: true, deckId: id, error: warning || undefined };
        } catch (error) {
          return { success: false, error: 'Failed to parse deck data' };
        }
      },

      hasStarterDecks: () => {
        const { decks } = get();
        return decks.some(d => d.name.startsWith('Starter Deck'));
      },

      initializeStarterDecks: (cards: Card[]) => {
        // Don't re-initialize if already have starter decks
        if (get().hasStarterDecks()) return;

        const cardMap = new Map(cards.map(c => [c.id, c]));
        const newDecks: Deck[] = [];

        for (const [deckName, deckData] of Object.entries(STARTER_DECKS)) {
          const leader = cardMap.get(deckData.leader);
          if (!leader) continue;

          const deckCards: DeckCard[] = [];
          for (const { id, count } of deckData.cards) {
            const card = cardMap.get(id);
            if (card) {
              deckCards.push({ card, count });
            }
          }

          const deck: Deck = {
            id: generateId(),
            name: deckName,
            leader,
            cards: deckCards,
            isPublic: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          newDecks.push(deck);
        }

        if (newDecks.length > 0) {
          set((state) => ({
            decks: [...state.decks, ...newDecks],
          }));
        }
      },

      // Save a single deck to the server
      saveDeckToServer: async (localDeckId: string): Promise<string | null> => {
        const deck = get().decks.find(d => d.id === localDeckId);
        if (!deck) {
          console.error('[DeckStore] Deck not found:', localDeckId);
          return null;
        }

        // Already synced
        if (deck.serverId) {
          return deck.serverId;
        }

        // Validate deck has required data
        if (!deck.leader) {
          console.error('[DeckStore] Cannot sync deck without leader:', deck.name);
          return null;
        }

        const cardCount = deck.cards.reduce((sum, dc) => sum + dc.count, 0);
        if (cardCount !== 50) {
          console.error('[DeckStore] Cannot sync deck with invalid card count:', deck.name, cardCount);
          return null;
        }

        try {
          // Convert to server format
          const serverDeckData = {
            name: deck.name,
            leaderId: deck.leader.id,
            cards: deck.cards.map(dc => ({
              cardId: dc.card.id,
              count: dc.count,
            })),
            isPublic: deck.isPublic,
          };

          const response = await api.post<{ id: string }>('/decks', serverDeckData);
          const serverId = response.data.id;

          // Update local deck with serverId
          set((state) => ({
            decks: state.decks.map(d =>
              d.id === localDeckId ? { ...d, serverId } : d
            ),
            currentDeck: state.currentDeck?.id === localDeckId
              ? { ...state.currentDeck, serverId }
              : state.currentDeck,
          }));

          console.log('[DeckStore] Deck synced to server:', deck.name, serverId);
          return serverId;
        } catch (error) {
          console.error('[DeckStore] Failed to save deck to server:', error);
          return null;
        }
      },

      // Sync all local decks with the server
      syncDecksWithServer: async (): Promise<void> => {
        console.log('[DeckStore] Starting deck sync with server...');

        // Get cards from cardStore
        const cards = useCardStore.getState().cards;
        if (cards.length === 0) {
          console.log('[DeckStore] No cards loaded, loading cards first...');
          await useCardStore.getState().loadCards();
        }

        const currentCards = useCardStore.getState().cards;
        if (currentCards.length === 0) {
          console.error('[DeckStore] Cannot sync decks - no cards available');
          return;
        }

        try {
          // First, fetch existing decks from server
          const response = await api.get<Array<{
            id: string;
            name: string;
            leaderId: string;
            cards: Array<{ cardId: string; count: number }>;
            isPublic: boolean;
            createdAt: string;
            updatedAt: string;
          }>>('/decks');

          const serverDecks = response.data;
          const cardMap = new Map(currentCards.map(c => [c.id, c]));
          const localDecks = get().decks;

          // Track which local decks are already on server (by matching serverId)
          const syncedLocalIds = new Set<string>();

          // Update local decks that match server decks by serverId
          for (const localDeck of localDecks) {
            if (localDeck.serverId) {
              const serverDeck = serverDecks.find(sd => sd.id === localDeck.serverId);
              if (serverDeck) {
                syncedLocalIds.add(localDeck.id);
              }
            }
          }

          // Upload local decks that aren't synced yet
          const decksToUpload = localDecks.filter(d => !d.serverId && d.leader);
          console.log(`[DeckStore] Found ${decksToUpload.length} local decks to upload`);

          for (const deck of decksToUpload) {
            // Validate deck before uploading
            const cardCount = deck.cards.reduce((sum, dc) => sum + dc.count, 0);
            if (cardCount !== 50) {
              console.log(`[DeckStore] Skipping invalid deck: ${deck.name} (${cardCount} cards)`);
              continue;
            }

            await get().saveDeckToServer(deck.id);
          }

          // Add server-only decks to local store
          const localServerIds = new Set(localDecks.map(d => d.serverId).filter(Boolean));
          const serverOnlyDecks = serverDecks.filter(sd => !localServerIds.has(sd.id));

          if (serverOnlyDecks.length > 0) {
            console.log(`[DeckStore] Found ${serverOnlyDecks.length} server decks to download`);

            const newLocalDecks: Deck[] = [];
            for (const serverDeck of serverOnlyDecks) {
              const leader = cardMap.get(serverDeck.leaderId);
              if (!leader) {
                console.log(`[DeckStore] Skipping server deck (leader not found): ${serverDeck.name}`);
                continue;
              }

              const deckCards: DeckCard[] = [];
              for (const { cardId, count } of serverDeck.cards) {
                const card = cardMap.get(cardId);
                if (card) {
                  deckCards.push({ card, count });
                }
              }

              newLocalDecks.push({
                id: generateId(),
                serverId: serverDeck.id,
                name: serverDeck.name,
                leader,
                cards: deckCards,
                isPublic: serverDeck.isPublic,
                createdAt: serverDeck.createdAt,
                updatedAt: serverDeck.updatedAt,
              });
            }

            if (newLocalDecks.length > 0) {
              set((state) => ({
                decks: [...state.decks, ...newLocalDecks],
              }));
            }
          }

          console.log('[DeckStore] Deck sync completed');
        } catch (error) {
          console.error('[DeckStore] Failed to sync decks with server:', error);
          // Don't throw - we don't want to break login flow
        }
      },

      // Get the server ID for a local deck
      getServerDeckId: (localDeckId: string): string | null => {
        const deck = get().decks.find(d => d.id === localDeckId);
        return deck?.serverId || null;
      },
    }),
    {
      name: 'optcgsim-decks',
      partialize: (state) => ({ decks: state.decks }),
    }
  )
);
