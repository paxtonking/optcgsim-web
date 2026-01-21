# OPTCGSim Web

A web-based One Piece Trading Card Game Simulator - play directly in your browser without downloads.

> **Status:** In Development (Phase 3 - Game Engine in Progress)

## Features

### Implemented
- **Deck Builder** - Create, edit, and manage decks with full card search and filtering
- **Card Database** - 2,188 cards from 50+ sets with images and metadata
- **User Authentication** - Register, login, JWT-based sessions
- **User Profiles** - Stats, rank progression, deck overview
- **Lobby System UI** - Quick match queue, private lobbies, AI practice (UI only)

### Planned
- [ ] Real-time multiplayer gameplay
- [ ] Ranked matchmaking with ELO system
- [ ] Game engine (turn phases, card effects, combat)
- [ ] Match replays
- [ ] Spectator mode
- [ ] AI opponents
- [ ] Tournament system
- [ ] Admin dashboard for card management

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| State Management | Zustand |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL (Supabase), Prisma ORM |
| Real-time | WebSockets via Socket.IO |

## Project Structure

```
optcgsim-web/
├── packages/
│   ├── client/          # React frontend
│   │   ├── src/
│   │   │   ├── components/   # Reusable UI components
│   │   │   ├── pages/        # Route pages
│   │   │   ├── stores/       # Zustand state stores
│   │   │   ├── services/     # API/Socket clients
│   │   │   └── types/        # TypeScript types
│   │   └── public/
│   │       ├── cards/        # Card images (not in git)
│   │       └── data/         # Card JSON data (not in git)
│   │
│   ├── server/          # Node.js backend
│   │   ├── src/
│   │   │   ├── api/          # REST routes
│   │   │   ├── websocket/    # Socket.IO handlers
│   │   │   ├── middleware/   # Auth, validation
│   │   │   └── services/     # Business logic
│   │   └── prisma/           # Database schema
│   │
│   └── shared/          # Shared types & constants
│
└── tools/
    └── card-importer/   # Extract cards from Unity assets
```

## Getting Started

### Prerequisites

- Node.js 18+ (tested with v24)
- PostgreSQL database (or Supabase account)
- Unity OPTCGSim game files (for card images)

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

3. Set up environment variables:
```bash
# Copy example env file
cp packages/server/.env.example packages/server/.env

# Edit with your database credentials
nano packages/server/.env
```

4. Set up the database:
```bash
cd packages/server
npx prisma db push
```

5. Import card data:
```bash
# Fetch card metadata from OPTCG API
cd tools/card-importer
npx tsx src/fetch-cards.ts

# Import card images from Unity game (requires game files)
npx tsx src/index.ts /path/to/OPTCGSim.app
```

6. Start development servers:
```bash
# From root directory
npm run dev

# Or individually:
cd packages/client && npm run dev  # Frontend on http://localhost:3000
cd packages/server && npm run dev  # Backend on http://localhost:4000
```

## Environment Variables

Create `packages/server/.env` with:

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/database"
DIRECT_URL="postgresql://user:password@host:port/database"

# JWT (generate secure random strings for production)
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# Server
PORT=4000
NODE_ENV=development

# Client URL (for CORS)
CLIENT_URL="http://localhost:3000"
```

## Card Data

Card images and metadata are **not included** in this repository due to size (~400MB).

### Getting Card Images

Option 1: **From Unity Game**
```bash
cd tools/card-importer
npx tsx src/index.ts /path/to/OPTCGSim.app
```

Option 2: **Download Release** (when available)
- Check the Releases page for pre-packaged card data

### Getting Card Metadata

Card metadata is fetched from the [OPTCG API](https://optcgapi.com/):
```bash
cd tools/card-importer
npx tsx src/fetch-cards.ts
```

## Development Phases

### Phase 1: Foundation ✅
- [x] Project setup (Turborepo monorepo)
- [x] Database schema (Prisma)
- [x] Authentication system (JWT)
- [x] Card data migration tools

### Phase 2: Core Features ✅
- [x] Deck builder with search/filters
- [x] Lobby system UI
- [x] User profiles

### Phase 3: Game Engine 🔜
- [ ] Game state manager
- [ ] Game renderer (Phaser/PixiJS)
- [ ] Rules engine
- [ ] Multiplayer sync

### Phase 4: Competitive Features
- [ ] Ranked mode with ELO
- [ ] Match replays
- [ ] Spectator mode
- [ ] AI opponents

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Credits

- Card data from [OPTCG API](https://optcgapi.com/)
- Original game: [OPTCGSim](https://github.com/optcgsim) (Unity)
- One Piece TCG by Bandai

## License

This project is for educational and personal use only. One Piece and the One Piece TCG are trademarks of Bandai/Toei Animation/Shueisha.

## Disclaimer

This is an unofficial fan project and is not affiliated with, endorsed by, or connected to Bandai, Toei Animation, Shueisha, or any official One Piece TCG entities. All card images and game mechanics are property of their respective owners.
