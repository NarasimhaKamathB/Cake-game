'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { subscribeToGame, updateGameState, updateFullGameState } from '@/lib/supabase';
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

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();

  const [game, setGame] = useState<Game | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [order, setOrder] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const role = sessionStorage.getItem('role') as Role | null;
    const playerId = sessionStorage.getItem('playerId') ?? '';
    setMyRole(role);
    setMyPlayerId(playerId);
  }, []);

  useEffect(() => {
    if (!gameId) return;
    const unsub = subscribeToGame(gameId, g => {
      setGame(g);
      // Reset submission state when a new ordering round starts
      if (g?.state.phase === 'ordering') setSubmitted(false);
    });
    return unsub;
  }, [gameId]);

  const handleSubmitOrder = useCallback(async () => {
    if (!game || !myRole || submitted) return;
    setSubmitting(true);

    try {
      // Mark this player as done ordering
      const playersDone = [...(game.state.playersDoneOrdering ?? [])];
      if (!playersDone.includes(myPlayerId)) playersDone.push(myPlayerId);

      // Collect orders — use 0 as a placeholder for roles not yet submitted
      const playerRoles: Record<string, Role> = {};
      Object.values(game.players).forEach(p => { if (p.role) playerRoles[p.id] = p.role as Role; });

      const pendingOrders: Record<Role, number> = {
        retailer: 0, wholesaler: 0, distributor: 0, manufacturer: 0,
      };

      // Read any previously stored per-role orders from state (we'll store them in a temp field)
      const storedOrders = (game.state as GameState & { pendingOrders?: Record<Role, number> }).pendingOrders ?? {};
      const mergedOrders = { ...pendingOrders, ...storedOrders, [myRole]: order };

      const allRolesPresent = ROLES.every(r =>
        Object.values(game.players).some(p => p.role === r),
      );
      const allDone = allRolesPresent
        ? playersDone.length >= Object.keys(game.players).length
        : playersDone.length >= Object.keys(game.players).length;

      if (allDone) {
        // Process the round
        const newState = processRound(game.state, game.config, mergedOrders);
        // Clear pending orders
        delete (newState as GameState & { pendingOrders?: Record<Role, number> }).pendingOrders;
        await updateFullGameState(gameId, newState);
      } else {
        // Store this player's order and mark as done
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

  if (!game) {
    return (
      <div className="text-center mt-20 text-gray-400">
        <div className="text-4xl mb-3">⏳</div>
        <p>Loading game...</p>
      </div>
    );
  }

  const { state, config } = game;

  if (state.phase === 'ended') {
    return <GameResults game={game} />;
  }

  if (state.phase === 'summary') {
    return <SummaryView game={game} gameId={gameId} isAdmin={false} />;
  }

  if (state.phase === 'lobby' || state.phase === 'onboarding') {
    return (
      <div className="text-center mt-20 text-gray-400">
        <p className="text-lg">⏳ Waiting for the facilitator to start the game...</p>
      </div>
    );
  }

  // Ordering phase
  const myRs = myRole ? state.roles[myRole] : null;
  const playerCount = Object.keys(game.players).length;
  const doneCount = state.playersDoneOrdering?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">
            Round {state.currentRound + 1} / {config.totalRounds}
          </h2>
          <p className="text-sm text-gray-500">
            {submitted
              ? `Waiting for others... (${doneCount}/${playerCount} submitted)`
              : myRole ? `You are: ${ROLE_LABELS[myRole]}` : 'Observer view'}
          </p>
        </div>
        <Badge variant={submitted ? 'success' : 'warning'}>
          {submitted ? '✓ Order submitted' : 'Place your order'}
        </Badge>
      </div>

      {/* Role panels */}
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
              isOwnRole={role === myRole}
            />
          );
        })}
      </div>

      {/* Order input */}
      {myRole && myRs && !submitted && (
        <Card className="border-cake-300 bg-cake-50">
          <h3 className="font-semibold text-cake-700 mb-1">Place your order — {ROLE_LABELS[myRole]}</h3>
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
            ⚠️ Remember: any inventory older than {config.expiryWeeks} rounds will expire and cost ${config.wastageCostPerUnit}/unit.
          </p>
        </Card>
      )}

      {submitted && (
        <div className="text-center py-4 text-gray-500 text-sm animate-pulse">
          ✓ Order submitted — waiting for all players ({doneCount}/{playerCount})...
        </div>
      )}
    </div>
  );
}

// ─── Summary view (between rounds) ───────────────────────────────────────────

function SummaryView({ game, gameId, isAdmin }: { game: Game; gameId: string; isAdmin: boolean }) {
  const [advancing, setAdvancing] = useState(false);
  const router = useRouter();

  async function handleNext() {
    setAdvancing(true);
    try {
      if (game.state.currentRound >= game.config.totalRounds) {
        await updateGameState(gameId, { phase: 'ended' });
      } else {
        await updateGameState(gameId, { phase: 'ordering' });
      }
    } finally {
      setAdvancing(false);
    }
  }

  const canAdvance = isAdmin || true; // any player can advance for now; lock to admin if desired

  return (
    <div className="space-y-6">
      <WeeklySummary state={game.state} config={game.config} />
      {canAdvance && game.state.currentRound < game.config.totalRounds && (
        <div className="flex justify-center">
          <Button onClick={handleNext} disabled={advancing} size="lg">
            {advancing ? 'Loading...' : `Start Round ${game.state.currentRound + 1} →`}
          </Button>
        </div>
      )}
      {game.state.currentRound >= game.config.totalRounds && (
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
