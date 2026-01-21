import type { Server as SocketServer, Socket } from 'socket.io';
import { WS_EVENTS } from '@optcgsim/shared';
import type { GameManager } from './GameManager.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface QueueEntry {
  id: string;
  username: string;
  socketId: string;
  deckId: string;
  eloRating: number;
  joinedAt: Date;
}

export class QueueManager {
  private io: SocketServer;
  private gameManager: GameManager;
  private queue: Map<string, QueueEntry> = new Map();
  private matchmakingInterval: NodeJS.Timeout | null = null;

  constructor(io: SocketServer, gameManager: GameManager) {
    this.io = io;
    this.gameManager = gameManager;

    // Start matchmaking loop
    this.startMatchmaking();
  }

  joinQueue(
    socket: AuthenticatedSocket,
    deckId: string,
    callback: (response: { success: boolean; position?: number; error?: string }) => void
  ) {
    if (this.queue.has(socket.userId!)) {
      return callback({ success: false, error: 'Already in queue' });
    }

    // TODO: Validate deck exists and belongs to user
    // TODO: Get user's ELO rating from database

    const entry: QueueEntry = {
      id: socket.userId!,
      username: socket.username!,
      socketId: socket.id,
      deckId,
      eloRating: 1000, // TODO: Fetch from DB
      joinedAt: new Date(),
    };

    this.queue.set(socket.userId!, entry);

    // Send queue position
    callback({
      success: true,
      position: this.queue.size,
    });

    // Notify user of queue status
    socket.emit(WS_EVENTS.QUEUE_STATUS, {
      position: this.queue.size,
      estimatedWait: this.estimateWaitTime(),
    });
  }

  leaveQueue(socket: AuthenticatedSocket) {
    this.queue.delete(socket.userId!);
  }

  private startMatchmaking() {
    // Run matchmaking every 3 seconds
    this.matchmakingInterval = setInterval(() => {
      this.findMatches();
    }, 3000);
  }

  private findMatches() {
    if (this.queue.size < 2) return;

    const entries = Array.from(this.queue.values());

    // Sort by ELO for better matching
    entries.sort((a, b) => a.eloRating - b.eloRating);

    // Simple matching: pair adjacent players
    // In production, use more sophisticated rating-based matching
    while (entries.length >= 2) {
      const player1 = entries.shift()!;
      const player2 = entries.shift()!;

      // Check ELO difference (expand range over time)
      const waitTime1 = Date.now() - player1.joinedAt.getTime();
      const waitTime2 = Date.now() - player2.joinedAt.getTime();
      const maxWait = Math.max(waitTime1, waitTime2);

      // Expand ELO range: 100 base + 50 per 30 seconds waiting
      const eloRange = 100 + Math.floor(maxWait / 30000) * 50;

      if (Math.abs(player1.eloRating - player2.eloRating) <= eloRange) {
        this.createMatch(player1, player2);
      } else {
        // Put back in queue for next iteration
        entries.push(player1, player2);
        break;
      }
    }
  }

  private createMatch(player1: QueueEntry, player2: QueueEntry) {
    // Remove from queue
    this.queue.delete(player1.id);
    this.queue.delete(player2.id);

    // Get sockets
    const socket1 = this.io.sockets.sockets.get(player1.socketId);
    const socket2 = this.io.sockets.sockets.get(player2.socketId);

    if (!socket1 || !socket2) {
      // One player disconnected, put the other back
      if (socket1) this.queue.set(player1.id, player1);
      if (socket2) this.queue.set(player2.id, player2);
      return;
    }

    // Notify players they've been matched
    const matchData = {
      player1: { id: player1.id, username: player1.username },
      player2: { id: player2.id, username: player2.username },
    };

    socket1.emit(WS_EVENTS.QUEUE_MATCHED, matchData);
    socket2.emit(WS_EVENTS.QUEUE_MATCHED, matchData);

    // Create a lobby-like structure for the game manager
    const lobby = {
      id: `ranked-${Date.now()}`,
      players: [
        { id: player1.id, username: player1.username, socketId: player1.socketId },
        { id: player2.id, username: player2.username, socketId: player2.socketId },
      ],
      settings: {
        isRanked: true,
        timeLimit: 180,
        isPrivate: false,
      },
      hostId: player1.id,
    };

    // Start the game
    this.gameManager.startGame(lobby, socket1 as any);
  }

  private estimateWaitTime(): number {
    // Simple estimate based on queue size
    // In production, use historical data
    const queueSize = this.queue.size;
    if (queueSize <= 1) return 30; // 30 seconds if alone
    return Math.max(5, 30 - queueSize * 5); // Decrease with more players
  }

  destroy() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
  }
}
