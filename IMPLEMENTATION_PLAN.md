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

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
**Goal:** Set up project structure and basic auth/database

1. **Project Setup**
   - Initialize monorepo with Turborepo
   - Configure TypeScript, ESLint, Prettier
   - Set up CI/CD pipeline (GitHub Actions)
   - Configure deployment to Vercel (frontend) + Railway (backend)

2. **Database Schema**
   - Users (id, email, username, password_hash, elo_rating, created_at)
   - Decks (id, user_id, name, leader_card_id, cards_json, is_public)
   - Cards (id, set_code, card_number, name, type, cost, power, effects_json)
   - Matches (id, player1_id, player2_id, winner_id, game_log, created_at)
   - CardSets (id, code, name, release_date, is_active)

3. **Authentication System**
   - JWT-based auth with refresh tokens
   - OAuth integration (Discord, Google)
   - Session management with Redis (Upstash)
   - Email verification flow

4. **Card Data Migration & Admin System**
   - Build card extraction tool for Unity StreamingAssets
   - Parse TRANSLATION.txt for card text
   - Create admin dashboard for card management
   - Upload initial card images to Cloudflare R2

### Phase 2: Core Features (Deck Builder & Lobby)
**Goal:** Users can build decks and find matches

1. **Deck Builder** - Card search, drag-and-drop, validation, import/export
2. **Lobby System** - Create/join rooms, quick match, chat
3. **User Profiles** - Match history, deck collection, statistics

### Phase 3: Game Engine (Core Gameplay) ✅ **COMPLETED**
**Goal:** Playable matches with full rule enforcement

1. **Game State Manager** ✅ - GameStateManager class with full turn management, combat resolution, and card zones
2. **Game Renderer (Phaser 3)** ✅ - GameScene with board layout, zone definitions, drag-and-drop card interactions
3. **Rules Engine** 🔄 - Basic game actions implemented, ActionV3 effects system pending
4. **Multiplayer Sync** ✅ - GameManager with WebSocket handlers, real-time state synchronization, and reconnection support

**Key Achievements:**
- Complete GameStateManager with 400+ lines of core game logic
- Phaser.js GameScene with visual board rendering and card interaction
- Server-side game rooms with deck loading from PostgreSQL database
- Real-time multiplayer via Socket.IO with game state synchronization
- TypeScript compilation errors resolved across all packages

### Phase 4: Ranked & Competitive Features
**Goal:** Full competitive experience

1. **Ranked Mode** - ELO system, tiers, seasonal resets
2. **Match Replays** - Recording, playback, sharing
3. **Spectator Mode** - Live watching, featured matches
4. **AI Opponent** - Multiple difficulty levels

### Phase 5: Social & Community Features
**Goal:** Engaged community

1. **Friends System** - Requests, status, challenges
2. **Chat System** - In-game, lobby, moderation
3. **Profile Customization** - Avatars, sleeves, playmats

### Phase 6: Content & Admin Tools
**Goal:** Easy maintenance

1. **Admin Dashboard** - User/card management, analytics
2. **Card Database Browser** - Public search, rulings
3. **Deck Browser** - Public decks, filters

### Phase 7: Advanced Features
**Goal:** Tournament support

1. **Tournament System** - Brackets, registration
2. **Custom Game Modes** - Sealed, draft, best of 3

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
