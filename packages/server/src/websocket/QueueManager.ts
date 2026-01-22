import type { Server as SocketServer, Socket } from 'socket.io';
import { WS_EVENTS } from '@optcgsim/shared';
import type { GameManager } from './GameManager.js';
import { prisma } from '../services/prisma.js';
import { canMatch } from '../services/EloService.js';

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

  async joinQueue(
    socket: AuthenticatedSocket,
    deckId: string,
    callback: (response: { success: boolean; position?: number; error?: string }) => void
  ) {
    if (this.queue.has(socket.userId!)) {
      return callback({ success: false, error: 'Already in queue' });
    }

    try {
      // Validate deck exists and belongs to user
      const deck = await prisma.deck.findFirst({
        where: {
          id: deckId,
          userId: socket.userId!,
        },
      });

      if (!deck) {
        return callback({ success: false, error: 'Invalid deck' });
      }

      // Get user's ELO rating from database
      const user = await prisma.user.findUnique({
        where: { id: socket.userId! },
        select: { eloRating: true, gamesPlayed: true },
      });

      if (!user) {
        return callback({ success: false, error: 'User not found' });
      }

      const entry: QueueEntry = {
        id: socket.userId!,
        username: socket.username!,
        socketId: socket.id,
        deckId,
        eloRating: user.eloRating,
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
    } catch (error) {
      console.error('Error joining queue:', error);
      callback({ success: false, error: 'Failed to join queue' });
    }
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
    const matched = new Set<string>();

    // Sort by ELO for better matching
    entries.sort((a, b) => a.eloRating - b.eloRating);

    // Find best matches based on ELO and queue time
    for (let i = 0; i < entries.length; i++) {
      if (matched.has(entries[i].id)) continue;

      const player1 = entries[i];
      const waitTime1 = (Date.now() - player1.joinedAt.getTime()) / 1000;

      // Find best match for this player
      let bestMatch: QueueEntry | null = null;
      let bestMatchScore = Infinity;

      for (let j = i + 1; j < entries.length; j++) {
        if (matched.has(entries[j].id)) continue;

        const player2 = entries[j];
        const waitTime2 = (Date.now() - player2.joinedAt.getTime()) / 1000;
        const maxWaitTime = Math.max(waitTime1, waitTime2);

        // Check if players can be matched based on ELO and wait time
        if (canMatch(player1.eloRating, player2.eloRating, maxWaitTime)) {
          // Score based on ELO difference (lower is better)
          const score = Math.abs(player1.eloRating - player2.eloRating);
          if (score < bestMatchScore) {
            bestMatch = player2;
            bestMatchScore = score;
          }
        }
      }

      if (bestMatch) {
        matched.add(player1.id);
        matched.add(bestMatch.id);
        this.createMatch(player1, bestMatch);
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
      player1: { id: player1.id, username: player1.username, eloRating: player1.eloRating },
      player2: { id: player2.id, username: player2.username, eloRating: player2.eloRating },
    };

    socket1.emit(WS_EVENTS.QUEUE_MATCHED, matchData);
    socket2.emit(WS_EVENTS.QUEUE_MATCHED, matchData);

    // Create a lobby-like structure for the game manager
    const lobby = {
      id: `ranked-${Date.now()}`,
      players: [
        {
          id: player1.id,
          username: player1.username,
          socketId: player1.socketId,
          deckId: player1.deckId,
          eloRating: player1.eloRating,
        },
        {
          id: player2.id,
          username: player2.username,
          socketId: player2.socketId,
          deckId: player2.deckId,
          eloRating: player2.eloRating,
        },
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
