import { create } from 'zustand';
import { connectSocket } from '../services/socket';
import { WS_EVENTS } from '@optcgsim/shared';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

interface BaseChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  sendMessage: (message: string) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
}

interface GameChatState extends BaseChatState {
  addSystemMessage: (message: string) => void;
  setupChatListeners: () => () => void;
}

interface LobbyChatState extends BaseChatState {
  joinLobbyChat: () => () => void;
}

// Game chat store (in-game chat)
export const useChatStore = create<GameChatState>((set, get) => ({
  messages: [],
  isConnected: false,

  sendMessage: (message: string) => {
    if (!message.trim()) return;
    const socket = connectSocket();
    console.log('[ChatStore] Sending message:', message.trim());
    socket.emit(WS_EVENTS.GAME_CHAT, message.trim());
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages.slice(-99), message], // Keep last 100 messages
    }));
  },

  addSystemMessage: (message: string) => {
    const systemMessage: ChatMessage = {
      id: `system-${Date.now()}`,
      senderId: 'system',
      senderUsername: 'System',
      message,
      timestamp: Date.now(),
      isSystem: true,
    };
    get().addMessage(systemMessage);
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  setupChatListeners: () => {
    const socket = connectSocket();
    console.log('[ChatStore] Setting up chat listeners');

    const handleChatMessage = (data: {
      senderId: string;
      senderUsername: string;
      message: string;
      timestamp: number;
    }) => {
      console.log('[ChatStore] Received chat message:', data);
      const chatMessage: ChatMessage = {
        id: `${data.senderId}-${data.timestamp}`,
        senderId: data.senderId,
        senderUsername: data.senderUsername,
        message: data.message,
        timestamp: data.timestamp,
        isSystem: false,
      };
      get().addMessage(chatMessage);
      console.log('[ChatStore] Message added, total messages:', get().messages.length);
    };

    socket.on(WS_EVENTS.GAME_CHAT, handleChatMessage);
    set({ isConnected: true });
    console.log('[ChatStore] Chat listeners active');

    return () => {
      console.log('[ChatStore] Cleaning up chat listeners');
      socket.off(WS_EVENTS.GAME_CHAT, handleChatMessage);
      set({ isConnected: false });
    };
  },
}));

// Lobby chat store (lobby chat)
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

    return () => {
      socket.emit('lobby:chat:leave');
      socket.off(WS_EVENTS.LOBBY_CHAT_MESSAGE, handleMessage);
      socket.off(WS_EVENTS.LOBBY_CHAT_HISTORY, handleHistory);
      set({ isConnected: false, messages: [] });
    };
  },
}));
