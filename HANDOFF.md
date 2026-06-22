# Cake Game — Handoff & Checkpoint

## Stable checkpoint

| Item | Value |
|------|-------|
| **Git tag** | `checkpoint-v1-stable` |
| **Commit hash** | `fa414cd4d15eb54ec8ac7c9e33c4638eae2c0b27` |
| **Commit message** | fix: immediate auto-submit on alternating rounds (stale timeLeft=0) |
| **Vercel** | Deployed and passing build |
| **Date** | June 2026 |

### Restore to this checkpoint

```powershell
# Hard-reset to the checkpoint (discards uncommitted changes)
git fetch origin
git checkout checkpoint-v1-stable   # detached HEAD — read-only inspect

# OR to reset master back to this commit:
git checkout master
git reset --hard checkpoint-v1-stable
git push origin master --force
```

---

## What the game is

A **perishable supply chain simulation** (Next.js 15 + Supabase). Players are auto-assigned to 4-person teams (Manufacturer / Distributor / Wholesaler / Retailer). Each round they order stock from upstream; cakes expire after 3 weeks. Costs: $4/unit lost sales · $2/unit wastage · $0.50/unit/week holding. The team with the lowest total cost wins after 20 rounds.

---

## Architecture

```
cakegame/
├── app/
│   ├── page.tsx                  # Login (email → auto-assign)
│   ├── assigned/page.tsx         # "You are X on team Y" confirmation
│   ├── game/[gameId]/page.tsx    # Main player game UI  ← most complex
│   └── admin/
│       ├── page.tsx              # Admin overview + config editor
│       └── game/[gameId]/page.tsx # Per-game admin watch/control
├── components/
│   ├── GameResults.tsx           # End-of-game results + charts
│   ├── InventoryBuckets.tsx      # FIFO shelf-life display (3 slots)
│   ├── RolePanel.tsx             # Per-role inventory/demand panel
│   └── WeeklySummary.tsx         # Round summary (own role only)
├── lib/
│   ├── types.ts                  # All TypeScript types + DEFAULT_CONFIG
│   ├── gameLogic.ts              # Pure game logic (processRound etc.)
│   └── supabase.ts               # DB calls + autoAssignPlayer
└── supabase/
    ├── schema.sql                # Full DB schema (run once)
    ├── assign_player_atomic.sql  # Atomic sign-in RPC (run once)
    └── fix_team_number_sequence.sql  # Team-number sequence fix (run once)
```

**Supabase tables:** `games` (JSONB state + players), `session_settings` (config + registration gate)

**Realtime:** Supabase Postgres changes subscription — all clients update live.

---

## Key design decisions

### Game state flow
```
lobby → onboarding → ordering → [processRound] → summary → ordering → ... → ended
```
- `processRound` is a **pure TypeScript function** — no DB calls inside it.
- `currentRound` starts at 0. Display = `currentRound + 1`. After 20 rounds: `currentRound = 20`, `phase = 'ended'`.
- `processRound` sets `roundStartedAt: undefined` (intentional — prevents stale timer leak).
- The **SummaryView** auto-advances after 12 s by reading fresh DB state first (guard against overwriting ended games).

### Inventory
- FIFO buckets with `arrivedRound` tag. 3 slots always shown (zeroed when empty).
- Expiry: `arrivedRound <= currentRound - expiryWeeks` → unit wasted.

### Player assignment
- `assign_player_atomic` Postgres RPC serializes all concurrent logins via `FOR UPDATE` lock on `session_settings`.
- Team numbers use `nextval('team_number_seq')` — unique even under concurrent load.
- First player in a team creates the game row client-side (TypeScript needed for `createInitialGameState`).

---

## Bugs fixed at this checkpoint

### Bug 1 — Round 21/20 (round overflow)
**Root cause:** 4 clients all have SummaryView open. Client A advances to ordering at T+12 s. Round 20 processes → `phase='ended'`. Client B's delayed advance reads the ended state and blindly writes `{phase:'ordering', currentRound:20}` on top of it. Timer fires → `processRound(currentRound=20)` → `currentRound=21`.

**Fix (`app/game/[gameId]/page.tsx` — SummaryView advance effect):**
```typescript
const fresh = await getGame(gameId);
if (!fresh || fresh.state.phase !== 'summary' || fresh.state.currentRound !== game.state.currentRound) return;
await updateGameState(gameId, { phase: 'ordering', roundStartedAt: Date.now() });
```

### Bug 2 — Duplicate team names
**Root cause:** Old RPC used `SELECT COUNT(*) + 1 FROM games` — not atomic. Two concurrent callers got the same count → same team number → same name.

**Fix (`supabase/fix_team_number_sequence.sql`):** Replace with `nextval('team_number_seq')`.

### Bug 3a — Stale `roundStartedAt` → skipped rounds
**Root cause:** `processRound` returns `{ ...state, ... }`. The `...state` spread carried the old `roundStartedAt` (from the ordering phase) into the summary state. A delayed SummaryView client could then write this stale timestamp onto a new ordering phase. `elapsed ≥ 30 s` → `initial = 0` → `handleAutoSubmit` fired immediately.

**Fix (`lib/gameLogic.ts`):**
```typescript
return {
  ...state,
  roundStartedAt: undefined,  // ← clear stale value
  currentRound: newRound,
  ...
};
```

### Bug 3b — Submit stays / player order lost
**Root cause:** Two players submit simultaneously, both read `playersDoneOrdering: []` from stale React state. Each wrote only themselves. Last writer wins → one player's ID and order silently lost. `allDone` never true → round waited 30 s for auto-submit.

**Fix (`app/game/[gameId]/page.tsx` — `handleSubmitOrder`):**
```typescript
const freshGame = await getGame(gameId);  // read DB first, not React state
```

### Bug 4 — Alternating rounds: every other round auto-submits immediately
**Root cause:** After round N's countdown reaches 0, `timeLeft = 0`. Realtime fires for round N+1 ordering and resets `submitted = false`. But `timeLeft` is still 0. The second `useEffect` watching `[timeLeft, submitted, phase]` sees `0 === 0 && !submitted && phase==='ordering'` and fires `handleAutoSubmit` immediately — before the timer even starts.

**Fix (`app/game/[gameId]/page.tsx` — Realtime callback):**
```typescript
if (g?.state.phase === 'ordering') {
  setSubmitted(false);
  autoSubmittedRef.current = false;
  setTimeLeft(g.config?.orderTimerSeconds ?? 30);  // ← reset in same batch
}
```
React batches all three `setState` calls into one render, so the effects see `timeLeft=30` (not 0) when the new ordering phase starts.

---

## Supabase setup (run each SQL file once)

1. `supabase/schema.sql` — creates `games` and `session_settings` tables.
2. `supabase/assign_player_atomic.sql` — creates the atomic sign-in RPC.
3. `supabase/fix_team_number_sequence.sql` — creates `team_number_seq` sequence + updates RPC.

Before each workshop session, optionally reset the team number sequence:
```sql
SELECT setval('team_number_seq', 1, false);
```

---

## Windows mount / file truncation warning

**Critical:** The sandbox writes files via a Linux mount of the Windows filesystem. Files longer than ~100 lines get **silently truncated** when written with the `Write` or `Edit` tools. Symptoms: `Unterminated block comment` or `Unexpected eof` in Vercel build.

**Safe approach for large files:** always use bash heredoc:
```bash
cat > /path/to/file.ts << 'ENDSQL'
...content...
ENDSQL
```
Or: write to `/tmp/` first, verify with `tail -10 /tmp/file`, then `cp /tmp/file /dest/`.

Files affected in this session: `lib/gameLogic.ts` (290 lines), `app/game/[gameId]/page.tsx` (444 lines).

---

## Known limitations / future work

- **playersDoneOrdering race** is reduced but not fully atomic — a Postgres RPC `submit_player_order` would eliminate it completely. Current fix (fresh DB read) narrows the window to < 10 ms.
- **SummaryView advance race** is reduced but not atomic — a server-side conditional update would be perfect. Current fix (read-then-guard) is safe for typical network latency.
- **Observer mode** — not yet built. Admin can watch via `/admin/game/[gameId]`.
- **Results export** (CSV/Excel) — not yet built.
- **Beer Game** — separate Firebase project, not yet deployed.

---

## Environment variables (Vercel + local `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ADMIN_PASSWORD=...  (used in admin login)
```

---

## Pending PowerShell steps after any edit session

Because the git `index.lock` sometimes persists on the Windows mount, commits must be run from PowerShell:

```powershell
cd C:\Users\narasimha.kamath\Documents\git\o9.Involve\cakegame
Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
git add -A
git commit -m "your message"
git push origin master
```
