'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getGame, subscribeToGame, updateGameState, updateFullGameState } from '@/lib/supabase';
import { processRound } from '@/lib/gameLogic';
import { Game, ROLES, ROLE_LABELS, Role, GameState } from '@/lib/types';
import { RolePanel } from '@/components/RolePanel';
import { WeeklySummary } from '@/components/WeeklySummary';
import { GameResults } from '@/components/GameResults';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export default function AdminGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    getGame(gameId).then(g => { if (g) setGame(g); });
    const unsub = subscribeToGame(gameId, g => { if (g) setGame(g); });
    return unsub;
  }, [gameId]);

  if (!game) {
    return (
      <div className="text-center mt-20 text-gray-400">
        <div className="text-4xl mb-3">⏳</div>
        <p>Loading game...</p>
      </div>
    );
  }

  const { state, config } = game;
  const players = Object.values(game.players);
  const doneCount = state.playersDoneOrdering?.length ?? 0;
  const playerCount = players.length;
  const teamName = players[0]?.teamName ?? gameId;

  async function handleAdvance() {
    setAdvancing(true);
    try {
      if (state.phase === 'ordering') {
        // Force-process round with current pending orders (fill missing with 0)
        const stored = (state as GameState & { pendingOrders?: Record<Role, number> }).pendingOrders ?? {};
        const orders: Record<Role, number> = {
          retailer: stored.retailer ?? 0,
          wholesaler: stored.wholesaler ?? 0,
          distributor: stored.distributor ?? 0,
          manufacturer: stored.manufacturer ?? 0,
        };
        const newState = processRound(state, config, orders);
        await updateFullGameState(gameId, newState);
      } else if (state.phase === 'summary') {
        if (state.currentRound >= config.totalRounds) {
          await updateGameState(gameId, { phase: 'ended' });
        } else {
          await updateGameState(gameId, { phase: 'ordering' });
        }
      }
    } finally {
      setAdvancing(false);
    }
  }

  async function handleEnd() {
    await updateGameState(gameId, { phase: 'ended' });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <a href="/admin" className="text-xs text-cake-500 hover:underline">← Back to Admin</a>
          <h2 className="text-2xl font-bold text-gray-800 mt-1">{teamName}</h2>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={
              state.phase === 'ordering' ? 'warning' :
              state.phase === 'summary' ? 'default' :
              state.phase === 'ended' ? 'success' : 'info'
            }>
              {state.phase}
            </Badge>
            <span className="text-sm text-gray-500">
              Round {state.currentRound} / {config.totalRounds}
            </span>
            {state.phase === 'ordering' && (
              <span className="text-sm text-amber-600">
                {doneCount}/{playerCount} players submitted
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {state.phase === 'ordering' && (
            <Button onClick={handleAdvance} disabled={advancing} variant="ghost">
              ⏩ Force Process Round
            </Button>
          )}
          {state.phase === 'summary' && (
            <Button onClick={handleAdvance} disabled={advancing}>
              {state.currentRound >= config.totalRounds ? 'End Game →' : `Start Round ${state.currentRound + 1} →`}
            </Button>
          )}
          {state.phase === 'ordering' && (
            <Button onClick={handleEnd} disabled={advancing} variant="danger" size="sm">
              End Game
            </Button>
          )}
        </div>
      </div>

      {/* Live cost ticker */}
      {state.currentRound > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {ROLES.map(role => {
            const rs = state.roles[role];
            const totalWasted = (rs?.wastageHistory ?? []).reduce((s: number, v: number) => s + v, 0);
            return (
              <Card key={role} className="text-center py-3">
                <p className="text-xs text-gray-400">{ROLE_LABELS[role]}</p>
                <p className="text-xl font-bold text-cake-700">${rs?.totalCost.toFixed(2)}</p>
                <p className="text-xs text-red-500">{totalWasted} wasted</p>
                <p className="text-xs text-amber-500">
                  {(rs?.lostSalesHistory ?? []).reduce((s: number, v: number) => s + v, 0)} lost
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Game phases */}
      {state.phase === 'ended' && <GameResults game={game} />}

      {state.phase === 'summary' && <WeeklySummary state={state} config={config} />}

      {(state.phase === 'ordering' || state.phase === 'processing') && (
        <>
          {/* All 4 role panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map(role => {
              const rs = state.roles[role];
              if (!rs) return null;
              const player = players.find(p => p.role === role);
              return (
                <div key={role}>
                  <p className="text-xs text-gray-400 mb-1 ml-1">
                    {player ? `👤 ${player.name}` : '⏳ Waiting for player'}
                    {state.playersDoneOrdering?.includes(player?.id ?? '') && (
                      <span className="ml-2 text-green-600 font-semibold">✓ Submitted</span>
                    )}
                  </p>
                  <RolePanel
                    role={role}
                    rs={rs}
                    config={config}
                    currentRound={state.currentRound}
                    isOwnRole={false}
                  />
                </div>
              );
            })}
          </div>

          {/* Order submission progress */}
          <Card className="bg-gray-50">
            <p className="text-sm font-semibold text-gray-600 mb-3">Order submission status</p>
            <div className="flex gap-4">
              {ROLES.map(role => {
                const player = players.find(p => p.role === role);
                const done = player && state.playersDoneOrdering?.includes(player.id);
                return (
                  <div key={role} className={`flex-1 rounded-lg p-3 text-center text-xs ${done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    <p className="font-semibold">{ROLE_LABELS[role]}</p>
                    <p>{done ? '✓ Done' : '⏳ Pending'}</p>
                    <p className="text-gray-400 mt-0.5">{player?.name ?? '—'}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {(state.phase === 'lobby' || state.phase === 'onboarding') && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">🏁</p>
          <p>Game hasn&apos;t started yet.</p>
          <Button className="mt-4" onClick={async () => {
            await updateGameState(gameId, { phase: 'ordering' });
          }}>
            Start Game
          </Button>
        </div>
      )}
    </div>
  );
}
