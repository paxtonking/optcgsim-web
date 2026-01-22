import { create } from 'zustand';
import { api } from '../services/api';
import { connectSocket } from '../services/socket';
import { WS_EVENTS } from '@optcgsim/shared';

// Response types for API calls
interface FriendsResponse {
  friends: Friend[];
}

interface SendRequestResponse {
  message: string;
  friendship: unknown;
  autoAccepted?: boolean;
}

interface SearchResponse {
  users: { id: string; username: string; eloRating: number; isFriend: boolean; isPending: boolean }[];
}

interface Friend {
  id: string;
  friendId: string;
  username: string;
  eloRating: number;
  since: string;
  isOnline?: boolean;
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  eloRating: number;
  sentAt: string;
}

interface SentRequest {
  id: string;
  toUserId: string;
  toUsername: string;
  eloRating: number;
  sentAt: string;
}

interface Challenge {
  challengeId: string;
  fromUserId: string;
  fromUsername: string;
}

interface FriendsState {
  friends: Friend[];
  pendingRequests: FriendRequest[];
  sentRequests: SentRequest[];
  pendingChallenge: Challenge | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadFriends: () => Promise<void>;
  loadRequests: () => Promise<void>;
  sendFriendRequest: (username: string) => Promise<{ success: boolean; error?: string; autoAccepted?: boolean }>;
  acceptRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  rejectRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  cancelRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  removeFriend: (friendId: string) => Promise<{ success: boolean; error?: string }>;
  searchUsers: (query: string) => Promise<{ id: string; username: string; eloRating: number; isFriend: boolean; isPending: boolean }[]>;

  // Challenge actions
  sendChallenge: (toUserId: string, deckId?: string) => Promise<{ success: boolean; challengeId?: string; error?: string }>;
  acceptChallenge: (challengeId: string, deckId?: string) => Promise<{ success: boolean; error?: string }>;
  declineChallenge: (challengeId: string) => Promise<{ success: boolean; error?: string }>;
  clearPendingChallenge: () => void;

  // Socket setup
  setupChallengeListeners: () => () => void;
  setupPresenceListeners: () => () => void;
  updateFriendOnlineStatus: (userId: string, isOnline: boolean) => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  pendingChallenge: null,
  isLoading: false,
  error: null,

  loadFriends: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<FriendsResponse>('/friends');
      set({ friends: response.data.friends, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to load friends', isLoading: false });
    }
  },

  loadRequests: async () => {
    try {
      const [pendingRes, sentRes] = await Promise.all([
        api.get<{ requests: FriendRequest[] }>('/friends/requests'),
        api.get<{ requests: SentRequest[] }>('/friends/requests/sent'),
      ]);
      set({
        pendingRequests: pendingRes.data.requests,
        sentRequests: sentRes.data.requests,
      });
    } catch (error: any) {
      console.error('Failed to load friend requests:', error);
    }
  },

  sendFriendRequest: async (username: string) => {
    try {
      const response = await api.post<SendRequestResponse>('/friends/request', { username });
      // Reload requests to update the UI
      get().loadRequests();
      if (response.data.autoAccepted) {
        get().loadFriends();
      }
      return { success: true, autoAccepted: response.data.autoAccepted };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Failed to send request' };
    }
  },

  acceptRequest: async (requestId: string) => {
    try {
      await api.post(`/friends/request/${requestId}/accept`);
      // Reload both friends and requests
      get().loadFriends();
      get().loadRequests();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Failed to accept request' };
    }
  },

  rejectRequest: async (requestId: string) => {
    try {
      await api.post(`/friends/request/${requestId}/reject`);
      get().loadRequests();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Failed to reject request' };
    }
  },

  cancelRequest: async (requestId: string) => {
    try {
      await api.delete(`/friends/request/${requestId}`);
      get().loadRequests();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Failed to cancel request' };
    }
  },

  removeFriend: async (friendId: string) => {
    try {
      await api.delete(`/friends/${friendId}`);
      set((state) => ({
        friends: state.friends.filter((f) => f.friendId !== friendId),
      }));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Failed to remove friend' };
    }
  },

  searchUsers: async (query: string) => {
    try {
      const response = await api.get<SearchResponse>(`/friends/search?q=${encodeURIComponent(query)}`);
      return response.data.users;
    } catch (error) {
      return [];
    }
  },

  sendChallenge: async (toUserId: string, deckId?: string) => {
    return new Promise((resolve) => {
      const socket = connectSocket();
      socket.emit(WS_EVENTS.CHALLENGE_SEND, { toUserId, deckId }, (response: { success: boolean; challengeId?: string; error?: string }) => {
        resolve(response);
      });
    });
  },

  acceptChallenge: async (challengeId: string, deckId?: string) => {
    return new Promise((resolve) => {
      const socket = connectSocket();
      socket.emit(WS_EVENTS.CHALLENGE_ACCEPT, { challengeId, deckId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          set({ pendingChallenge: null });
        }
        resolve(response);
      });
    });
  },

  declineChallenge: async (challengeId: string) => {
    return new Promise((resolve) => {
      const socket = connectSocket();
      socket.emit(WS_EVENTS.CHALLENGE_DECLINE, { challengeId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          set({ pendingChallenge: null });
        }
        resolve(response);
      });
    });
  },

  clearPendingChallenge: () => {
    set({ pendingChallenge: null });
  },

  setupChallengeListeners: () => {
    const socket = connectSocket();

    const handleChallengeReceived = (data: Challenge) => {
      set({ pendingChallenge: data });
    };

    const handleChallengeCancelled = () => {
      set({ pendingChallenge: null });
    };

    socket.on(WS_EVENTS.CHALLENGE_RECEIVED, handleChallengeReceived);
    socket.on(WS_EVENTS.CHALLENGE_CANCELLED, handleChallengeCancelled);

    // Return cleanup function
    return () => {
      socket.off(WS_EVENTS.CHALLENGE_RECEIVED, handleChallengeReceived);
      socket.off(WS_EVENTS.CHALLENGE_CANCELLED, handleChallengeCancelled);
    };
  },

  setupPresenceListeners: () => {
    const socket = connectSocket();

    const handlePresenceUpdate = (data: { userId: string; isOnline: boolean }) => {
      get().updateFriendOnlineStatus(data.userId, data.isOnline);
    };

    socket.on('presence:update', handlePresenceUpdate);

    // Request initial online friends list
    socket.emit('presence:getOnlineFriends', (response: { success: boolean; onlineFriends?: string[] }) => {
      if (response.success && response.onlineFriends) {
        for (const userId of response.onlineFriends) {
          get().updateFriendOnlineStatus(userId, true);
        }
      }
    });

    // Return cleanup function
    return () => {
      socket.off('presence:update', handlePresenceUpdate);
    };
  },

  updateFriendOnlineStatus: (userId: string, isOnline: boolean) => {
    set((state) => ({
      friends: state.friends.map((friend) =>
        friend.friendId === userId ? { ...friend, isOnline } : friend
      ),
    }));
  },
}));
