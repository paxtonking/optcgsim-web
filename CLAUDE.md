# Claude Context - OPTCGSim Web

## Project Overview
OPTCGSim Web is a browser-based One Piece Trading Card Game (OPTCG) simulator being ported from a Unity desktop application. The goal is to provide a no-download, browser-accessible platform similar to Dueling Nexus.

## Git Repository
- **Remote**: https://github.com/paxtonking/optcgsim-web.git
- **Branch**: master
- **Status**: Active development

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Phaser 3 |
| State | Zustand |
| Backend | Node.js, Express 4.x |
| Real-time | Socket.IO 4.7.5 |
| Database | PostgreSQL + Prisma 5.14 |
| Styling | TailwindCSS 3.4 |
| Auth | JWT + bcrypt |
| Build | Turborepo 2.0 (monorepo) |

## Project Structure
```
packages/
├── client/          # React + Phaser.js frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── game/         # GameScene.ts (828 lines), GameController.ts
│   │   ├── pages/        # Lobby, DeckBuilder, Game, Profile, Auth
│   │   ├── stores/       # Zustand stores
│   │   └── services/     # API & Socket.IO clients
│   └── public/data/      # cards.json (2,188 cards)
│
├── server/          # Node.js Express backend
│   ├── src/
│   │   ├── api/          # REST endpoints
│   │   ├── services/     # AIService, CardLoaderService
│   │   └── websocket/    # GameManager, AIGameManager, LobbyManager
│   └── prisma/           # Database schema
│
└── shared/          # Shared types & game logic
    └── src/
        ├── effects/      # EffectEngine.ts (1,143 lines), cardDefinitions.ts
        ├── game/         # GameStateManager.ts (682 lines)
        └── types/        # GameState, CardZone, GamePhase interfaces
```

## Key Files
| File | Purpose |
|------|---------|
| `shared/src/game/GameStateManager.ts` | Core game logic - turns, combat, zones |
| `shared/src/effects/EffectEngine.ts` | Effect resolution with 80+ triggers |
| `shared/src/effects/cardDefinitions.ts` | Card effect definitions (85+ cards) |
| `client/src/game/GameScene.ts` | Phaser.js board rendering |
| `server/src/services/AIService.ts` | AI decision making |
| `server/src/websocket/AIGameManager.ts` | AI vs Human coordination |

## Development Phases & Status

### Completed
- **Phase 1**: Foundation (monorepo, TypeScript, Prisma, JWT auth)
- **Phase 2**: Core Features (deck builder, lobby UI, user profiles)
- **Phase 3**: Game Engine (GameStateManager, Phaser rendering, effects, multiplayer)
- **Phase 4**: AI & Polish (AI opponent, Counter/Trigger UI, 45+ card definitions, sound effects)

### Not Started (Phases 5-7)
- Ranked mode with ELO
- Match replays
- Friends system & chat
- Tournament system
- Admin dashboard

## Running the Project
```bash
# Install dependencies
npm install

# Start PostgreSQL (requires Docker)
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start dev servers
npm run dev
```
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Important Documentation
- `PLAN.md` - Original 7-phase implementation strategy
- `TASKS.md` - Task tracker with completion status
- `PROGRESS_REPORT.md` - Development session history
- `docs/unity-effect-system.md` - Unity ActionV3 effect system reference

## Current Stats
- 2,188 cards from 48 sets
- 45+ card effect definitions (Starter Decks 01/02 + popular cards)
- 80+ effect triggers, 200+ effect types
- Counter Step & Trigger Step UI implemented
- Procedural sound effects for game actions
- ~6,000+ lines of TypeScript
- 0% test coverage (needs implementation)

## Coding Patterns
- All code is TypeScript with strict mode
- Shared game logic in `packages/shared` for client/server consistency
- Zustand for UI state, server-authoritative for game state
- Socket.IO events for real-time game actions
- Prisma for type-safe database operations
