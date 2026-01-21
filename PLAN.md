# OPTCGSim Web Browser Game Conversion Plan

## Executive Summary

Convert the Unity-based One Piece TCG Simulator into a full-featured web browser game with:
- **No download required** - play directly in browser
- **Full Dueling Nexus feature parity** - ranked, AI, replays, deck builder, social features
- **Admin tools** for adding new card sets without code changes
- **Managed cloud hosting** (Vercel + Railway + Supabase)
- **Modern stack**: React + TypeScript + Node.js + PostgreSQL

**7 Implementation Phases** covering foundation → gameplay → competitive → social → admin → advanced

---

## Project Overview

**Goal:** Convert the existing Unity-based One Piece Trading Card Game Simulator (OPTCGSim v1.35a) into a web-accessible browser game similar to [Dueling Nexus](https://duelingnexus.com).

**Current State:** Desktop Unity application with:
- Complete game logic for One Piece TCG
- 4,818 card images across 51 sets
- Multiplayer via Unity Relay/Lobbies
- Deck editor and AI opponent
- JSON-based game state serialization

**Target State:** Web application accessible via browser with:
- No download required
- Account system with persistent data
- Lobby/matchmaking system
- Deck builder with search/filters
- Ranked and casual play modes
- Extensible architecture for future features

---

## Architecture Decision: Hybrid Approach

### Recommended Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React + TypeScript | Component-based, great tooling, large ecosystem |
| **Game Engine** | Phaser 3 or PixiJS | 2D rendering, WebGL support, canvas fallback |
| **State Management** | Zustand or Redux Toolkit | Predictable game state, easy debugging |
| **Real-time Comms** | Socket.IO or WebSocket | Low-latency multiplayer |
| **Backend** | Node.js + Express/Fastify | Same language as frontend, good WebSocket support |
| **Database** | PostgreSQL + Redis | Relational for users/decks, Redis for sessions/matchmaking |
| **Auth** | JWT + OAuth (Google/Discord) | Standard, secure, social login support |
| **Hosting** | Vercel (frontend) + Railway/Render (backend) | Easy deployment, scalable |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  React App                                                      │
│  ├── Pages: Home, Lobby, DeckBuilder, Game, Profile, Leaderboard│
│  ├── Game Canvas (Phaser/PixiJS)                                │
│  ├── State Management (Zustand)                                 │
│  └── WebSocket Client                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / WSS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                              │
│  (Express/Fastify + Socket.IO)                                  │
├─────────────────────────────────────────────────────────────────┤
│  REST API                    │  WebSocket Server                │
│  ├── /auth/*                 │  ├── Lobby events                │
│  ├── /users/*                │  ├── Game state sync             │
│  ├── /decks/*                │  ├── Chat messages               │
│  ├── /cards/*                │  └── Matchmaking                 │
│  └── /matches/*              │                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   PostgreSQL     │ │    Redis     │ │   Game Server    │
│  ├── Users       │ │ ├── Sessions │ │ ├── Match rooms  │
│  ├── Decks       │ │ ├── Queue    │ │ ├── Game logic   │
│  ├── Cards       │ │ └── Cache    │ │ └── State mgmt   │
│  ├── Matches     │ └──────────────┘ └──────────────────┘
│  └── Stats       │
└──────────────────┘
```

---

## Project Structure

```
optcgsim-web/
├── packages/
│   ├── client/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── pages/          # Route pages
│   │   │   ├── game/           # Phaser game integration
│   │   │   ├── stores/         # Zustand state stores
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API/WebSocket clients
│   │   │   └── types/          # TypeScript types
│   │   └── public/
│   │       └── assets/         # Card images, playmats
│   │
│   ├── server/                 # Node.js backend
│   │   ├── src/
│   │   │   ├── api/            # REST routes
│   │   │   ├── game/           # Game logic (ported from Unity)
│   │   │   ├── websocket/      # Socket.IO handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── models/         # Database models
│   │   │   └── middleware/     # Auth, validation
│   │   └── prisma/             # Database schema
│   │
│   └── shared/                 # Shared types & game rules
│       ├── types/              # Game state interfaces
│       ├── rules/              # Card rules engine
│       └── constants/          # Card data, enums
│
├── tools/
│   └── card-importer/          # Import cards from Unity assets
│
└── docker-compose.yml          # Local dev environment
```

---

## Database Schema (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  username      String   @unique
  passwordHash  String?
  oauthProvider String?
  oauthId       String?
  eloRating     Int      @default(1000)
  gamesPlayed   Int      @default(0)
  gamesWon      Int      @default(0)
  createdAt     DateTime @default(now())

  decks         Deck[]
  matchesAsP1   Match[]  @relation("Player1")
  matchesAsP2   Match[]  @relation("Player2")
}

model Deck {
  id          String   @id @default(uuid())
  userId      String
  name        String
  leaderId    String
  cards       Json     // Array of {cardId, count}
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id])
}

model Card {
  id          String   @id // e.g., "OP01-001"
  setCode     String
  cardNumber  String
  name        String
  type        String   // LEADER, CHARACTER, EVENT, STAGE
  color       String[]
  cost        Int?
  power       Int?
  counter     Int?
  effects     Json
  imageUrl    String
}

model Match {
  id          String   @id @default(uuid())
  player1Id   String
  player2Id   String
  winnerId    String?
  gameLog     Json
  ranked      Boolean  @default(false)
  createdAt   DateTime @default(now())

  player1     User     @relation("Player1", fields: [player1Id], references: [id])
  player2     User     @relation("Player2", fields: [player2Id], references: [id])
}
```

---

## API Endpoints

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Login with email/password
- `POST /auth/oauth/:provider` - OAuth login
- `POST /auth/refresh` - Refresh JWT
- `POST /auth/logout` - Invalidate session

### Users
- `GET /users/me` - Current user profile
- `PATCH /users/me` - Update profile
- `GET /users/:id` - Public profile
- `GET /users/:id/stats` - Player statistics

### Decks
- `GET /decks` - List user's decks
- `POST /decks` - Create deck
- `GET /decks/:id` - Get deck
- `PATCH /decks/:id` - Update deck
- `DELETE /decks/:id` - Delete deck
- `GET /decks/public` - Browse public decks

### Cards
- `GET /cards` - Search cards (with filters)
- `GET /cards/:id` - Card details
- `GET /cards/sets` - List card sets

### Matches
- `GET /matches` - Match history
- `GET /matches/:id` - Match details/replay
- `GET /leaderboard` - Rankings

### WebSocket Events
- `lobby:create` / `lobby:join` / `lobby:leave`
- `queue:join` / `queue:leave` / `queue:matched`
- `game:action` / `game:state` / `game:chat`
- `game:surrender` / `game:reconnect`

---

## Confirmed Requirements

| Decision | Choice |
|----------|--------|
| **Launch Scope** | Full Feature Parity with Dueling Nexus |
| **Card Data** | Extract from Unity initially; admin upload system for future sets |
| **Authentication** | Email/Password + OAuth (Discord/Google) |
| **Hosting** | Managed services (Vercel, Railway, etc.) |

---

## Recommended Managed Services Stack

| Service | Provider | Purpose | Est. Cost |
|---------|----------|---------|-----------|
| Frontend Hosting | Vercel | React app, CDN | Free tier / $20/mo |
| Backend API | Railway | Node.js server | ~$5-20/mo |
| Database | Supabase or PlanetScale | PostgreSQL | Free tier / $25/mo |
| Redis Cache | Upstash | Sessions, queues | Free tier / $10/mo |
| Image CDN | Cloudflare R2 | Card images | ~$5/mo for 5GB |
| Auth | Built-in + OAuth | JWT + Discord/Google | Free |

**Estimated Monthly Cost:** $20-80/mo depending on traffic
