# Cake Game — Handoff & Checkpoint

## Current checkpoint — v2 + mobile tutorial fix

| Item | Value |
|------|-------|
| **Git tag** | `v2` — stable baseline before mobile work |
| **Latest commit** | `06e7ebe` — fix: restore truncated startVideo function in tutorial.html |
| **Branch** | `master` |
| **GitHub** | https://github.com/NarasimhaKamathB/Cake-game (private) |
| **Git email** | narasimha.kamath@gmail.com |
| **Vercel (primary)** | https://cake-game-6o4q.vercel.app |
| **Vercel (secondary)** | https://cake-game-chi.vercel.app |
| **Both Vercel projects** | Auto-deploy on push to master |
| **Admin password** | `cakegame2024` |
| **Supabase** | https://dsvkoblqthopectuyrhn.supabase.co (Cake-game, Mumbai) |
| **Date** | June 2026 |

---

## Restore to v2 clean baseline

```powershell
cd C:\Users\narasimha.kamath\Documents\git\o9.Involve\cakegame
git fetch origin
git checkout master
git reset --hard v2
git clean -fd
git status   # should show: nothing to commit, working tree clean
```

---

## What was done in this session (post v2)

1. **Tutorial mobile responsiveness** (`public/tutorial.html` + `components/TutorialModal.tsx`)
   - Added `<meta name="viewport">` to tutorial.html
   - Added `scaleToFit()` JS: scales 1280×720 body to fit any screen via CSS transform
   - Changed `#overlay` and `#progress` from `position:fixed` to `position:absolute` (fixes click hit-testing inside CSS-transformed parent)
   - TutorialModal.tsx header: compact on mobile (`sm:` responsive classes)
   - **Bug found & fixed**: Python write truncated tutorial.html, removing `startVideo()` — restored from `git show v2:public/tutorial.html`

2. **Vercel**: both `cake-game-6o4q` and `cake-game-chi` projects are connected to the same GitHub repo and both auto-deploy on push. Use `cake-game-6o4q` as primary.

---

## What the game is

A **perishable supply chain simulation** (Next.js 15 + Supabase). Players auto-assigned to 4-person teams (Manufacturer / Distributor / Wholesaler / Retailer). Each round they order stock from upstream; cakes expire after 3 rounds. Costs: $4/unit lost sales · $2/unit wastage · $0.50/unit/week holding. Lowest total cost wins after 20 rounds.

---

## Architecture

```
cakegame/
├── app/
│   ├── page.tsx                       # Login (email → auto-assign)
│   ├── assigned/page.tsx              # Lobby — shows tutorial modal on load
│   ├── game/[gameId]/page.tsx         # Main player game UI (timer, submit, summary)
│   └── admin/
│       ├── page.tsx                   # Admin overview + config editor + leaderboard
│       └── game/[gameId]/page.tsx     # Per-game admin watch/control + SVG charts
├── components/
│   ├── TutorialModal.tsx              # Full-screen iframe modal (responsive)
│   ├── GameResults.tsx                # End-of-game results + "Replay Tutorial" button
│   ├── InventoryBuckets.tsx           # FIFO shelf-life display (3 slots)
│   ├── RolePanel.tsx                  # Per-role inventory/demand panel
│   └── WeeklySummary.tsx              # Round summary (own role only)
├── public/
│   └── tutorial.html                  # 62s animated tutorial (6 slides, scale-to-fit)
├── lib/
│   ├── types.ts                       # All TypeScript types + DEFAULT_CONFIG
│   ├── gameLogic.ts                   # Pure game logic (processRound, FIFO expiry)
│   └── supabase.ts                    # DB calls + Realtime + autoFillBotPlayers
└── supabase/
    ├── schema.sql                     # Full DB schema (run once)
    ├── assign_player_atomic.sql       # Atomic sign-in RPC (run once)
    └── fix_team_number_sequence.sql   # Team-number sequence fix (run once)
```

**Supabase tables:** `games` (JSONB state + players), `session_settings` (config + registration gate)

---

## Key technical patterns

- **Windows mount truncation**: Python/bash writes to files >~100 lines can silently truncate. Always verify line count after write. Use `git show HEAD:path` to recover.
- **CSS transform + position:fixed**: Fixed elements inside a CSS-transformed parent lose viewport-relative positioning — use `position:absolute` instead.
- **Supabase Realtime + submitted state**: Use `submittedRoundRef` to track which round was submitted; only reset on round change, not on every peer update.
- **Git**: Push from PowerShell only — bash shell git commands fail on this setup.
- **Vercel TS**: Stricter than local `tsc --noEmit`; let Vercel build be source of truth.

---

## Pending work

- [ ] Verify tutorial plays correctly on mobile after latest fix (test on real device)
- [ ] Set `NEXT_PUBLIC_ADMIN_PASSWORD` env var in Vercel dashboard (currently using fallback `cakegame2024`)
- [ ] Results export — CSV/Excel per team after game ends
- [ ] Observer mode — non-players watch all roles live
- [ ] Deploy Beer Game to Firebase
