import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@optcgsim/shared';
import { api } from '../services/api';
import { useDeckStore } from './deckStore';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginAsGuest: (username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

let refreshInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>('/auth/login', { email, password });
          const { user, accessToken, refreshToken } = response.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          // Sync decks with server after login (don't await to not block UI)
          useDeckStore.getState().syncDecksWithServer().catch(err => {
            console.error('[AuthStore] Failed to sync decks after login:', err);
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{
            user: User;
            accessToken: string;
            refreshToken: string;
          }>('/auth/register', {
            email,
            username,
            password,
          });
          const { user, accessToken, refreshToken } = response.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          // Sync decks with server after registration (don't await to not block UI)
          useDeckStore.getState().syncDecksWithServer().catch(err => {
            console.error('[AuthStore] Failed to sync decks after registration:', err);
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      loginAsGuest: async (username?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{
            user: User;
            accessToken: string;
          }>('/auth/guest', { username });
          const { user, accessToken } = response.data;

          set({
            user,
            accessToken,
            refreshToken: null, // Guests don't get refresh tokens
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Guest login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        const { refreshToken, user } = get();
        // Only call logout API for registered users
        if (refreshToken && !user?.isGuest) {
          try {
            await api.post('/auth/logout', { refreshToken });
          } catch {
            // Ignore errors on logout
          }
        }

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      refreshAuth: async () => {
        if (refreshInFlight) {
          return refreshInFlight;
        }

        const { refreshToken, user } = get();
        // Guests don't have refresh tokens
        if (!refreshToken || user?.isGuest) return;

        refreshInFlight = (async () => {
          try {
            const response = await api.post<{
              accessToken: string;
              refreshToken: string;
            }>('/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response.data;

            set({
              accessToken,
              refreshToken: newRefreshToken,
            });
          } catch (error: any) {
            const status = error?.response?.status;
            // Only force logout on explicit auth failures.
            if (status === 401 || status === 403) {
              set({
                user: null,
                accessToken: null,
                refreshToken: null,
                isAuthenticated: false,
              });
            }
            throw error;
          } finally {
            refreshInFlight = null;
          }
        })();

        return refreshInFlight;
      },

      clearError: () => set({ error: null }),
      setHasHydrated: (hasHydrated: boolean) => set({ hasHydrated }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
