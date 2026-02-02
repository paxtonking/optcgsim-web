import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = useAuthStore.getState().refreshAuth()
      .then(() => useAuthStore.getState().accessToken)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<{ data: T }> {
    const url = `${this.baseUrl}${path}`;
    const { accessToken } = useAuthStore.getState();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    // Handle token refresh on 401 (except refresh endpoint itself).
    const shouldAttemptRefresh = (
      response.status === 401
      && accessToken
      && path !== '/auth/refresh'
    );
    if (shouldAttemptRefresh) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
        });
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw { response: { data: error, status: response.status } };
    }

    const responseData = await response.json();
    return { data: responseData };
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, data?: unknown) {
    return this.request<T>('POST', path, data);
  }

  patch<T>(path: string, data?: unknown) {
    return this.request<T>('PATCH', path, data);
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export const api = new ApiClient(API_URL);
