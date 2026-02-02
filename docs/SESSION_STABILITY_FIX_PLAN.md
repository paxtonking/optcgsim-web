# Session Stability Fix Plan

## Goal
Prevent players from being logged out or dropped mid-game due to token expiry, reconnect races, and strict disconnect handling.

## Root Causes
1. Access tokens expire in 15 minutes, but websocket reconnects did not reliably refresh token auth.
2. Client refresh flow could recurse (`/auth/refresh` calling refresh logic again) and race under concurrent 401s.
3. Socket lifecycle was brittle across auth transitions and game-route reconnects.
4. AI games ended immediately on disconnect, unlike normal matches with reconnection tolerance.
5. Persisted auth hydration timing could cause premature unauthenticated behavior on initial app load.

## Implementation Plan

### 1) Harden refresh flow
- Add single-flight refresh in auth store so concurrent refresh attempts share one request.
- Only force logout on explicit auth failure (`401/403`) during refresh; do not log out on transient network failure.
- Prevent recursive refresh attempts by excluding `/auth/refresh` from retry-on-401 logic.

### 2) Harden websocket authentication lifecycle
- Keep socket handshake token synchronized with auth-store token changes.
- Add automatic websocket auth recovery on token-related `connect_error` (refresh token and reconnect once).
- Differentiate websocket auth middleware errors (`Token expired` vs `Invalid token`) for clearer client handling.

### 3) Harden game reconnect behavior
- Ensure gameplay socket hook always uses `connectSocket()` and re-requests state on each successful reconnect.
- Fix auth transition cleanup so socket/listeners are properly cleaned when user becomes unauthenticated.

### 4) Add AI reconnect grace period
- Replace immediate AI-game disconnect forfeit with 30-second grace timer.
- Cancel pending forfeit when player reconnects (`getGameState` or next action).
- Clear disconnect timers when game ends to avoid stale timers.

### 5) Stabilize auth hydration gating
- Add `hasHydrated` auth-store signal and gate app render until persisted auth hydration completes.

## Status
- [x] Refresh flow hardening
- [x] Websocket auth/reconnect hardening
- [x] Gameplay reconnect hardening
- [x] AI disconnect grace period
- [x] Hydration gating
