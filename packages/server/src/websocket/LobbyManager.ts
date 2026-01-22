import type { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { WS_EVENTS } from '@optcgsim/shared';
import type { Lobby, LobbySettings } from '@optcgsim/shared';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface LobbyPlayer {
  id: string;
  username: string;
  socketId: string;
  deckId?: string;
  ready: boolean;
}

interface Challenge {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromSocketId: string;
  toUserId: string;
  deckId?: string;
  createdAt: Date;
}

interface LobbyData extends Lobby {
  players: LobbyPlayer[];
}

export class LobbyManager {
  private io: SocketServer;
  private lobbies: Map<string, LobbyData> = new Map();
  private playerToLobby: Map<string, string> = new Map();
  private challenges: Map<string, Challenge> = new Map(); // challengeId -> Challenge
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  constructor(io: SocketServer) {
    this.io = io;
  }

  registerUserSocket(userId: string, socketId: string) {
    this.userSockets.set(userId, socketId);
  }

  unregisterUserSocket(userId: string) {
    this.userSockets.delete(userId);
    // Cancel any pending challenges from/to this user
    this.cancelUserChallenges(userId);
  }

  private cancelUserChallenges(userId: string) {
    for (const [challengeId, challenge] of this.challenges) {
      if (challenge.fromUserId === userId || challenge.toUserId === userId) {
        this.challenges.delete(challengeId);
        // Notify the other party
        const otherUserId = challenge.fromUserId === userId ? challenge.toUserId : challenge.fromUserId;
        const otherSocketId = this.userSockets.get(otherUserId);
        if (otherSocketId) {
          this.io.to(otherSocketId).emit(WS_EVENTS.CHALLENGE_CANCELLED, {
            challengeId,
            reason: 'User disconnected',
          });
        }
      }
    }
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  createLobby(
    socket: AuthenticatedSocket,
    settings: Partial<LobbySettings>,
    callback: (response: { success: boolean; lobby?: LobbyData; error?: string }) => void
  ) {
    // Check if already in a lobby
    if (this.playerToLobby.has(socket.userId!)) {
      return callback({ success: false, error: 'Already in a lobby' });
    }

    const lobbyId = uuidv4();
    const code = this.generateCode();

    const lobby: LobbyData = {
      id: lobbyId,
      code,
      hostId: socket.userId!,
      guestId: null,
      settings: {
        isRanked: settings.isRanked ?? false,
        timeLimit: settings.timeLimit ?? 180,
        isPrivate: settings.isPrivate ?? true,
      },
      status: 'WAITING',
      createdAt: new Date(),
      players: [
        {
          id: socket.userId!,
          username: socket.username!,
          socketId: socket.id,
          ready: false,
        },
      ],
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(socket.userId!, lobbyId);

    socket.join(`lobby:${lobbyId}`);

    callback({ success: true, lobby });
  }

  joinLobby(
    socket: AuthenticatedSocket,
    code: string,
    callback: (response: { success: boolean; lobby?: LobbyData; error?: string }) => void
  ) {
    // Check if already in a lobby
    if (this.playerToLobby.has(socket.userId!)) {
      return callback({ success: false, error: 'Already in a lobby' });
    }

    // Find lobby by code
    let targetLobby: LobbyData | undefined;
    for (const lobby of this.lobbies.values()) {
      if (lobby.code === code.toUpperCase()) {
        targetLobby = lobby;
        break;
      }
    }

    if (!targetLobby) {
      return callback({ success: false, error: 'Lobby not found' });
    }

    if (targetLobby.players.length >= 2) {
      return callback({ success: false, error: 'Lobby is full' });
    }

    if (targetLobby.status !== 'WAITING') {
      return callback({ success: false, error: 'Game already started' });
    }

    // Add player
    targetLobby.players.push({
      id: socket.userId!,
      username: socket.username!,
      socketId: socket.id,
      ready: false,
    });
    targetLobby.guestId = socket.userId!;

    this.playerToLobby.set(socket.userId!, targetLobby.id);
    socket.join(`lobby:${targetLobby.id}`);

    // Notify all players
    this.io.to(`lobby:${targetLobby.id}`).emit(WS_EVENTS.LOBBY_UPDATE, targetLobby);

    callback({ success: true, lobby: targetLobby });
  }

  leaveLobby(socket: AuthenticatedSocket) {
    const lobbyId = this.playerToLobby.get(socket.userId!);
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    // Remove player
    lobby.players = lobby.players.filter(p => p.id !== socket.userId);
    this.playerToLobby.delete(socket.userId!);
    socket.leave(`lobby:${lobbyId}`);

    if (lobby.players.length === 0) {
      // Delete empty lobby
      this.lobbies.delete(lobbyId);
    } else {
      // If host left, assign new host
      if (lobby.hostId === socket.userId) {
        lobby.hostId = lobby.players[0].id;
      }
      lobby.guestId = null;
      lobby.status = 'WAITING';

      // Notify remaining players
      this.io.to(`lobby:${lobbyId}`).emit(WS_EVENTS.LOBBY_UPDATE, lobby);
    }
  }

  setReady(socket: AuthenticatedSocket) {
    const lobbyId = this.playerToLobby.get(socket.userId!);
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === socket.userId);
    if (player) {
      player.ready = !player.ready;
    }

    // Check if all players ready
    if (lobby.players.length === 2 && lobby.players.every(p => p.ready)) {
      lobby.status = 'READY';
    } else {
      lobby.status = 'WAITING';
    }

    this.io.to(`lobby:${lobbyId}`).emit(WS_EVENTS.LOBBY_UPDATE, lobby);
  }

  getLobbyByPlayer(userId: string): LobbyData | undefined {
    const lobbyId = this.playerToLobby.get(userId);
    if (!lobbyId) return undefined;
    return this.lobbies.get(lobbyId);
  }

  handleDisconnect(socket: AuthenticatedSocket) {
    this.leaveLobby(socket);
  }

  removeLobby(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      for (const player of lobby.players) {
        this.playerToLobby.delete(player.id);
      }
      this.lobbies.delete(lobbyId);
    }
  }

  // Challenge methods
  sendChallenge(
    socket: AuthenticatedSocket,
    data: { toUserId: string; deckId?: string },
    callback: (response: { success: boolean; challengeId?: string; error?: string }) => void
  ) {
    const { toUserId, deckId } = data;

    // Check if sender is already in a lobby
    if (this.playerToLobby.has(socket.userId!)) {
      return callback({ success: false, error: 'Already in a lobby' });
    }

    // Check if target is online
    const targetSocketId = this.userSockets.get(toUserId);
    if (!targetSocketId) {
      return callback({ success: false, error: 'User is not online' });
    }

    // Check if target is already in a lobby
    if (this.playerToLobby.has(toUserId)) {
      return callback({ success: false, error: 'User is in a game' });
    }

    // Check for existing challenge between these users
    for (const challenge of this.challenges.values()) {
      if (
        (challenge.fromUserId === socket.userId && challenge.toUserId === toUserId) ||
        (challenge.fromUserId === toUserId && challenge.toUserId === socket.userId)
      ) {
        return callback({ success: false, error: 'Challenge already pending' });
      }
    }

    const challengeId = uuidv4();
    const challenge: Challenge = {
      id: challengeId,
      fromUserId: socket.userId!,
      fromUsername: socket.username!,
      fromSocketId: socket.id,
      toUserId,
      deckId,
      createdAt: new Date(),
    };

    this.challenges.set(challengeId, challenge);

    // Notify target user
    this.io.to(targetSocketId).emit(WS_EVENTS.CHALLENGE_RECEIVED, {
      challengeId,
      fromUserId: socket.userId,
      fromUsername: socket.username,
    });

    // Auto-expire challenge after 60 seconds
    setTimeout(() => {
      if (this.challenges.has(challengeId)) {
        this.challenges.delete(challengeId);
        // Notify both parties
        socket.emit(WS_EVENTS.CHALLENGE_CANCELLED, {
          challengeId,
          reason: 'Challenge expired',
        });
        this.io.to(targetSocketId).emit(WS_EVENTS.CHALLENGE_CANCELLED, {
          challengeId,
          reason: 'Challenge expired',
        });
      }
    }, 60000);

    callback({ success: true, challengeId });
  }

  acceptChallenge(
    socket: AuthenticatedSocket,
    data: { challengeId: string; deckId?: string },
    callback: (response: { success: boolean; lobby?: LobbyData; error?: string }) => void
  ) {
    const { challengeId, deckId } = data;
    const challenge = this.challenges.get(challengeId);

    if (!challenge) {
      return callback({ success: false, error: 'Challenge not found or expired' });
    }

    if (challenge.toUserId !== socket.userId) {
      return callback({ success: false, error: 'Not authorized to accept this challenge' });
    }

    // Check if challenger is still available
    const challengerSocketId = this.userSockets.get(challenge.fromUserId);
    if (!challengerSocketId || this.playerToLobby.has(challenge.fromUserId)) {
      this.challenges.delete(challengeId);
      return callback({ success: false, error: 'Challenger is no longer available' });
    }

    // Remove the challenge
    this.challenges.delete(challengeId);

    // Create a lobby with both players
    const lobbyId = uuidv4();
    const code = this.generateCode();

    const lobby: LobbyData = {
      id: lobbyId,
      code,
      hostId: challenge.fromUserId,
      guestId: socket.userId!,
      settings: {
        isRanked: false,
        timeLimit: 180,
        isPrivate: true,
      },
      status: 'WAITING',
      createdAt: new Date(),
      players: [
        {
          id: challenge.fromUserId,
          username: challenge.fromUsername,
          socketId: challengerSocketId,
          deckId: challenge.deckId,
          ready: false,
        },
        {
          id: socket.userId!,
          username: socket.username!,
          socketId: socket.id,
          deckId,
          ready: false,
        },
      ],
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(challenge.fromUserId, lobbyId);
    this.playerToLobby.set(socket.userId!, lobbyId);

    // Join both sockets to the lobby room
    const challengerSocket = this.io.sockets.sockets.get(challengerSocketId);
    challengerSocket?.join(`lobby:${lobbyId}`);
    socket.join(`lobby:${lobbyId}`);

    // Notify both players
    this.io.to(`lobby:${lobbyId}`).emit(WS_EVENTS.LOBBY_UPDATE, lobby);

    callback({ success: true, lobby });
  }

  declineChallenge(
    socket: AuthenticatedSocket,
    data: { challengeId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) {
    const { challengeId } = data;
    const challenge = this.challenges.get(challengeId);

    if (!challenge) {
      return callback({ success: false, error: 'Challenge not found or expired' });
    }

    if (challenge.toUserId !== socket.userId) {
      return callback({ success: false, error: 'Not authorized to decline this challenge' });
    }

    // Remove the challenge
    this.challenges.delete(challengeId);

    // Notify the challenger
    const challengerSocketId = this.userSockets.get(challenge.fromUserId);
    if (challengerSocketId) {
      this.io.to(challengerSocketId).emit(WS_EVENTS.CHALLENGE_CANCELLED, {
        challengeId,
        reason: 'Challenge declined',
      });
    }

    callback({ success: true });
  }

  cancelChallenge(
    socket: AuthenticatedSocket,
    data: { challengeId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) {
    const { challengeId } = data;
    const challenge = this.challenges.get(challengeId);

    if (!challenge) {
      return callback({ success: false, error: 'Challenge not found' });
    }

    if (challenge.fromUserId !== socket.userId) {
      return callback({ success: false, error: 'Not authorized to cancel this challenge' });
    }

    // Remove the challenge
    this.challenges.delete(challengeId);

    // Notify the target
    const targetSocketId = this.userSockets.get(challenge.toUserId);
    if (targetSocketId) {
      this.io.to(targetSocketId).emit(WS_EVENTS.CHALLENGE_CANCELLED, {
        challengeId,
        reason: 'Challenge cancelled',
      });
    }

    callback({ success: true });
  }
}
