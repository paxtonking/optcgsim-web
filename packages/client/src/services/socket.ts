import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const WS_URL = import.meta.env.VITE_WS_URL || '/';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const { accessToken } = useAuthStore.getState();

    socket = io(WS_URL, {
      auth: { token: accessToken },
      autoConnect: false,
    });
  }

  return socket;
}

export { socket };

export function connectSocket(): Socket {
  const sock = getSocket();
  const { accessToken } = useAuthStore.getState();

  // Update auth token
  sock.auth = { token: accessToken };

  if (!sock.connected) {
    sock.connect();
  }

  return sock;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

// Event listeners with proper typing
export function onSocketEvent<T>(event: string, callback: (data: T) => void) {
  const sock = getSocket();
  sock.on(event, callback);
  return () => sock.off(event, callback);
}

export function emitSocketEvent<T>(
  event: string,
  data?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    sock.emit(event, data, (response: { success: boolean; error?: string } & T) => {
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error || 'Unknown error'));
      }
    });
  });
}

// Singleton service wrapper for easier usage
export const socketService = {
  connect: connectSocket,
  disconnect: disconnectSocket,
  emit: (event: string, data?: unknown, callback?: (response: any) => void) => {
    const sock = getSocket();
    if (callback) {
      sock.emit(event, data, callback);
    } else {
      sock.emit(event, data);
    }
  },
  on: <T = unknown>(event: string, callback: (data: T) => void) => {
    return onSocketEvent<T>(event, callback);
  },
  off: (event: string) => {
    const sock = getSocket();
    sock.off(event);
  },
};
