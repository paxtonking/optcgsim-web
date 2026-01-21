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

interface LobbyData extends Lobby {
  players: LobbyPlayer[];
}

export class LobbyManager {
  private io: SocketServer;
  private lobbies: Map<string, LobbyData> = new Map();
  private playerToLobby: Map<string, string> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
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
}
