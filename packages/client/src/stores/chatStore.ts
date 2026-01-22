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

interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;

  // Actions
  sendMessage: (message: string) => void;
  addMessage: (message: ChatMessage) => void;
  addSystemMessage: (message: string) => void;
  clearMessages: () => void;
  setupChatListeners: () => () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isConnected: false,

  sendMessage: (message: string) => {
    if (!message.trim()) return;

    const socket = connectSocket();
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

    const handleChatMessage = (data: {
      senderId: string;
      senderUsername: string;
      message: string;
      timestamp: number;
    }) => {
      const chatMessage: ChatMessage = {
        id: `${data.senderId}-${data.timestamp}`,
        senderId: data.senderId,
        senderUsername: data.senderUsername,
        message: data.message,
        timestamp: data.timestamp,
        isSystem: false,
      };
      get().addMessage(chatMessage);
    };

    socket.on(WS_EVENTS.GAME_CHAT, handleChatMessage);
    set({ isConnected: true });

    // Return cleanup function
    return () => {
      socket.off(WS_EVENTS.GAME_CHAT, handleChatMessage);
      set({ isConnected: false });
    };
  },
}));
