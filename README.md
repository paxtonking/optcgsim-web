# OPTCGSim Web

A web-based One Piece Trading Card Game Simulator - play directly in your browser without downloads.

> **Status:** Alpha - Core Features Complete (Playable vs AI)

## Features

### Implemented
- **Deck Builder** - Create, edit, and manage decks with full card search and filtering
- **Card Database** - 2,188 cards from 48 sets with images from external API
- **User Authentication** - Register, login, JWT-based sessions
- **User Profiles** - Stats, match history, deck overview
- **Lobby System** - Quick match queue, private lobbies, AI practice
- **Game Engine** - Full turn structure, combat, card effects
- **AI Opponent** - Three difficulty levels (Easy, Medium, Hard)
- **Visual Polish** - Card images, zone highlights, turn animations
- **Card Effects** - 85+ cards with effects, all keyword abilities working

### Card Effects Supported
- **Keywords**: Rush, Blocker, Banish, Double Attack, Unblockable
- **Triggers**: ON_PLAY, ON_ATTACK, ON_BLOCK, ON_KO, COUNTER, TRIGGER
- **Conditions**: DON!! count, life count, hand/field conditions
- **Durations**: Instant, until end of turn, until end of battle, permanent

### In Progress
- [ ] Counter Step UI (player choices during combat)
- [ ] Trigger Step UI (life card effect choices)
- [ ] More card effect definitions

### Planned
- [ ] Ranked matchmaking with ELO system
- [ ] Match replays
- [ ] Spectator mode
- [ ] Tournament system
- [ ] Mobile responsiveness

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Phaser.js |
| State Management | Zustand |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL (Docker), Prisma ORM |
| Real-time | WebSockets via Socket.IO |
| Build | Turborepo monorepo |

## Project Structure

```
optcgsim-web/
├── packages/
│   ├── client/          # React + Phaser.js frontend
│   │   ├── src/
│   │   │   ├── components/   # Reusable UI components
│   │   │   ├── game/         # Phaser game scene & controller
│   │   │   ├── pages/        # Route pages
│   │   │   ├── stores/       # Zustand state stores
│   │   │   └── services/     # API/Socket clients
│   │   └── public/
│   │       ├── assets/       # Card backs, playmats
│   │       └── data/         # cards.json (2,188 cards)
│   │
│   ├── server/          # Node.js backend
│   │   ├── src/
│   │   │   ├── routes/       # REST API endpoints
│   │   │   ├── websocket/    # Game, Lobby, AI managers
│   │   │   └── services/     # AI, CardLoader, business logic
│   │   └── prisma/           # Database schema
│   │
│   └── shared/          # Shared types & game logic
│       └── src/
│           ├── types/        # TypeScript interfaces
│           ├── effects/      # Effect engine & types
│           └── game/         # GameStateManager
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
git clone https://github.com/yourusername/optcgsim-web.git
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
npm run db:migrate
```

6. Fetch card data:
```bash
cd tools/card-importer
npm run fetch
```

7. Start development servers:
```bash
# From root directory
npm run dev
```

### Access Points
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
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
PORT=3001
NODE_ENV=development

# Client URL (for CORS)
CLIENT_URL="http://localhost:5173"
```

## Development Phases

### Phase 1: Foundation ✅ Complete
- [x] Project setup (Turborepo monorepo)
- [x] Database schema (Prisma)
- [x] Authentication system (JWT)
- [x] Card data migration tools

### Phase 2: Core Features ✅ Complete
- [x] Deck builder with search/filters
- [x] Lobby system UI
- [x] User profiles

### Phase 3: Game Engine ✅ Complete
- [x] Game state manager (400+ lines)
- [x] Game renderer (Phaser.js)
- [x] Rules engine with card effects
- [x] Multiplayer sync (WebSocket)
- [x] Visual polish (card images, animations)

### Phase 4: Competitive Features 🔨 In Progress
- [x] AI opponents (3 difficulty levels)
- [ ] Ranked mode with ELO
- [ ] Match replays
- [ ] Spectator mode

### Phase 5: Social Features
- [ ] Friends system
- [ ] Chat
- [ ] Profile customization

### Phase 6: Admin Tools
- [ ] Admin dashboard
- [ ] Card management UI
- [ ] Analytics

### Phase 7: Advanced Features
- [ ] Tournament system
- [ ] Custom game modes
- [ ] Public API

## Documentation

- [PROGRESS_REPORT.md](PROGRESS_REPORT.md) - Detailed development progress
- [TASKS.md](TASKS.md) - Task tracker with completion status

## How to Play

1. **Register/Login** - Create an account or login
2. **Build a Deck** - Go to Deck Builder, select a leader and 50 cards
3. **Start a Game**:
   - **vs AI**: Go to Lobby → Play vs AI → Choose difficulty
   - **vs Player**: Go to Lobby → Create Room or Join Room
4. **Gameplay**:
   - Drag cards from hand to field to play them
   - Click cards to select, then use Attack button
   - Use End Turn when finished
   - Win by reducing opponent's life to 0

## Credits

- Card data and images from [OPTCG API](https://optcgapi.com/)
- Original game inspiration: OPTCGSim (Unity)
- One Piece TCG by Bandai

## License

This project is for educational and personal use only. One Piece and the One Piece TCG are trademarks of Bandai/Toei Animation/Shueisha.

## Disclaimer

This is an unofficial fan project and is not affiliated with, endorsed by, or connected to Bandai, Toei Animation, Shueisha, or any official One Piece TCG entities. All card images and game mechanics are property of their respective owners.
