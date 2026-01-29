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
        ├── effects/      # EffectEngine.ts, effect types, effectTextParser
        ├── game/         # GameStateManager.ts (945 lines)
        └── types/        # GameState, CardZone, GamePhase interfaces

tools/
└── card-importer/   # Database seeding and migration tools
    └── src/
        ├── seed-database.ts     # Seed cards from JSON
        ├── migrate-effects.ts   # Migrate effects to database
        └── fetch-cards.ts       # Fetch card data from API
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
| `server/src/services/CardLoaderService.ts` | Loads cards from database, converts to CardDefinition |
| `client/src/game/GameScene.ts` | Legacy Phaser.js rendering (kept for reference) |
| `client/src/game/GameController.ts` | Legacy game controller (kept for reference) |
| `server/src/services/ai/AIService.ts` | AI decision making (strategy pattern) |
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
- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Managing Dev Servers

**IMPORTANT**: Before starting dev servers, always check if they're already running to avoid duplicate processes.

### Check for running processes
```bash
# Check if ports are in use
netstat -ano | findstr ":3000 :4000"

# List all project-related Node processes
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*optcgsim*' } | Select-Object ProcessId, CommandLine"
```

### Stop all project processes
```bash
npm run stop
```

### Stop Docker (PostgreSQL)
```bash
docker stop optcgsim-postgres
```

### Workflow
1. `npm run dev` - Start frontend + backend
2. Work on the project...
3. `npm run stop` - Stop all Node processes when done
4. `docker stop optcgsim-postgres` - Stop database if needed

## Important Documentation
- `PLAN.md` - Original 7-phase implementation strategy and architecture
- `docs/unity-effect-system.md` - Unity ActionV3 effect system reference

## Current Stats
- 2,188 cards from 48 sets
- 62 cards with structured effect definitions stored in database
- 1,500+ cards with effects parsed from effectText at runtime
- 80+ effect triggers, 200+ effect types
- ELO rating system with rank tiers (Bronze → Master)
- Friends system with direct challenges
- Online presence tracking
- In-game and lobby chat with emotes
- Profile customization (16 avatars, 14 badges)
- Spectator mode for live games
- Deck import/export (text and JSON formats)
- AI opponent with 3 distinct difficulty strategies (Easy/Medium/Hard)
- Counter Step & Trigger Step UI implemented
- Admin dashboard with user management and analytics
- Tournament system (Single/Double Elimination, Swiss, Round Robin)
- HTML/CSS game board with CSS animations
- Dual-domain image proxy for card images
- ~18,000+ lines of TypeScript
- 77 unit tests for EffectEngine, triggers, and effects (Vitest)
- Effect audit script for tracking implementation gaps
- 16 effect types implemented, 13 trigger types implemented
- Server startup validation for effect implementations

## Card Effects Architecture

Card effects are stored as structured JSON in the database `Card.effects` field (single source of truth).

### How Effects Are Loaded
1. **CardLoaderService** loads all cards from database at server startup
2. For each card:
   - If `Card.effects` is a non-empty array → use structured effects
   - Otherwise, fallback to `effectTextParser.parse(effectText)` at runtime
3. Keywords (Rush, Blocker, etc.) are detected from effectText patterns

### Effect Definition Structure
```typescript
interface CardEffectDefinition {
  id: string;                    // e.g., "ST01-007-effect-1"
  trigger: EffectTrigger;        // ON_PLAY, ACTIVATE_MAIN, COUNTER, etc.
  effects: Effect[];             // Array of effect actions
  conditions?: Condition[];      // Optional activation conditions
  costs?: Cost[];                // Optional costs (REST_DON, LIFE, etc.)
  oncePerTurn?: boolean;         // For ACTIVATE_MAIN abilities
  description?: string;          // Human-readable text
}
```

### Adding/Editing Card Effects
1. **Admin API** (preferred): Use the admin endpoints to update card effects
2. **Migration script**: `npm run migrate-effects` in `tools/card-importer/`
3. **Reference file**: `cardDefinitions.reference.ts` contains historical definitions

### Admin API Endpoints (requires admin auth)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/cards` | GET | List cards with pagination, search, filter by type/hasEffects |
| `/api/admin/cards/:id` | GET | Get single card with full details |
| `/api/admin/cards/:id/effects` | PATCH | Update card effects JSON |
| `/api/admin/cards/:id/effects/validate` | POST | Validate effect JSON before saving |
| `/api/admin/cards/effects/templates` | GET | Get effect templates for common patterns |

### Key Files
| File | Purpose |
|------|---------|
| `server/src/services/CardLoaderService.ts` | Loads cards from DB → CardDefinition |
| `server/src/api/admin.ts` | Admin API including card effect endpoints |
| `shared/src/effects/EffectEngine.ts` | Resolves effects during gameplay |
| `shared/src/effects/parser/` | effectTextParser for fallback parsing |
| `tools/card-importer/src/migrate-effects.ts` | Migration script for effects |
| `shared/src/effects/cardDefinitions.reference.ts` | Historical reference (deprecated) |
| `shared/src/effects/registry.ts` | Tracks implemented vs stub effect types |
| `tools/card-importer/src/audit-effects.ts` | Audit script for implementation gaps |

## AI System Architecture

The AI opponent uses a strategy pattern with distinct decision-making for each difficulty level.

### File Structure
```
packages/server/src/services/ai/
├── index.ts              # Module exports
├── AIService.ts          # Main service (strategy selector)
├── types.ts              # AI-specific types
├── config.ts             # Difficulty settings
├── strategies/
│   ├── BaseStrategy.ts   # Abstract base class
│   ├── EasyStrategy.ts   # Suboptimal, makes mistakes
│   ├── MediumStrategy.ts # Solid fundamentals
│   └── HardStrategy.ts   # Advanced strategic play
└── evaluators/
    ├── BoardEvaluator.ts   # Position scoring
    ├── ThreatAssessor.ts   # Threat identification
    └── LethalCalculator.ts # Win detection
```

### Difficulty Differences

| Feature | Easy | Medium | Hard |
|---------|------|--------|------|
| Mistake Rate | 25% | 0% | 0% |
| Mulligan | Low standards | Curve evaluation | Full analysis |
| Card Play | Random sometimes | Keyword-aware | Threat response |
| Attacks | Misses optimal targets | Prioritizes threats | Full assessment |
| Blocking | Only if survives | Life management | Value preservation |
| Countering | Over/under-counters | Efficient | Resource optimal |
| Think Delay | 1500ms | 1000ms | 750ms |

### Key Classes

- **BoardEvaluator**: Scores field presence, hand advantage, life, DON, and tempo
- **ThreatAssessor**: Identifies dangerous cards (Rush, Double Attack, high power, effects)
- **LethalCalculator**: Detects win opportunities and optimal attack sequences

### Configuration
Settings in `config.ts` control AI behavior:
```typescript
AI_CONFIG = {
  easy: { mistakeChance: 0.25, threatAwareness: 0.3, ... },
  medium: { mistakeChance: 0, threatAwareness: 0.7, ... },
  hard: { mistakeChance: 0, threatAwareness: 1.0, lookAheadTurns: 2, ... }
}
```

## Testing

### Running Tests
```bash
# Run all tests in shared package
cd packages/shared && npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Audit Effect Implementation
```bash
# Run effect audit (from tools/card-importer)
npm run audit

# Include affected cards list
npm run audit:cards
```

### Test Utilities
Located in `packages/shared/src/test-utils/`:
- `mockGameState.ts` - Create mock game states
- `mockCards.ts` - Create mock cards and definitions
- `mockPlayers.ts` - Create mock player states
- `assertions.ts` - Custom test assertions

## Coding Patterns
- All code is TypeScript with strict mode
- Shared game logic in `packages/shared` for client/server consistency
- React hooks for game socket and state management
- Zustand for UI state, server-authoritative for game state
- Socket.IO events for real-time game actions
- Prisma for type-safe database operations
- CSS modules for component styling
