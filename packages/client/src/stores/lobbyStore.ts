import { create } from 'zustand';
import { socketService } from '../services/socket';

export type LobbyStatus = 'idle' | 'creating' | 'joining' | 'waiting' | 'ready' | 'starting';
export type QueueStatus = 'idle' | 'searching' | 'matched' | 'starting';

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

  // Queue state
  queueStatus: QueueStatus;
  queueTime: number;
  queueError: string | null;

  // Selected deck
  selectedDeckId: string | null;

  // Actions
  setSelectedDeck: (deckId: string | null) => void;

  // Lobby actions
  createLobby: (isRanked?: boolean) => void;
  joinLobby: (code: string) => void;
  leaveLobby: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;

  // Queue actions
  joinQueue: () => void;
  leaveQueue: () => void;

  // Internal
  handleLobbyUpdate: (lobby: Lobby) => void;
  handleLobbyStart: (gameId: string) => void;
  handleQueueMatched: (data: { gameId: string; opponent: string }) => void;
  reset: () => void;
}

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  lobby: null,
  lobbyStatus: 'idle',
  lobbyError: null,
  queueStatus: 'idle',
  queueTime: 0,
  queueError: null,
  selectedDeckId: null,

  setSelectedDeck: (deckId) => {
    set({ selectedDeckId: deckId });
  },

  createLobby: (isRanked = false) => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ lobbyError: 'Please select a deck first' });
      return;
    }

    set({ lobbyStatus: 'creating', lobbyError: null });

    socketService.emit('lobby:create', {
      deckId: selectedDeckId,
      isRanked,
    });
  },

  joinLobby: (code) => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ lobbyError: 'Please select a deck first' });
      return;
    }

    set({ lobbyStatus: 'joining', lobbyError: null });

    socketService.emit('lobby:join', {
      code,
      deckId: selectedDeckId,
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

  joinQueue: () => {
    const { selectedDeckId } = get();
    if (!selectedDeckId) {
      set({ queueError: 'Please select a deck first' });
      return;
    }

    set({ queueStatus: 'searching', queueError: null, queueTime: 0 });

    socketService.emit('queue:join', {
      deckId: selectedDeckId,
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

  handleLobbyUpdate: (lobby) => {
    set({ lobby, lobbyStatus: 'waiting' });
  },

  handleLobbyStart: (_gameId) => {
    set({ lobbyStatus: 'starting' });
    // Navigation will be handled by the component
  },

  handleQueueMatched: (_data) => {
    set({ queueStatus: 'matched' });
    // Navigation will be handled by the component
  },

  reset: () => {
    set({
      lobby: null,
      lobbyStatus: 'idle',
      lobbyError: null,
      queueStatus: 'idle',
      queueTime: 0,
      queueError: null,
    });
  },
}));

// Socket event listeners setup
export function setupLobbySocketListeners() {
  const store = useLobbyStore.getState();

  socketService.on<Lobby>('lobby:update', (lobby: Lobby) => {
    store.handleLobbyUpdate(lobby);
  });

  socketService.on<{ gameId: string }>('lobby:start', ({ gameId }: { gameId: string }) => {
    store.handleLobbyStart(gameId);
  });

  socketService.on<{ gameId: string; opponent: string }>('queue:matched', (data: { gameId: string; opponent: string }) => {
    store.handleQueueMatched(data);
  });

  socketService.on<{ position: number }>('queue:status', (_data: { position: number }) => {
    // Optional: show queue position
  });

  socketService.on<{ message: string }>('error', ({ message }: { message: string }) => {
    useLobbyStore.setState({
      lobbyError: message,
      queueError: message,
      lobbyStatus: 'idle',
      queueStatus: 'idle',
    });
  });
}
