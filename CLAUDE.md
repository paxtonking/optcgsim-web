# Claude Context - OPTCGSim Web

## Project Overview
OPTCGSim Web is a browser-based One Piece Trading Card Game (OPTCG) simulator being ported from a Unity desktop application. The goal is to provide a no-download, browser-accessible platform similar to Dueling Nexus.

## Git Repository
- **Remote**: https://github.com/paxtonking/optcgsim-web.git
- **Branch**: master
- **Status**: All 7 phases complete - Ready for testing/deployment

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
│   │   ├── game/         # GameScene.ts (1,763 lines), GameController.ts (376 lines)
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
        ├── game/         # GameStateManager.ts (945 lines)
        └── types/        # GameState, CardZone, GamePhase interfaces
```

## Key Files
| File | Purpose |
|------|---------|
| `shared/src/game/GameStateManager.ts` | Core game logic - turns, combat, zones, mulligan |
| `shared/src/effects/EffectEngine.ts` | Effect resolution with 80+ triggers |
| `shared/src/effects/cardDefinitions.ts` | Card effect definitions (85+ cards) |
| `shared/src/constants/emotes.ts` | Quick messages and character emotes |
| `shared/src/constants/profile.ts` | Avatar and badge definitions |
| `client/src/game/GameScene.ts` | Phaser.js board rendering, card placeholders |
| `client/src/game/GameController.ts` | Game initialization, socket events, state management |
| `client/src/components/FriendsPanel.tsx` | Friends list, requests, challenges |
| `client/src/components/ChatPanel.tsx` | In-game chat with emotes |
| `client/src/components/LobbyChatPanel.tsx` | Global lobby chat |
| `client/src/components/ProfileCustomization.tsx` | Avatar selection, badges display |
| `server/src/services/AIService.ts` | AI decision making |
| `server/src/websocket/AIGameManager.ts` | AI vs Human coordination |
| `server/src/websocket/PresenceManager.ts` | Online status tracking |
| `server/src/websocket/LobbyChatManager.ts` | Global lobby chat |
| `server/src/api/admin.ts` | Admin API endpoints |
| `server/src/api/announcements.ts` | Public announcements API |
| `client/src/pages/admin/*` | Admin dashboard pages |
| `client/src/pages/CardsPage.tsx` | Public card database browser |
| `client/src/pages/DecksPage.tsx` | Public deck browser |
| `client/src/components/AnnouncementsBanner.tsx` | Homepage announcements display |
| `server/src/api/tournaments.ts` | Tournament system API endpoints |
| `server/src/api/reports.ts` | User report submission API |
| `client/src/pages/TournamentsPage.tsx` | Public tournaments list |
| `client/src/pages/TournamentDetailPage.tsx` | Tournament details, bracket, registration |
| `client/src/pages/admin/AdminTournaments.tsx` | Tournament management |
| `client/src/pages/admin/AdminReports.tsx` | Report moderation |
| `client/src/pages/admin/AdminSuspensions.tsx` | User suspension management |
| `client/src/components/ReportUserModal.tsx` | User report submission UI |
| `server/src/api/gameModes.ts` | Custom game modes API (series, draft, sealed) |
| `server/src/api/images.ts` | Image proxy for card images (CORS bypass) |
| `client/src/pages/GameModesPage.tsx` | Custom game modes UI |

## Development Phases & Status

### Completed
- **Phase 1**: Foundation (monorepo, TypeScript, Prisma, JWT auth)
- **Phase 2**: Core Features (deck builder, lobby UI, user profiles, deck import/export)
- **Phase 3**: Game Engine (GameStateManager, Phaser rendering, effects, multiplayer)
- **Phase 4**: Ranked & Competitive (ELO rating, leaderboards, AI opponent, spectator mode, match replays)
- **Phase 5**: Social Features (friends system, challenges, online status, lobby chat, in-game chat, emotes, profile customization)
- **Phase 6**: Content & Admin Tools (admin dashboard, user management, card database browser, public deck browser, announcements system, analytics dashboard)
- **Phase 7**: Tournament & Advanced Features (tournament system, reporting/moderation, custom game modes)

## Recent Bug Fixes & Improvements

### Game Rendering
- **Dual-Domain Image Proxy**: Added `/api/images/cards/:filename` and `/api/images/official/:filename` endpoints to proxy card images from both optcgapi.com and onepiece-cardgame.com, bypassing CORS restrictions
- **Card Visibility**: Fixed hover preview to hide opponent's hand cards and life cards from both players (shows "Hidden Card" instead of revealing card details)
- **Mulligan Phase Rendering**: Fixed duplicate card rendering during mulligan - cards now render only in mulligan panel, not behind it
- **Mulligan Overlay Fix**: Made mulligan overlay interactive to block hover events on cards behind the panel
- **Hand Rendering After Mulligan**: Fixed hand cards not appearing after clicking "Keep Hand" - now renders immediately without waiting for server phase change
- **Texture Loading Fix**: Fixed async texture loading so cards show actual images instead of card-backs after images load
- **Card Placeholders**: When card images fail to load (CORS), colored placeholders display card type, power, and name
- **Card Sizing**: Fixed oversized cards by using explicit `setDisplaySize()` instead of scale-based sizing
- **Scene Timing**: Added `sceneReady` flag to defer state updates until Phaser scene is fully initialized
- **State Deduplication**: Signature-based comparison prevents redundant state updates

### Socket & Networking
- **Socket Listener Cleanup**: Moved socket listener setup from constructor to `initialize()` with deduplication flag
- **Duplicate Instance Prevention**: Added global `activeGames` Map tracking to prevent React StrictMode from creating duplicate Phaser game instances

### Game Logic
- **Mulligan Phase**: Full mulligan system with UI - players can keep hand or mulligan once for a new hand
- **AI Mulligan**: AI evaluates hand quality and decides to keep or mulligan (keeps if 2+ playable cards cost 2-4)
- **First Turn Rules**: `beginFirstTurn()` handles DON phase and transitions to MAIN_PHASE
- **Navigation Loop Fix**: Lobby state properly resets to prevent redirect loops after game end

### Performance
- **FPS Limiting**: Phaser configured to 30 FPS target to reduce CPU usage
- **Leader Card Loading**: Fixed leader cards not appearing in hand on game start

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
- `PLAN.md` - Original 7-phase implementation strategy and architecture
- `docs/unity-effect-system.md` - Unity ActionV3 effect system reference

## Current Stats
- 2,188 cards from 48 sets
- 85+ card effect definitions (Starter Decks 01-04 + popular cards)
- 80+ effect triggers, 200+ effect types
- ELO rating system with rank tiers (Bronze → Master)
- Friends system with direct challenges
- Online presence tracking
- In-game and lobby chat with emotes
- Profile customization (16 avatars, 14 badges)
- Spectator mode for live games
- Deck import/export (text and JSON formats)
- AI opponent with 3 difficulty levels (with mulligan decision logic)
- Counter Step & Trigger Step UI implemented
- Procedural sound effects for game actions
- Admin dashboard with user management and analytics
- Public card database browser with filters
- Public deck browser with search and filters
- Announcements system with types (Info, Update, Event, Maintenance, Alert)
- Tournament system (Single/Double Elimination, Swiss, Round Robin formats)
- User reporting and suspension system
- Custom game modes (Best-of-3/5 series, Draft mode, Sealed mode)
- Card placeholder system for CORS-blocked images
- Mulligan UI with Keep Hand / Mulligan buttons
- ~16,000+ lines of TypeScript
- 0% test coverage (needs implementation)

## Coding Patterns
- All code is TypeScript with strict mode
- Shared game logic in `packages/shared` for client/server consistency
- Zustand for UI state, server-authoritative for game state
- Socket.IO events for real-time game actions
- Prisma for type-safe database operations
