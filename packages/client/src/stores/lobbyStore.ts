import { create } from 'zustand';
import { socketService } from '../services/socket';
import { useDeckStore } from './deckStore';

export type LobbyStatus = 'idle' | 'creating' | 'joining' | 'waiting' | 'ready' | 'starting';
export type QueueStatus = 'idle' | 'searching' | 'matched' | 'starting';
export type AIGameStatus = 'idle' | 'starting' | 'playing';
export type AIDifficulty = 'basic' | 'medium' | 'hard';

interface LobbyPlayer {
  id: string;
  username: string;
  isReady: boolean;
  deck?: {
    id: string;
    name: string;
    leaderName: string;
  };
}

interface Lobby {
  id: string;
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  isRanked: boolean;
  createdAt: string;
}

interface LobbyStore {
  // Lobby state
  lobby: Lobby | null;
  lobbyStatus: LobbyStatus;
  lobbyError: string | null;
  gameId: string | null;  // Game ID when lobby starts

  // Queue state
  queueStatus: QueueStatus;
  queueTime: number;
  queueError: string | null;

  // AI Game state
  aiGameStatus: AIGameStatus;
  aiGameId: string | null;
  aiDifficulty: AIDifficulty | null;
  aiError: string | null;

  // Selected deck
  selectedDeckId: string | null;

  // Selected AI opponent deck (null = Random)
  selectedAIDeckId: string | null;

  // Actions
  setSelectedDeck: (deckId: string | null) => void;
  setSelectedAIDeck: (deckId: string | null) => void;

  // Lobby actions
  createLobby: (isRanked?: boolean) => void;
  joinLobby: (code: string) => void;
  leaveLobby: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;

  // Queue actions
  joinQueue: () => void;
  leaveQueue: () => void;

  // AI Game actions
  startAIGame: (difficulty: AIDifficulty) => void;
  startTutorialGame: () => void;
  handleAIGameStart: (gameId: string) => void;

  // Tutorial state
  tutorialGameId: string | null;

  // Internal
  handleLobbyUpdate: (lobby: Lobby) => void;
  handleLobbyStart: (gameId: string) => void;
  handleQueueMatched: (data: { gameId: string; opponent: { id: string; username: string; eloRating: number } }) => void;
  reset: () => void;
}

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  lobby: null,
  lobbyStatus: 'idle',
  lobbyError: null,
  gameId: null,
  queueStatus: 'idle',
  queueTime: 0,
  queueError: null,
  aiGameStatus: 'idle',
  aiGameId: null,
  aiDifficulty: null,
  aiError: null,
  selectedDeckId: null,
  selectedAIDeckId: null,
  tutorialGameId: null,

  setSelectedDeck: (deckId) => {
    set({ selectedDeckId: deckId });
  },

  setSelectedAIDeck: (deckId) => {
    set({ selectedAIDeckId: deckId });
  },

  createLobby: async (isRanked = false) => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ lobbyError: 'Please select a deck first' });
      return;
    }

    // Get server deck ID, or try to sync if not yet synced
    let serverDeckId = useDeckStore.getState().getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      set({ lobbyStatus: 'creating', lobbyError: null });
      // Try to sync the deck to server
      serverDeckId = await useDeckStore.getState().saveDeckToServer(selectedDeckId);
      if (!serverDeckId) {
        set({ lobbyError: 'Failed to sync deck to server. Please check deck validity.', lobbyStatus: 'idle' });
        return;
      }
    }

    set({ lobbyStatus: 'creating', lobbyError: null });

    socketService.emit('lobby:create', {
      deckId: serverDeckId,
      isRanked,
    }, (response: { success: boolean; lobby?: any; error?: string }) => {
      if (response.success && response.lobby) {
        set({ lobby: response.lobby, lobbyStatus: 'waiting', lobbyError: null });
      } else {
        set({ lobbyError: response.error || 'Failed to create lobby', lobbyStatus: 'idle' });
      }
    });
  },

  joinLobby: async (code) => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ lobbyError: 'Please select a deck first' });
      return;
    }

    // Get server deck ID, or try to sync if not yet synced
    let serverDeckId = useDeckStore.getState().getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      set({ lobbyStatus: 'joining', lobbyError: null });
      // Try to sync the deck to server
      serverDeckId = await useDeckStore.getState().saveDeckToServer(selectedDeckId);
      if (!serverDeckId) {
        set({ lobbyError: 'Failed to sync deck to server. Please check deck validity.', lobbyStatus: 'idle' });
        return;
      }
    }

    set({ lobbyStatus: 'joining', lobbyError: null });

    socketService.emit('lobby:join', {
      code,
      deckId: serverDeckId,
    }, (response: { success: boolean; lobby?: any; error?: string }) => {
      if (response.success && response.lobby) {
        set({ lobby: response.lobby, lobbyStatus: 'waiting', lobbyError: null });
      } else {
        set({ lobbyError: response.error || 'Failed to join lobby', lobbyStatus: 'idle' });
      }
    });
  },

  leaveLobby: () => {
    const { lobby } = get();
    if (lobby) {
      socketService.emit('lobby:leave', { lobbyId: lobby.id });
    }
    set({ lobby: null, lobbyStatus: 'idle' });
  },

  setReady: (ready) => {
    const { lobby } = get();
    if (lobby) {
      socketService.emit('lobby:ready', { lobbyId: lobby.id, ready });
    }
  },

  startGame: () => {
    const { lobby } = get();
    if (lobby) {
      socketService.emit('lobby:start', { lobbyId: lobby.id });
      set({ lobbyStatus: 'starting' });
    }
  },

  joinQueue: async () => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ queueError: 'Please select a deck first' });
      return;
    }

    // Get server deck ID, or try to sync if not yet synced
    let serverDeckId = useDeckStore.getState().getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      set({ queueStatus: 'searching', queueError: null });
      // Try to sync the deck to server
      serverDeckId = await useDeckStore.getState().saveDeckToServer(selectedDeckId);
      if (!serverDeckId) {
        set({ queueError: 'Failed to sync deck to server. Please check deck validity.', queueStatus: 'idle' });
        return;
      }
    }

    set({ queueStatus: 'searching', queueError: null, queueTime: 0 });

    socketService.emit('queue:join', {
      deckId: serverDeckId,
    }, (response: { success: boolean; position?: number; error?: string }) => {
      if (!response.success) {
        set({ queueError: response.error || 'Failed to join queue', queueStatus: 'idle' });
        return;
      }
      console.log(`[LobbyStore] Joined queue at position ${response.position}`);
    });

    // Start timer
    const interval = setInterval(() => {
      const { queueStatus } = get();
      if (queueStatus === 'searching') {
        set((state) => ({ queueTime: state.queueTime + 1 }));
      } else {
        clearInterval(interval);
      }
    }, 1000);
  },

  leaveQueue: () => {
    socketService.emit('queue:leave', {});
    set({ queueStatus: 'idle', queueTime: 0 });
  },

  startAIGame: async (difficulty: AIDifficulty) => {
    const { selectedDeckId, selectedAIDeckId } = get();
    if (!selectedDeckId) {
      set({ aiError: 'Please select a deck first' });
      return;
    }

    // Get server deck ID, or try to sync if not yet synced
    let serverDeckId = useDeckStore.getState().getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      set({ aiGameStatus: 'starting', aiDifficulty: difficulty, aiError: null });
      // Try to sync the deck to server
      serverDeckId = await useDeckStore.getState().saveDeckToServer(selectedDeckId);
      if (!serverDeckId) {
        set({ aiError: 'Failed to sync deck to server. Please check deck validity.', aiGameStatus: 'idle' });
        return;
      }
    }

    // Sync AI deck if a specific one is selected
    let aiServerDeckId: string | undefined;
    if (selectedAIDeckId) {
      aiServerDeckId = useDeckStore.getState().getServerDeckId(selectedAIDeckId) ?? undefined;
      if (!aiServerDeckId) {
        set({ aiGameStatus: 'starting', aiDifficulty: difficulty, aiError: null });
        aiServerDeckId = (await useDeckStore.getState().saveDeckToServer(selectedAIDeckId)) ?? undefined;
        if (!aiServerDeckId) {
          set({ aiError: 'Failed to sync AI deck to server. Please check deck validity.', aiGameStatus: 'idle' });
          return;
        }
      }
    }

    set({ aiGameStatus: 'starting', aiDifficulty: difficulty, aiError: null });

    socketService.emit('ai:start', {
      deckId: serverDeckId,
      difficulty,
      ...(aiServerDeckId ? { aiDeckId: aiServerDeckId } : {}),
    });
  },

  startTutorialGame: () => {
    set({ aiGameStatus: 'starting', aiDifficulty: 'basic', aiError: null, tutorialGameId: null });
    socketService.emit('ai:tutorial', {}, (response: { success: boolean; gameId?: string; error?: string }) => {
      if (!response?.success) {
        set({ aiError: response?.error || 'Failed to start tutorial', aiGameStatus: 'idle' });
      }
    });
  },

  handleAIGameStart: (gameId: string) => {
    set({ aiGameStatus: 'playing', aiGameId: gameId });
  },

  handleLobbyUpdate: (lobby) => {
    set({ lobby, lobbyStatus: 'waiting' });
  },

  handleLobbyStart: (gameId) => {
    set({ lobbyStatus: 'starting', gameId });
    // Navigation will be handled by the component watching gameId
  },

  handleQueueMatched: (data) => {
    console.log('[LobbyStore] Queue matched:', data);
    set({ queueStatus: 'matched', gameId: data.gameId });
    // Navigation will be handled by the component watching gameId
  },

  reset: () => {
    set({
      lobby: null,
      lobbyStatus: 'idle',
      lobbyError: null,
      gameId: null,
      queueStatus: 'idle',
      queueTime: 0,
      queueError: null,
      aiGameStatus: 'idle',
      aiGameId: null,
      aiDifficulty: null,
      aiError: null,
      selectedAIDeckId: null,
      tutorialGameId: null,
    });
  },
}));

// Track if listeners have been set up to prevent duplicates
let listenersInitialized = false;

// Socket event listeners setup
export function setupLobbySocketListeners() {
  // Prevent duplicate listener registration
  if (listenersInitialized) {
    return;
  }
  listenersInitialized = true;

  const store = useLobbyStore.getState();

  socketService.on<Lobby>('lobby:update', (lobby: Lobby) => {
    store.handleLobbyUpdate(lobby);
  });

  // Single consolidated listener for lobby:start that handles AI, tutorial, and regular games
  socketService.on<{ gameId: string; state?: unknown; isAIGame?: boolean; isTutorial?: boolean }>('lobby:start', (data) => {
    if (data.isTutorial) {
      useLobbyStore.setState({ tutorialGameId: data.gameId });
      store.handleAIGameStart(data.gameId);
    } else if (data.isAIGame) {
      store.handleAIGameStart(data.gameId);
    } else {
      store.handleLobbyStart(data.gameId);
    }
  });

  socketService.on<{ gameId: string; opponent: { id: string; username: string; eloRating: number } }>('queue:matched', (data) => {
    console.log('[LobbyStore] Received queue:matched event:', data);
    store.handleQueueMatched(data);
  });

  socketService.on<{ position: number }>('queue:status', (_data: { position: number }) => {
    // Optional: show queue position
  });

  socketService.on<{ message: string }>('error', ({ message }: { message: string }) => {
    useLobbyStore.setState({
      lobbyError: message,
      queueError: message,
      aiError: message,
      lobbyStatus: 'idle',
      queueStatus: 'idle',
      aiGameStatus: 'idle',
    });
  });
}

// Reset listeners flag (useful for testing or logout)
export function cleanupLobbySocketListeners() {
  listenersInitialized = false;
  socketService.off('lobby:update');
  socketService.off('lobby:start');
  socketService.off('queue:matched');
  socketService.off('queue:status');
  socketService.off('error');
}
