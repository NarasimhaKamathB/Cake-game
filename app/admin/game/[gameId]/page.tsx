'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getGame, subscribeToGame, updateGameState, updateFullGameState } from '@/lib/supabase';
import { processRound } from '@/lib/gameLogic';
import { Game, ROLES, ROLE_LABELS, Role, RoleState, GameState } from '@/lib/types';
import { RolePanel } from '@/components/RolePanel';
import { WeeklySummary } from '@/components/WeeklySummary';
import { GameResults } from '@/components/GameResults';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

// ─── Colour palette per role ──────────────────────────────────────────────────

const ROLE_COLORS: Record<Role, string> = {
  manufacturer: '#7C3AED',
  distributor:  '#2563EB',
  wholesaler:   '#059669',
  retailer:     '#D97706',
};

// ─── SVG line chart ───────────────────────────────────────────────────────────

function toArr(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (v && typeof v === 'object') return Object.values(v) as number[];
  return [];
}

function LineChart({
  title,
  series,
}: {
  title: string;
  series: { role: Role; values: number[] }[];
}) {
  const W = 500, H = 160;
  const pl = 38, pr = 12, pt = 12, pb = 38;
  const chartW = W - pl - pr;
  const chartH = H - pt - pb;

  const maxLen = Math.max(...series.map(s => s.values.length), 2);
  const allVals = series.flatMap(s => s.values);
  const maxVal = Math.max(...allVals, 1);

  const xOf = (i: number) =>
    pl + (maxLen <= 1 ? chartW / 2 : (i / (maxLen - 1)) * chartW);
  const yOf = (v: number) =>
    pt + chartH - (v / maxVal) * chartH;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const xStep = Math.max(1, Math.ceil(maxLen / 8));
  const xTicks = Array.from({ length: maxLen }, (_, i) => i).filter(
    i => i % xStep === 0 || i === maxLen - 1,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-600 mb-1">{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Horizontal grid */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={pl} y1={yOf(tick)} x2={pl + chartW} y2={yOf(tick)}
              stroke="#f0f0f0" strokeWidth="1"
            />
            <text x={pl - 4} y={yOf(tick) + 3} textAnchor="end" fontSize="9" fill="#aaa">
              {tick}
            </text>
          </g>
        ))}
        {/* Axes */}
        <line x1={pl} y1={pt} x2={pl} y2={pt + chartH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={pl} y1={pt + chartH} x2={pl + chartW} y2={pt + chartH} stroke="#e5e7eb" strokeWidth="1" />
        {/* X labels */}
        {xTicks.map(i => (
          <text key={i} x={xOf(i)} y={pt + chartH + 13} textAnchor="middle" fontSize="9" fill="#aaa">
            W{i + 1}
          </text>
        ))}
        {/* Lines */}
        {series.map(({ role, values }) => {
          if (values.length === 0) return null;
          if (values.length === 1) {
            return (
              <circle
                key={role}
                cx={xOf(0)} cy={yOf(values[0])} r="3"
                fill={ROLE_COLORS[role]}
              />
            );
          }
          const d = values
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={role}
              d={d}
              stroke={ROLE_COLORS[role]}
              strokeWidth="1.8"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {/* Legend */}
        {ROLES.map((role, i) => (
          <g key={role} transform={`translate(${pl + i * 115}, ${H - 14})`}>
            <line x1="0" y1="0" x2="14" y2="0" stroke={ROLE_COLORS[role]} strokeWidth="2" />
            <text x="17" y="4" fontSize="9" fill="#555">{ROLE_LABELS[role]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Charts section ───────────────────────────────────────────────────────────

const CHART_CONFIGS: {
  title: string;
  key: keyof RoleState;
}[] = [
  { title: 'Orders Placed (per round)',    key: 'orderHistory' },
  { title: 'Inventory Position (end of round)', key: 'inventoryHistory' },
  { title: 'Lost Sales (units, per round)', key: 'lostSalesHistory' },
  { title: 'Units Expired / Wasted',       key: 'wastageHistory' },
];

function ChartsSection({ state }: { state: GameState }) {
  if (state.currentRound === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
        Performance Charts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHART_CONFIGS.map(({ title, key }) => (
          <LineChart
            key={key}
            title={title}
            series={ROLES.map(role => ({
              role,
              values: toArr(state.roles[role]?.[key]),
            }))}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame]           = useState<Game | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [pausing, setPausing]     = useState(false);

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
  const players    = Object.values(game.players);
  const doneCount  = state.playersDoneOrdering?.length ?? 0;
  const playerCount = players.length;
  const teamName   = players.find(p => !p.isBot)?.teamName ?? gameId;

  async function handleAdvance() {
    setAdvancing(true);
    try {
      if (state.phase === 'ordering') {
        const stored = (
          (state as GameState & { pendingOrders?: Partial<Record<Role, number>> }).pendingOrders ?? {}
        ) as Partial<Record<Role, number>>;
        const orders: Record<Role, number> = {
          retailer:     stored.retailer     ?? state.roles.retailer?.incomingOrder     ?? 0,
          wholesaler:   stored.wholesaler   ?? state.roles.wholesaler?.incomingOrder   ?? 0,
          distributor:  stored.distributor  ?? state.roles.distributor?.incomingOrder  ?? 0,
          manufacturer: stored.manufacturer ?? state.roles.manufacturer?.incomingOrder ?? 0,
        };
        const newState = processRound(state, config, orders);
        await updateFullGameState(gameId, newState);
      } else if (state.phase === 'summary') {
        if (state.currentRound >= config.totalRounds) {
          await updateGameState(gameId, { phase: 'ended' });
        } else {
          await updateGameState(gameId, {
            phase: 'ordering',
            roundStartedAt: Date.now(),
          });
        }
      }
    } finally {
      setAdvancing(false);
    }
  }

  async function handleEnd() {
    await updateGameState(gameId, { phase: 'ended' });
  }

  async function handlePause() {
    setPausing(true);
    try {
      await updateGameState(gameId, { paused: true, pausedAt: Date.now() });
    } finally { setPausing(false); }
  }

  async function handleResume() {
    setPausing(true);
    try {
      // Shift roundStartedAt forward by the time spent paused so the timer
      // resumes from where it was frozen.
      const pausedAt = state.pausedAt ?? Date.now();
      const pauseDuration = Date.now() - pausedAt;
      const newStartedAt = (state.roundStartedAt ?? pausedAt) + pauseDuration;
      const resumePatch: Partial<GameState> = {
        paused: false,
        pausedAt: undefined,
        roundStartedAt: newStartedAt,
      };
      await updateGameState(gameId, resumePatch);
    } finally { setPausing(false); }
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
              state.paused               ? 'warning' :
              state.phase === 'ordering' ? 'warning' :
              state.phase === 'summary'  ? 'default' :
              state.phase === 'ended'    ? 'success' : 'info'
            }>
              {state.paused ? '⏸ paused' : state.phase}
            </Badge>
            <span className="text-sm text-gray-500">
              Round {state.currentRound} / {config.totalRounds}
            </span>
            {state.phase === 'ordering' && !state.paused && (
              <span className="text-sm text-amber-600">
                {doneCount}/{playerCount} players submitted
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {/* Pause / Resume — only during ordering */}
          {state.phase === 'ordering' && !state.paused && (
            <Button onClick={handlePause} disabled={pausing} variant="ghost">
              ⏸ Pause
            </Button>
          )}
          {state.phase === 'ordering' && state.paused && (
            <Button onClick={handleResume} disabled={pausing}>
              ▶ Resume
            </Button>
          )}
          {state.phase === 'ordering' && !state.paused && (
            <Button onClick={handleAdvance} disabled={advancing} variant="ghost">
              ⏩ Force Process Round
            </Button>
          )}
          {state.phase === 'summary' && (
            <Button onClick={handleAdvance} disabled={advancing}>
              {state.currentRound >= config.totalRounds
                ? 'End Game →'
                : `Start Round ${state.currentRound + 1} →`}
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
            const totalWasted = toArr(rs?.wastageHistory).reduce((s: number, v: number) => s + v, 0);
            const totalLost   = toArr(rs?.lostSalesHistory).reduce((s: number, v: number) => s + v, 0);
            return (
              <Card key={role} className="text-center py-3">
                <p className="text-xs text-gray-400">{ROLE_LABELS[role]}</p>
                <p className="text-xl font-bold text-cake-700">${rs?.totalCost.toFixed(2)}</p>
                <p className="text-xs text-red-500">{totalWasted} wasted</p>
                <p className="text-xs text-amber-500">{totalLost} lost sales</p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Game phases */}
      {state.phase === 'ended' && <GameResults game={game} />}

      {state.phase === 'summary' && (
        <div>
          <WeeklySummary state={state} config={config} />
          <ChartsSection state={state} />
        </div>
      )}

      {(state.phase === 'ordering' || state.phase === 'processing') && (
        <div className="space-y-4">
          {/* All 4 role panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map(role => {
              const rs = state.roles[role];
              if (!rs) return null;
              const player = players.find(p => p.role === role);
              return (
                <div key={role}>
                  <p className="text-xs text-gray-400 mb-1 ml-1">
                    {player?.isBot
                      ? `🤖 ${player.name}`
                      : player
                        ? `👤 ${player.name}`
                        : '⏳ Waiting for player'}
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
                  <div
                    key={role}
                    className={`flex-1 rounded-lg p-3 text-center text-xs ${
                      done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <p className="font-semibold">{ROLE_LABELS[role]}</p>
                    <p>{done ? '✓ Done' : '⏳ Pending'}</p>
                    <p className="text-gray-400 mt-0.5">
                      {player?.isBot ? '🤖 Bot' : player?.name ?? '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Charts (available once at least one round has been played) */}
          <ChartsSection state={state} />
        </div>
      )}

      {(state.phase === 'lobby' || state.phase === 'onboarding') && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">🏁</p>
          <p>Game hasn&apos;t started yet.</p>
          <Button className="mt-4" onClick={async () => {
            await updateGameState(gameId, {
              phase: 'ordering',
              roundStartedAt: Date.now(),
            });
          }}>
            Start Game
          </Button>
        </div>
      )}
    </div>
  );
}
