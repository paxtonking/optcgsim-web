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
| Frontend | React 18, TypeScript, Vite |
| Game Board | HTML/CSS React Components (replaced Phaser.js) |
| State | Zustand + React Hooks |
| Backend | Node.js, Express 4.x |
| Real-time | Socket.IO 4.7.5 |
| Database | PostgreSQL + Prisma 5.14 |
| Styling | TailwindCSS 3.4 + Custom CSS |
| Auth | JWT + bcrypt |
| Build | Turborepo 2.0 (monorepo) |

## Project Structure
```
packages/
├── client/          # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   │   └── game/     # Game board components (HTML/CSS)
│   │   ├── hooks/        # useGameSocket, useGameState
│   │   ├── game/         # Legacy Phaser files (kept for reference)
│   │   ├── pages/        # Lobby, DeckBuilder, Game, Profile, Auth
│   │   ├── stores/       # Zustand stores
│   │   └── services/     # API & Socket.IO clients
│   └── public/
│       ├── data/         # cards.json (2,188 cards)
│       └── assets/       # playmats, images
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
| `client/src/components/game/GameBoard.tsx` | Main game board React component |
| `client/src/components/game/GameBoard.css` | All game board styles and animations |
| `client/src/components/game/PlayerArea.tsx` | Player zones (life, DON, leader, characters) |
| `client/src/components/game/GameCard.tsx` | Individual card component with hover effects |
| `client/src/components/game/CardPreview.tsx` | Card hover preview panel |
| `client/src/components/game/ActionButtons.tsx` | Game action buttons |
| `client/src/components/game/LifeBar.tsx` | Visual life indicator |
| `client/src/hooks/useGameSocket.ts` | Socket communication hook |
| `client/src/hooks/useGameState.ts` | Game state management hook |
| `shared/src/game/GameStateManager.ts` | Core game logic - turns, combat, zones, mulligan |
| `shared/src/effects/EffectEngine.ts` | Effect resolution with 80+ triggers |
| `shared/src/effects/cardDefinitions.ts` | Card effect definitions (85+ cards) |
| `client/src/game/GameScene.ts` | Legacy Phaser.js rendering (kept for reference) |
| `client/src/game/GameController.ts` | Legacy game controller (kept for reference) |
| `server/src/services/AIService.ts` | AI decision making |
| `server/src/websocket/AIGameManager.ts` | AI vs Human coordination |
| `server/src/api/images.ts` | Image proxy for card images (CORS bypass) |

## Development Phases & Status

### Completed
- **Phase 1**: Foundation (monorepo, TypeScript, Prisma, JWT auth)
- **Phase 2**: Core Features (deck builder, lobby UI, user profiles, deck import/export)
- **Phase 3**: Game Engine (GameStateManager, effects, multiplayer)
- **Phase 4**: Ranked & Competitive (ELO rating, leaderboards, AI opponent, spectator mode, match replays)
- **Phase 5**: Social Features (friends system, challenges, online status, lobby chat, in-game chat, emotes, profile customization)
- **Phase 6**: Content & Admin Tools (admin dashboard, user management, card database browser, public deck browser, announcements system, analytics dashboard)
- **Phase 7**: Tournament & Advanced Features (tournament system, reporting/moderation, custom game modes)
- **Phase 8**: HTML/CSS Game Board Overhaul (replaced Phaser.js with React components)

## Recent Changes - HTML/CSS Game Board Overhaul

### Architecture Change
Replaced Phaser.js canvas-based rendering with pure HTML/CSS React components for better performance, smoother animations, and easier styling.

**Old Architecture:**
```
GamePage.tsx → GameController.ts → GameScene.ts (Phaser canvas)
```

**New Architecture:**
```
GamePage.tsx → GameBoard.tsx (React)
                ├── PlayerArea.tsx (opponent/player zones)
                │     ├── LifeBar.tsx
                │     ├── CardPile.tsx (deck/trash/DON)
                │     └── GameCard.tsx
                ├── HandZone.tsx
                ├── CardPreview.tsx
                └── ActionButtons.tsx
```

### New Features
- **Centered Layout**: Main play area (leader + characters) always centered on screen
- **Responsive Design**: Flexbox-based layout adapts to screen size
- **CSS Animations**: Smooth hover effects, card highlighting with CSS transitions
- **Face-down Opponent Cards**: Opponent's hand shows actual card backs instead of text count
- **Playmat Background**: Custom playmat image for player areas
- **Larger Cards**: 100x140px cards for better visibility
- **Image Proxy**: Dual-domain proxy for optcgapi.com and onepiece-cardgame.com images

### Layout Structure
```
┌────────────────────────────────────────────────────────────────────┐
│ Turn: 1  |  MAIN PHASE  |  Your Turn                              │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  ┌────────┐ │
│  │           OPPONENT HAND (face-down cards)        │  │ CARD   │ │
│  ├──────────────────────────────────────────────────┤  │PREVIEW │ │
│  │ [Life][DON]    [LEADER][CHAR x5]    [Deck/Trash] │  │        │ │
│  ├──────────────────────────────────────────────────┤  │        │ │
│  │ [Life][DON]    [LEADER][CHAR x5]    [Deck/Trash] │  ├────────┤ │
│  ├──────────────────────────────────────────────────┤  │ACTIONS │ │
│  │              PLAYER HAND (face up)               │  │        │ │
│  └──────────────────────────────────────────────────┘  └────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### Card Styling
- Green glow for playable cards
- Red glow for attack targets
- Blue glow for selected cards
- Hover lift effect with shadow
- Rested state (90deg rotation)
- Overlapping hand cards that expand on hover

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
- AI opponent with 3 difficulty levels
- Counter Step & Trigger Step UI implemented
- Admin dashboard with user management and analytics
- Tournament system (Single/Double Elimination, Swiss, Round Robin)
- HTML/CSS game board with CSS animations
- Dual-domain image proxy for card images
- ~18,000+ lines of TypeScript
- 0% test coverage (needs implementation)

## Coding Patterns
- All code is TypeScript with strict mode
- Shared game logic in `packages/shared` for client/server consistency
- React hooks for game socket and state management
- Zustand for UI state, server-authoritative for game state
- Socket.IO events for real-time game actions
- Prisma for type-safe database operations
- CSS modules for component styling
