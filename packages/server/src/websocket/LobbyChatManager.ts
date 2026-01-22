import type { Server as SocketServer, Socket } from 'socket.io';
import { WS_EVENTS } from '@optcgsim/shared';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export class LobbyChatManager {
  private io: SocketServer;
  private messageHistory: ChatMessage[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly LOBBY_ROOM = 'lobby:global';

  constructor(io: SocketServer) {
    this.io = io;
  }

  joinLobbyChat(socket: AuthenticatedSocket) {
    socket.join(this.LOBBY_ROOM);

    // Send recent message history to the newly joined user
    if (this.messageHistory.length > 0) {
      socket.emit(WS_EVENTS.LOBBY_CHAT_HISTORY, {
        messages: this.messageHistory,
      });
    }

    // Announce user joined (optional - can be commented out if too noisy)
    // this.addSystemMessage(`${socket.username} joined the lobby`);
  }

  leaveLobbyChat(socket: AuthenticatedSocket) {
    socket.leave(this.LOBBY_ROOM);
  }

  handleMessage(socket: AuthenticatedSocket, message: string) {
    if (!socket.userId || !socket.username) return;
    if (!message || typeof message !== 'string') return;

    // Sanitize and limit message length
    const sanitizedMessage = message.trim().slice(0, 200);
    if (!sanitizedMessage) return;

    const chatMessage: ChatMessage = {
      id: `${socket.userId}-${Date.now()}`,
      senderId: socket.userId,
      senderUsername: socket.username,
      message: sanitizedMessage,
      timestamp: Date.now(),
      isSystem: false,
    };

    // Add to history
    this.messageHistory.push(chatMessage);
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory.shift();
    }

    // Broadcast to all users in lobby chat
    this.io.to(this.LOBBY_ROOM).emit(WS_EVENTS.LOBBY_CHAT_MESSAGE, chatMessage);
  }

  addSystemMessage(message: string) {
    const chatMessage: ChatMessage = {
      id: `system-${Date.now()}`,
      senderId: 'system',
      senderUsername: 'System',
      message,
      timestamp: Date.now(),
      isSystem: true,
    };

    this.messageHistory.push(chatMessage);
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory.shift();
    }

    this.io.to(this.LOBBY_ROOM).emit(WS_EVENTS.LOBBY_CHAT_MESSAGE, chatMessage);
  }

  getOnlineCount(): number {
    const room = this.io.sockets.adapter.rooms.get(this.LOBBY_ROOM);
    return room ? room.size : 0;
  }
}
