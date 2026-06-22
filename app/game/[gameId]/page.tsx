'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { subscribeToGame, getGame, updateGameState, updateFullGameState } from '@/lib/supabase';
import { processRound } from '@/lib/gameLogic';
import {
  Game, Role, ROLES, ROLE_LABELS, GameState,
} from '@/lib/types';
import { RolePanel } from '@/components/RolePanel';
import { WeeklySummary } from '@/components/WeeklySummary';
import { GameResults } from '@/components/GameResults';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// How long the summary screen is shown before auto-advancing to next round (seconds)
const SUMMARY_HOLD_SECONDS = 12;

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();

  const [game, setGame]           = useState<Game | null>(null);
  const [myRole, setMyRole]       = useState<Role | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [order, setOrder]         = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft]   = useState<number>(30);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    const role = sessionStorage.getItem('role') as Role | null;
    const playerId = sessionStorage.getItem('playerId') ?? '';
    setMyRole(role);
    setMyPlayerId(playerId);
  }, []);

  useEffect(() => {
    if (!gameId) return;
    getGame(gameId).then(g => { if (g) setGame(g); });
    const unsub = subscribeToGame(gameId, g => {
      if (g) setGame(g);
      if (g?.state.phase === 'ordering') {
        setSubmitted(false);
        autoSubmittedRef.current = false;
      }
    });
    return unsub;
  }, [gameId]);

  // ── 30-second order timer ───────────────────────────────────────────────────
  const handleAutoSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;

    // Fetch fresh game state to avoid stale-closure races
    const freshGame = await getGame(gameId);
    if (!freshGame || freshGame.state.phase !== 'ordering') return;

    const storedOrders = (
      (freshGame.state as GameState & { pendingOrders?: Partial<Record<Role, number>> })
        .pendingOrders ?? {}
    ) as Partial<Record<Role, number>>;

    // Build full order set: already-stored first, then rational fill (= incoming demand)
    const finalOrders: Record<Role, number> = {
      retailer: 0, wholesaler: 0, distributor: 0, manufacturer: 0,
    };
    for (const role of ROLES) {
      finalOrders[role] =
        storedOrders[role] !== undefined
          ? (storedOrders[role] as number)
          : (freshGame.state.roles[role]?.incomingOrder ?? 0);
    }
    // Override with what this player has typed (even if not yet stored)
    const myRoleLocal = sessionStorage.getItem('role') as Role | null;
    if (myRoleLocal && storedOrders[myRoleLocal] === undefined) {
      setOrder(prev => {
        finalOrders[myRoleLocal] = prev;
        return prev;
      });
    }

    const newState = processRound(freshGame.state, freshGame.config, finalOrders);
    // Clear pending orders field
    delete (newState as GameState & { pendingOrders?: unknown }).pendingOrders;
    // Set roundStartedAt for the next ordering phase (processed by processRound → summary,
    // so this field on newState won't conflict)
    await updateFullGameState(gameId, newState);
    setSubmitted(true);
  }, [gameId]);

  // Start/reset countdown each time the ordering phase begins (or paused state changes)
  useEffect(() => {
    if (!game || game.state.phase !== 'ordering') return;

    const timerSeconds = game.config.orderTimerSeconds ?? 30;

    // Frozen while paused — show remaining time but don't count down
    if (game.state.paused) {
      const startedAt = game.state.roundStartedAt ?? Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setTimeLeft(Math.max(0, timerSeconds - elapsed));
      return;
    }

    // Derive remaining time from server-stamped roundStartedAt when available
    const startedAt = game.state.roundStartedAt ?? Date.now();
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const initial = Math.max(0, timerSeconds - elapsed);

    setTimeLeft(initial);

    if (initial === 0 && !submitted) {
      handleAutoSubmit();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // Re-run when round advances, phase changes, paused state changes, or roundStartedAt shifts (resume)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.state.phase, game?.state.currentRound, game?.state.paused, game?.state.roundStartedAt]);

  // Auto-submit when timer hits zero and not yet submitted (only when not paused)
  useEffect(() => {
    if (timeLeft === 0 && !submitted && game?.state.phase === 'ordering' && !game?.state.paused) {
      handleAutoSubmit();
    }
  }, [timeLeft, submitted, game?.state.phase, game?.state.paused, handleAutoSubmit]);

  // ── Manual order submission ─────────────────────────────────────────────────
  const handleSubmitOrder = useCallback(async () => {
    if (!game || !myRole || submitted) return;
    setSubmitting(true);

    try {
      // Read fresh state first — avoids the playersDoneOrdering race where two
      // players submit simultaneously, both read [] from stale React state, and
      // each write only themselves (last writer wins, one ID silently lost).
      const freshGame = await getGame(gameId);
      if (!freshGame || freshGame.state.phase !== 'ordering') {
        // Phase changed underneath us (e.g. auto-submit already fired) — just mark done
        setSubmitted(true);
        return;
      }

      const playersDone = [...(freshGame.state.playersDoneOrdering ?? [])];
      if (!playersDone.includes(myPlayerId)) playersDone.push(myPlayerId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storedOrders = ((freshGame.state as any).pendingOrders ?? {}) as Partial<Record<Role, number>>;
      const mergedOrders: Record<Role, number> = {
        retailer: 0, wholesaler: 0, distributor: 0, manufacturer: 0,
        ...storedOrders,
        [myRole]: order,
      };

      // Check if all players have now submitted
      const allPlayerIds = Object.keys(freshGame.players);
      const allDone = allPlayerIds.every(id => playersDone.includes(id));

      if (allDone) {
        // Fill any remaining roles as a safe fallback
        for (const role of ROLES) {
          if (mergedOrders[role] === 0 && !storedOrders[role]) {
            mergedOrders[role] = freshGame.state.roles[role]?.incomingOrder ?? 0;
          }
        }
        const newState = processRound(freshGame.state, freshGame.config, mergedOrders);
        delete (newState as GameState & { pendingOrders?: unknown }).pendingOrders;
        await updateFullGameState(gameId, newState);
      } else {
        await updateGameState(gameId, {
          playersDoneOrdering: playersDone,
          // @ts-expect-error temporary field
          pendingOrders: mergedOrders,
        });
      }

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [game, myRole, myPlayerId, order, submitted, gameId]);

  // ── Loading / lobby states ──────────────────────────────────────────────────
  if (!game) {
    return (
      <div className="text-center mt-20 text-gray-400">
        <div className="text-4xl mb-3">⏳</div>
        <p>Loading game...</p>
      </div>
    );
  }

  const { state, config } = game;

  if (state.phase === 'ended') return <GameResults game={game} />;

  if (state.phase === 'summary') {
    return (
      <SummaryView
        game={game}
        gameId={gameId}
        myRole={myRole}
      />
    );
  }

  if (state.phase === 'lobby' || state.phase === 'onboarding') {
    return (
      <div className="text-center mt-20 text-gray-400">
        <p className="text-lg">⏳ Waiting for the facilitator to start the game...</p>
      </div>
    );
  }

  // ── Ordering phase ──────────────────────────────────────────────────────────
  const myRs = myRole ? state.roles[myRole] : null;
  const playerCount = Object.keys(game.players).length;
  const doneCount = state.playersDoneOrdering?.length ?? 0;
  const timerSeconds = config.orderTimerSeconds ?? 30;

  // Timer colour: red < 10s, amber < 20s, green otherwise
  const timerColor =
    timeLeft <= 10 ? 'text-red-600' :
    timeLeft <= 20 ? 'text-amber-600' :
    'text-green-600';

  return (
    <div className="space-y-4">
      {/* ── Pause banner ── */}
      {state.paused && (
        <div className="bg-amber-100 border border-amber-300 rounded-2xl px-6 py-3 flex items-center gap-3 text-amber-800 shadow">
          <span className="text-2xl">⏸</span>
          <div>
            <p className="font-bold text-base">Game Paused</p>
            <p className="text-xs opacity-75">The facilitator has paused the game. Your timer is frozen — please wait.</p>
          </div>
        </div>
      )}

      {/* ── Prominent round banner ── */}
      <div className="bg-cake-600 text-white rounded-2xl px-6 py-4 flex items-center justify-between shadow">
        <div>
          <p className="text-xs opacity-75 uppercase tracking-wide">Current Round</p>
          <p className="text-3xl font-extrabold leading-none">
            {state.currentRound + 1}
            <span className="text-base font-normal opacity-60"> / {config.totalRounds}</span>
          </p>
        </div>
        {myRole && (
          <div className="text-right">
            <p className="text-xs opacity-75">Your Role</p>
            <p className="text-lg font-bold">{ROLE_LABELS[myRole]}</p>
          </div>
        )}
        {/* Timer */}
        {!submitted && (
          <div className="text-right">
            <p className="text-xs opacity-75">{state.paused ? 'Timer frozen' : 'Auto-submit in'}</p>
            <p className={`text-3xl font-extrabold leading-none ${
              state.paused ? 'text-amber-300' :
              timeLeft <= 10 ? 'text-red-300 animate-pulse' :
              timeLeft <= 20 ? 'text-amber-300' :
              'text-white'
            }`}>
              {state.paused ? '⏸' : `${timeLeft}s`}
            </p>
          </div>
        )}
        {submitted && (
          <Badge variant="success">✓ Submitted</Badge>
        )}
      </div>

      {/* Submission progress */}
      <p className="text-xs text-center text-gray-400">
        {doneCount}/{playerCount} players submitted
        {submitted && !autoSubmittedRef.current && ' — waiting for others...'}
      </p>

      {/* Role panel — player sees only their own echelon */}
      {myRole && state.roles[myRole] && (
        <RolePanel
          role={myRole}
          rs={state.roles[myRole]}
          config={config}
          currentRound={state.currentRound}
          isOwnRole={true}
        />
      )}
      {!myRole && (
        // Observer fallback — show all roles
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLES.map(role => {
            const rs = state.roles[role];
            if (!rs) return null;
            return (
              <RolePanel
                key={role}
                role={role}
                rs={rs}
                config={config}
                currentRound={state.currentRound}
                isOwnRole={false}
              />
            );
          })}
        </div>
      )}

      {/* Order input */}
      {myRole && myRs && !submitted && (
        <Card className="border-cake-300 bg-cake-50">
          <h3 className="font-semibold text-cake-700 mb-1">
            Place your order — {ROLE_LABELS[myRole]}
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Current inventory: <strong>{myRs.totalInventory}</strong> units &nbsp;|&nbsp;
            Demand this round: <strong>{myRs.incomingOrder}</strong> units &nbsp;|&nbsp;
            Shelf life: <strong>{config.expiryWeeks} rounds</strong>
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={999}
              value={order}
              onChange={e => setOrder(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 border border-cake-300 rounded-lg px-3 py-2 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-cake-400"
            />
            <span className="text-sm text-gray-500">units to order from upstream</span>
            <Button onClick={handleSubmitOrder} disabled={submitting} className="ml-auto">
              {submitting ? 'Submitting...' : 'Submit Order'}
            </Button>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            {state.paused
              ? '⏸ Game is paused — timer is frozen. Submit your order when the game resumes.'
              : `⚠️ Auto-submits in `}
            {!state.paused && <strong className={timerColor}>{timeLeft}s</strong>}
            {!state.paused && ` if no order placed.`}
            {` Any inventory older than ${config.expiryWeeks} rounds will expire ($${config.wastageCostPerUnit}/unit).`}
          </p>
        </Card>
      )}

      {submitted && (
        <div className="text-center py-4 text-gray-500 text-sm">
          ✓ Order submitted — waiting for round to complete ({doneCount}/{playerCount})...
        </div>
      )}
    </div>
  );
}

// ─── Summary view (between rounds) ───────────────────────────────────────────

function SummaryView({
  game,
  gameId,
  myRole,
}: {
  game: Game;
  gameId: string;
  myRole: Role | null;
}) {
  const [countdown, setCountdown] = useState(SUMMARY_HOLD_SECONDS);
  const advancedRef = useRef(false);

  const isLastRound = game.state.currentRound >= game.config.totalRounds;

  // Auto-advance to next ordering round after SUMMARY_HOLD_SECONDS
  useEffect(() => {
    if (isLastRound) return; // don't auto-advance on final round; show results button instead

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLastRound, game.state.currentRound]);

  // When countdown reaches 0, advance (first caller wins; subsequent calls are no-ops).
  // Guard: re-read fresh DB state before writing so a delayed client never overwrites
  // an already-ended game (Bug 1: Round 21/20) or a game that already advanced
  // (Bug 3a: stale roundStartedAt → immediate auto-submit on next round).
  useEffect(() => {
    if (countdown === 0 && !advancedRef.current && !isLastRound) {
      advancedRef.current = true;
      (async () => {
        const fresh = await getGame(gameId);
        // Only advance if STILL in summary AND on the same round we mounted for
        if (
          !fresh ||
          fresh.state.phase !== 'summary' ||
          fresh.state.currentRound !== game.state.currentRound
        ) return;
        await updateGameState(gameId, { phase: 'ordering', roundStartedAt: Date.now() });
      })();
    }
  }, [countdown, isLastRound, gameId, game.state.currentRound]);

  return (
    <div className="space-y-6">
      {/* Round banner */}
      <div className="bg-cake-600 text-white rounded-2xl px-6 py-3 flex items-center justify-between">
          <p className="text-xs opacity-75 uppercase tracking-wide">Round Completed</p>
          <p className="text-2xl font-extrabold">
            {game.state.currentRound}
            <span className="text-sm font-normal opacity-60"> / {game.config.totalRounds}</span>
          </p>
        </div>
        {!isLastRound && (
          <div className="text-right">
            <p className="text-xs opacity-75">Next round in</p>
            <p className={`text-3xl font-extrabold ${countdown <= 5 ? 'animate-pulse' : ''}`}>
              {countdown}s
            </p>
          </div>
        )}
      </div>

      <WeeklySummary state={game.state} config={game.config} myRole={myRole} />

      {isLastRound && (
        <div className="flex justify-center">
          <Button
            onClick={async () => {
              await updateGameState(gameId, { phase: 'ended' });
            }}
            size="lg"
          >
            View Final Results →
          </Button>
        </div>
      )}
    </div>
  );
}
