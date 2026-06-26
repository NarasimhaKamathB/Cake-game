# Cake Game — Handoff & Checkpoint

## Current checkpoint — v3

| Item | Value |
|------|-------|
| **Git tag** | `v3` — fully verified, all features confirmed working |
| **Latest commit** | see `git log --oneline -1` |
| **Branch** | `master` |
| **GitHub** | https://github.com/NarasimhaKamathB/Cake-game (public) |
| **Git email** | narasimha.kamath@gmail.com |
| **Vercel (primary)** | https://cake-game-6o4q.vercel.app |
| **Admin URL** | https://cake-game-6o4q.vercel.app/admin |
| **Admin password** | `cakegame2024` (set `NEXT_PUBLIC_ADMIN_PASSWORD` in Vercel to override) |
| **Supabase** | https://dsvkoblqthopectuyrhn.supabase.co (Cake-game, Mumbai) |
| **Date** | June 2026 |

---

## Restore to v3 clean baseline

```powershell
cd C:\Users\narasimha.kamath\Documents\git\o9.Involve\cakegame
git fetch origin
git checkout master
git reset --hard v3
git clean -fd
git status   # should show: nothing to commit, working tree clean
```

Rollback to pre-watchdog state (v2):
```powershell
git reset --hard v2
```

---

## What the game is

A **perishable supply chain simulation** for supply chain workshops.
- 4-echelon chain: Manufacturer → Distributor → Wholesaler → Retailer
- Real-time multiplayer: 4 players per team, one per role (bots fill empty slots)
- Teaches bullwhip effect + perishability costs
- Each round players order stock from upstream; cakes expire after 3 rounds (FIFO)
- Costs: $4/unit lost sales · $2/unit wastage · $0.50/unit/week holding
- Lowest total team cost wins after 20 rounds

---

## Architecture

```
cakegame/
├── app/
│   ├── page.tsx                       # Login (email → auto-assign via Postgres RPC)
│   ├── assigned/page.tsx              # Lobby waiting room — shows TutorialModal on load
│   ├── game/[gameId]/page.tsx         # Main player game UI (timer, submit, summary)
│   └── admin/
│       ├── layout.tsx                 # Admin password gate (NEXT_PUBLIC_ADMIN_PASSWORD)
│       ├── page.tsx                   # Admin overview: leaderboard + config + watchdog
│       └── game/[gameId]/page.tsx     # Per-game admin view: 4 roles + SVG charts + pause
├── components/
│   ├── TutorialModal.tsx              # Full-screen iframe modal (responsive, scale-to-fit)
│   ├── GameResults.tsx                # End-of-game results + "Replay Tutorial" button
│   ├── InventoryBuckets.tsx           # FIFO shelf-life colour-coded bars
│   ├── RolePanel.tsx                  # Per-role inventory/demand panel
│   ├── WeeklySummary.tsx              # Round summary (own role only for player privacy)
│   └── WastageAlert.tsx              # Per-round expiry callout
├── public/
│   └── tutorial.html                  # 62s animated tutorial (6 slides, scale-to-fit)
├── lib/
│   ├── types.ts                       # All TypeScript types + DEFAULT_CONFIG
│   ├── gameLogic.ts                   # Pure game logic (processRound, FIFO expiry)
│   └── supabase.ts                    # DB calls + Realtime + bot/watchdog helpers
└── supabase/
    ├── schema.sql                     # Full DB schema (run once on fresh Supabase project)
    ├── assign_player_atomic.sql       # Atomic sign-in RPC (run once)
    └── fix_team_number_sequence.sql   # Team-number sequence fix (run once if needed)
```

**Supabase tables:**
- `games` — JSONB `state` + `players` + `config`
- `session_settings` — `registration_open` bool + `game_config` JSONB

---

## Key TypeScript types

```typescript
type Role = 'retailer' | 'wholesaler' | 'distributor' | 'manufacturer';
type GamePhase = 'lobby' | 'onboarding' | 'ordering' | 'processing' | 'summary' | 'ended';

interface GameState {
  phase: GamePhase;
  currentRound: number;
  roles: Record<Role, RoleState>;
  playersDoneOrdering: string[];
  roundStartedAt?: number;   // epoch ms — start of current ordering phase
  paused?: boolean;
  pausedAt?: number;
  // pendingOrders?: Partial<Record<Role, number>>  ← implicit JSONB field, NOT in interface
}

interface GameConfig {
  totalRounds: number;           // default 20
  holdingCostPerUnit: number;    // default 0.50
  wastageCostPerUnit: number;    // default 2.00
  lostSalesCostPerUnit: number;  // default 4.00
  expiryWeeks: number;           // default 3
  startingInventory: number;     // default 12
  demandSchedule: number[];      // e.g. [4,4,8,12,16,20,20,…]
  orderTimerSeconds: number;     // default 30
}
```

---

## Key functions

### `lib/gameLogic.ts`
- `processRound(state, config, orders: Record<Role, number>): GameState`
  — Pure; advances round, applies FIFO expiry, calculates costs. Returns `phase: 'summary'` or `'ended'`. Sets `roundStartedAt: undefined` (prevents stale-timer bug).
- `createInitialGameState(config): GameState`
- `getDemandForRound(config, round): number`

### `lib/supabase.ts`
- `getGame(gameId)` / `getAllGames()`
- `updateGameState(gameId, partial)` — merges partial into existing state
- `updateFullGameState(gameId, state)` — writes entire state object
- `autoFillBotPlayers(gameId)` — fills empty roles with `isBot: true` players named "Bot (Role)"
- `startAllGames()` — autoFillBots then lobby→ordering for all games
- `submitBotOrdersAndProcess(gameId)` — **watchdog**: if timer elapsed and not all submitted, reads `pendingOrders` + falls back to `incomingOrder`, calls `processRound`, writes new state
- `advanceFromSummary(gameId)` — **watchdog**: moves `summary` → `ordering`
- `subscribeToAllGames(callback)` / `subscribeToGame(gameId, callback)` — Realtime
- `autoAssignPlayer(email)` — calls `assign_player_atomic` Postgres RPC

---

## Admin watchdog (added Session 3)

**What it does:** Ensures games always complete even when all player browsers close.

**Location:** `app/admin/page.tsx` — `useEffect` with 5-second `setInterval`.

**Logic:**
- Scans all games in `ordering` or `summary` phase every 5 seconds
- `ordering`: calls `submitBotOrdersAndProcess` — self-guards (exits if timer not elapsed, all already submitted, or game paused)
- `summary`: tracks first-seen time via `useRef<Map<string, number>>`; calls `advanceFromSummary` after 14 seconds
- Shows pulsing green **"Watchdog active"** badge in admin header when active games exist
- No Supabase schema changes required — uses existing `games` table

**Requirement:** Admin page must be open in at least one browser tab for the watchdog to run.

---

## `pendingOrders` pattern

The `pendingOrders` field is an implicit JSONB field on game state (not declared in the TypeScript `GameState` interface). It accumulates submitted orders during a round:

```typescript
// Player submits order:
const storedOrders = ((state as any).pendingOrders ?? {}) as Partial<Record<Role, number>>;
const mergedOrders = { ...storedOrders, [role]: myOrder };
// If all 4 roles submitted → call processRound, then delete pendingOrders
// Otherwise → save state with pendingOrders: mergedOrders

// Watchdog reads pendingOrders + fills missing roles with incomingOrder fallback:
finalOrders[role] = storedOrders[role] !== undefined
  ? storedOrders[role]!
  : state.roles[role]?.incomingOrder ?? 0;
```

---

## Tutorial (`public/tutorial.html`)

- 62-second animated tutorial, 6 slides, 1280×720 canvas
- **Mobile:** CSS `transform: scale()` via `scaleToFit()` JS — scales body to fit any screen
- **Important:** `#overlay` and `#progress` use `position:absolute` not `position:fixed` — fixed elements inside CSS-transformed parents lose viewport-relative positioning
- Pause/resume: `togglePause()` tracks `totalPaused` ms; `tick()` subtracts from elapsed
- Shown via `TutorialModal.tsx` (full-screen iframe) auto-shown in lobby; replay button on results

---

## Critical technical patterns

| Pattern | Detail |
|---------|--------|
| **Windows mount truncation** | Python/bash writes to files >~100 lines can silently truncate. Always verify line count after write. Use `git show HEAD:path` to recover missing tail. |
| **CSS transform + position:fixed** | Fixed elements inside CSS-transformed parent break — use `position:absolute` instead. |
| **Supabase Realtime** | Use `submittedRoundRef` to track submitted round; reset `submitted` state only when round number changes, not on every peer update. |
| **Git push** | From PowerShell only — bash git commands fail on Windows mount. If `index.lock` error: `Remove-Item .git\index.lock -Force` |
| **Vercel TS** | Stricter than local `tsc`; let Vercel build be source of truth for type errors. |
| **GitHub repo** | Must remain **public** for Vercel Hobby plan to auto-deploy (private repo blocks non-owner deploys). |

---

## Confirmed working (verified June 2026)

All features below were tested and confirmed working by the user at end of Session 3:

| Feature | Status |
|---------|--------|
| Tutorial plays correctly on mobile | ✅ Confirmed |
| Tutorial pause/resume button | ✅ Confirmed |
| Vercel auto-deploy on push to master | ✅ Confirmed (repo is public) |
| Admin watchdog auto-advances games when all browser tabs close | ✅ Confirmed — game ran 20 rounds to completion with tab inactive but computer on |

> **Note on watchdog:** The watchdog runs in the admin browser tab. It does NOT need the player tabs to be open — just the admin page. The game ran all 20 rounds unattended, confirming bots correctly fill in missing orders each round and summary phases auto-advance after 14 seconds.

---

## All sessions summary

### Session 1 — Core game
- Next.js 15 App Router scaffold, Tailwind, Supabase
- Types, game logic (`processRound`, FIFO expiry), `createInitialGameState`
- Player game page: timer, submit, summary, results
- Admin overview: start/delete all, leaderboard, config editor
- Per-game admin: 4 roles + SVG performance charts
- Bot auto-fill on game start
- Atomic sign-in RPC (`assign_player_atomic`) to prevent race conditions on simultaneous joins

### Session 2 — Bug fixes + tutorial
- Fixed: round going past `totalRounds` (21/20 bug)
- Fixed: duplicate team names
- Fixed: stale `roundStartedAt` causing immediate re-fire + submit race → `submittedRoundRef` pattern
- 62s animated tutorial (`public/tutorial.html`)
- `TutorialModal.tsx` — full-screen iframe, auto-shown in lobby; "Replay Tutorial" on results

### Session 3 — Mobile + deployment + watchdog (this session)
- Tutorial mobile responsiveness: `scaleToFit()` CSS transform + `position:absolute` fix
- Pause/resume button in tutorial (matching Beer Game pattern)
- Fixed Vercel deployment blocked (private repo → made public)
- Deleted duplicate `cake-game-chi` Vercel project (kept `cake-game-6o4q` as primary)
- **Admin watchdog**: ensures games always complete once started — `submitBotOrdersAndProcess` + `advanceFromSummary` in `supabase.ts`; 5-second watchdog `useEffect` in admin page

---

## Pending work

- [x] ~~Verify tutorial plays correctly on mobile~~ ✅ confirmed June 2026
- [x] ~~Tutorial pause/resume~~ ✅ confirmed June 2026
- [x] ~~Watchdog auto-completes games when tabs close~~ ✅ confirmed June 2026
- [ ] Set `NEXT_PUBLIC_ADMIN_PASSWORD` env var in Vercel dashboard (currently uses fallback `cakegame2024`)
- [ ] Results export — CSV/Excel per team after game ends
- [ ] Observer mode — non-players watch all roles live
- [ ] Deploy Beer Game to Firebase
