import { useAuthStore } from '../stores/authStore';

const API_URL = '/api';

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
    const { accessToken, refreshAuth } = useAuthStore.getState();

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

    // Handle token refresh on 401
    if (response.status === 401 && accessToken) {
      await refreshAuth();
      const newToken = useAuthStore.getState().accessToken;

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
