import type { Server as SocketServer, Socket } from 'socket.io';
import { prisma } from '../services/prisma.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

export class PresenceManager {
  private io: SocketServer;
  private onlineUsers: Map<string, { socketId: string; username: string; connectedAt: Date }> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
  }

  async userConnected(socket: AuthenticatedSocket) {
    if (!socket.userId) return;

    const wasOnline = this.onlineUsers.has(socket.userId);

    this.onlineUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username || 'Unknown',
      connectedAt: new Date(),
    });

    // If user wasn't online before, notify their friends
    if (!wasOnline) {
      await this.notifyFriendsOfStatusChange(socket.userId, true);
    }
  }

  async userDisconnected(socket: AuthenticatedSocket) {
    if (!socket.userId) return;

    this.onlineUsers.delete(socket.userId);

    // Notify friends that user went offline
    await this.notifyFriendsOfStatusChange(socket.userId, false);
  }

  private async notifyFriendsOfStatusChange(userId: string, isOnline: boolean) {
    try {
      // Use 'as any' until Prisma client is regenerated
      const db = prisma as any;

      // Get all accepted friendships where this user is involved
      const friendships = await db.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: userId },
            { receiverId: userId },
          ],
        },
        select: {
          senderId: true,
          receiverId: true,
        },
      });

      // Get friend IDs
      const friendIds = friendships.map((f: { senderId: string; receiverId: string }) =>
        f.senderId === userId ? f.receiverId : f.senderId
      );

      // Notify each online friend
      for (const friendId of friendIds) {
        const friendConnection = this.onlineUsers.get(friendId);
        if (friendConnection) {
          this.io.to(friendConnection.socketId).emit('presence:update', {
            userId,
            isOnline,
          });
        }
      }
    } catch (error) {
      console.error('Failed to notify friends of status change:', error);
    }
  }

  isOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  getOnlineStatus(userIds: string[]): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const userId of userIds) {
      status.set(userId, this.onlineUsers.has(userId));
    }
    return status;
  }

  // Get all online friends for a user
  async getOnlineFriends(userId: string): Promise<string[]> {
    try {
      const db = prisma as any;

      const friendships = await db.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: userId },
            { receiverId: userId },
          ],
        },
        select: {
          senderId: true,
          receiverId: true,
        },
      });

      const friendIds = friendships.map((f: { senderId: string; receiverId: string }) =>
        f.senderId === userId ? f.receiverId : f.senderId
      );

      return friendIds.filter((id: string) => this.onlineUsers.has(id));
    } catch (error) {
      console.error('Failed to get online friends:', error);
      return [];
    }
  }
}
