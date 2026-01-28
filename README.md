# OPTCGSim Web

A web-based One Piece Trading Card Game Simulator - play directly in your browser without downloads.

> **Status:** All 7 Development Phases Complete - Ready for Testing/Deployment

## Features

### Core Gameplay
- **Full Game Engine** - Complete turn structure, combat system, card effects
- **Mulligan System** - Keep hand or mulligan once at game start with UI
- **Counter Step UI** - Choose counter cards during combat defense
- **Trigger Step UI** - Activate life card trigger effects
- **AI Opponent** - Three difficulty levels with intelligent decision making
- **Card Effects** - 85+ cards with effects, all keyword abilities working

### Deck Building & Cards
- **Deck Builder** - Create, edit, and manage decks with full card search and filtering
- **Card Database** - 2,188 cards from 48 sets with images
- **Public Card Browser** - Browse all cards with filters
- **Public Deck Browser** - Browse and search community decks
- **Deck Import/Export** - Text and JSON format support

### Competitive Features
- **Ranked Matchmaking** - ELO rating system with rank tiers (Bronze to Master)
- **Leaderboards** - Global rankings by ELO
- **Match Replays** - Review past games
- **Spectator Mode** - Watch live games

### Social Features
- **Friends System** - Add friends, view online status
- **Direct Challenges** - Challenge friends to games
- **In-Game Chat** - Chat during matches with emotes
- **Lobby Chat** - Global chat in the lobby
- **Profile Customization** - 16 avatars, 14 badges

### Tournament & Advanced
- **Tournament System** - Single/Double Elimination, Swiss, Round Robin formats
- **Custom Game Modes** - Best-of-3/5 series, Draft mode, Sealed mode
- **User Reporting** - Report inappropriate behavior
- **Admin Dashboard** - User management, analytics, announcements

### Card Effects Supported
- **Keywords**: Rush, Blocker, Banish, Double Attack, Unblockable
- **Triggers**: ON_PLAY, ON_ATTACK, ON_BLOCK, ON_KO, COUNTER, TRIGGER
- **Conditions**: DON!! count, life count, hand/field conditions
- **Durations**: Instant, until end of turn, until end of battle, permanent

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Phaser 3 |
| State Management | Zustand |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL (Docker), Prisma ORM |
| Real-time | WebSockets via Socket.IO |
| Build | Turborepo 2.0 monorepo |

## Project Structure

```
optcgsim-web/
├── packages/
│   ├── client/          # React + Phaser.js frontend
│   │   ├── src/
│   │   │   ├── components/   # Reusable UI components
│   │   │   ├── game/         # GameScene.ts (1,763 lines), GameController.ts
│   │   │   ├── pages/        # Route pages (Lobby, DeckBuilder, Game, Admin, etc.)
│   │   │   ├── stores/       # Zustand state stores
│   │   │   └── services/     # API/Socket clients
│   │   └── public/
│   │       ├── assets/       # Card backs, playmats
│   │       └── data/         # cards.json (2,188 cards)
│   │
│   ├── server/          # Node.js backend
│   │   ├── src/
│   │   │   ├── api/          # REST API endpoints
│   │   │   ├── websocket/    # Game, Lobby, AI, Chat managers
│   │   │   └── services/     # AI, CardLoader, business logic
│   │   └── prisma/           # Database schema
│   │
│   └── shared/          # Shared types & game logic
│       └── src/
│           ├── types/        # TypeScript interfaces
│           ├── effects/      # EffectEngine.ts (1,143 lines)
│           └── game/         # GameStateManager.ts (945 lines)
│
└── tools/
    └── card-importer/   # Fetch cards from OPTCG API
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/paxtonking/optcgsim-web.git
cd optcgsim-web
```

2. Install dependencies:
```bash
npm install
```

3. Start the database:
```bash
docker-compose up -d
```

4. Set up environment variables:
```bash
# Copy example env file
cp packages/server/.env.example packages/server/.env

# Edit with your settings
```

5. Run database migrations:
```bash
npm run db:push
```

6. Start development servers:
```bash
# From root directory
npm run dev
```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Database**: PostgreSQL on port 5432

## Environment Variables

Create `packages/server/.env` with:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/optcgsim"

# JWT (generate secure random strings for production)
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# Server
PORT=4000
NODE_ENV=development

# Client URL (for CORS)
CLIENT_URL="http://localhost:3000"
```

## Managing Dev Servers

**IMPORTANT**: Before starting dev servers, always check if they're already running to avoid duplicate processes.

### Check for running processes
```bash
# Check if ports are in use
netstat -ano | findstr ":3000 :4000"
```

### Stop all project processes
```bash
npm run stop
```

### Stop Docker (PostgreSQL)
```bash
docker stop optcgsim-postgres
```

## Development Phases - All Complete

### Phase 1: Foundation
- Project setup (Turborepo monorepo)
- Database schema (Prisma)
- Authentication system (JWT)
- Card data migration tools

### Phase 2: Core Features
- Deck builder with search/filters
- Lobby system UI
- User profiles
- Deck import/export

### Phase 3: Game Engine
- GameStateManager (945 lines)
- Game renderer (Phaser.js - 1,763 lines)
- Rules engine with card effects
- Multiplayer sync (WebSocket)
- Visual polish (card images, animations)

### Phase 4: Ranked & Competitive
- AI opponents (3 difficulty levels)
- ELO rating system with rank tiers
- Match replays
- Spectator mode
- Leaderboards

### Phase 5: Social Features
- Friends system with direct challenges
- Online presence tracking
- In-game and lobby chat with emotes
- Profile customization (avatars, badges)

### Phase 6: Content & Admin Tools
- Admin dashboard with user management
- Card database browser with filters
- Public deck browser
- Announcements system
- Analytics dashboard

### Phase 7: Tournament & Advanced Features
- Tournament system (multiple formats)
- User reporting and suspension system
- Custom game modes (series, draft, sealed)

## How to Play

1. **Register/Login** - Create an account or login
2. **Build a Deck** - Go to Deck Builder, select a leader and 50 cards
3. **Start a Game**:
   - **vs AI**: Go to Lobby → Play vs AI → Choose difficulty
   - **vs Player**: Go to Lobby → Create Room or Join Room
4. **Mulligan Phase** - Choose to keep your starting hand or mulligan for a new one
5. **Gameplay**:
   - Drag cards from hand to field to play them
   - Click cards to select, then use Attack button
   - Use Counter cards when defending
   - Use End Turn when finished
   - Win by reducing opponent's life to 0

## Project Stats

- 2,188 cards from 48 sets
- 85+ card effect definitions
- 80+ effect triggers, 200+ effect types
- ~16,000+ lines of TypeScript

## Documentation

- [CLAUDE.md](CLAUDE.md) - Development context and architecture details
- [PLAN.md](PLAN.md) - Original 7-phase implementation strategy
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

## Credits

- Card data and images from [OPTCG API](https://optcgapi.com/)
- Original game inspiration: OPTCGSim (Unity)
- One Piece TCG by Bandai

## License

This project is for educational and personal use only. One Piece and the One Piece TCG are trademarks of Bandai/Toei Animation/Shueisha.

## Disclaimer

This is an unofficial fan project and is not affiliated with, endorsed by, or connected to Bandai, Toei Animation, Shueisha, or any official One Piece TCG entities. All card images and game mechanics are property of their respective owners.
