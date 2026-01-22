import { create } from 'zustand';
import { connectSocket } from '../services/socket';
import { WS_EVENTS } from '@optcgsim/shared';

interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

interface LobbyChatState {
  messages: ChatMessage[];
  isConnected: boolean;

  // Actions
  sendMessage: (message: string) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  joinLobbyChat: () => () => void;
}

export const useLobbyChatStore = create<LobbyChatState>((set, get) => ({
  messages: [],
  isConnected: false,

  sendMessage: (message: string) => {
    if (!message.trim()) return;

    const socket = connectSocket();
    socket.emit(WS_EVENTS.LOBBY_CHAT_SEND, message.trim());
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages.slice(-99), message], // Keep last 100 messages
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  joinLobbyChat: () => {
    const socket = connectSocket();

    // Join the lobby chat room
    socket.emit('lobby:chat:join');

    // Handle incoming messages
    const handleMessage = (message: ChatMessage) => {
      get().addMessage(message);
    };

    // Handle message history on join
    const handleHistory = (data: { messages: ChatMessage[] }) => {
      set({ messages: data.messages });
    };

    socket.on(WS_EVENTS.LOBBY_CHAT_MESSAGE, handleMessage);
    socket.on(WS_EVENTS.LOBBY_CHAT_HISTORY, handleHistory);
    set({ isConnected: true });

    // Return cleanup function
    return () => {
      socket.emit('lobby:chat:leave');
      socket.off(WS_EVENTS.LOBBY_CHAT_MESSAGE, handleMessage);
      socket.off(WS_EVENTS.LOBBY_CHAT_HISTORY, handleHistory);
      set({ isConnected: false, messages: [] });
    };
  },
}));
