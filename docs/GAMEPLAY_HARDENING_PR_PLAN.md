# Gameplay Hardening PR Plan

## Goal
Improve gameplay correctness, crash resistance, and long-term maintainability in the turn engine and websocket game flow.

## Scope (Executed)

### Phase 1 - Core Rules Correctness
- Fix deck-out timing in `GameStateManager.startTurn` so loss only occurs when a required draw cannot be performed.
- Harden `processAction` against malformed payloads by safely defaulting missing `action.data`.
- Add server-independent guards in `processAction` for:
  - `RESOLVE_COMBAT` (must have active combat and valid combat phase).
  - `END_TURN` (must be in `MAIN_PHASE`).

### Phase 2 - PvP Lifecycle Safety
- Make `finalizeGameStart` calls failure-safe with explicit `.catch(...)`.
- Add pending-game cleanup helper that clears timeouts and both `playerToGame` mappings.
- Use the cleanup helper on RPS setup disconnect and on finalize-start failure.
- Guard end-game calls (`normal`, `surrender`) with error handling.
- Ensure in-memory game cleanup always runs in `endGame` via `finally`.

### Phase 3 - AI Lifecycle Safety
- Make AI finalize/start and end-game calls failure-safe with explicit `.catch(...)`.
- Clean stale `playerToGame` entries when pending AI games fail or disconnect.
- Replace untracked active-game `setTimeout` chains with tracked timeout scheduling.
- Emit sanitized final game state on AI end-game.
- Ensure AI pending timeouts are cleared in `endGame` `finally`.

### Phase 4 - Websocket Input Validation
- Add Zod validation for core gameplay payloads:
  - lobby create/join
  - queue join
  - game action/state/reconnect
  - RPS + first choice
  - AI start/action/first-choice/state
- Add safe fallback error responses for invalid payloads.
- Await and catch lobby-triggered `startGame` call to avoid unhandled rejections.

### Phase 5 - Regression Coverage
- Add regressions in shared tests for:
  - last-card draw does not incorrectly game-over
  - draw-failure game-over
  - reject `RESOLVE_COMBAT` outside combat context
  - reject `END_TURN` outside main phase

## Follow-Up PRs (Recommended)
- Extract a shared action-policy module used by both websocket managers and `GameStateManager`.
- Split `GameStateManager` and `EffectEngine` into phase/domain modules.
- Add server integration tests for reconnect/disconnect and pending-game cleanup flows.
