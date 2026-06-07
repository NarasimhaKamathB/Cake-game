'use client';
import { useEffect, useState } from 'react';
import {
  getAllGames,
  subscribeToAllGames,
  subscribeToSessionSettings,
  updateSessionSettings,
  startAllGames,
  deleteAllGames,
  resetGameValues,
  resetGameFull,
  updateGameState,
} from '@/lib/supabase';
import { Game, ROLES, ROLE_LABELS, SessionSettings, Role } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function AdminPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [session, setSession] = useState<SessionSettings>({ registrationOpen: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAllGames().then(setGames);
    const unsubGames = subscribeToAllGames(setGames);
    const unsubSession = subscribeToSessionSettings(setSession);
    return () => { unsubGames(); unsubSession(); };
  }, []);

  async function handleToggleRegistration() {
    await updateSessionSettings({ registrationOpen: !session.registrationOpen });
  }

  async function handleStartAll() {
    setLoading(true);
    try { await startAllGames(); } finally { setLoading(false); }
  }

  async function handleDeleteAll() {
    if (!confirm('Delete ALL games? This cannot be undone.')) return;
    setLoading(true);
    try { await deleteAllGames(); } finally { setLoading(false); }
  }

  const totalPlayers = games.reduce((s, g) => s + Object.keys(g.players ?? {}).length, 0);
  const activeGames = games.filter(g => !['ended', 'lobby'].includes(g.state?.phase)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-cake-700">🎛️ Admin Panel</h2>
          <p className="text-sm text-gray-500">Manage game sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleToggleRegistration}>
            {session.registrationOpen ? '🔒 Close Registration' : '🔓 Open Registration'}
          </Button>
          <Button onClick={handleStartAll} disabled={loading}>
            ▶ Start All Games
          </Button>
          <Button variant="danger" onClick={handleDeleteAll} disabled={loading}>
            🗑 Delete All
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-xs text-gray-400">Teams</p>
          <p className="text-3xl font-bold text-cake-700">{games.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-gray-400">Players</p>
          <p className="text-3xl font-bold text-cake-700">{totalPlayers}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-gray-400">Active Games</p>
          <p className="text-3xl font-bold text-cake-700">{activeGames}</p>
        </Card>
      </div>

      {/* Registration status */}
      <div className={`rounded-xl px-4 py-2 text-sm font-medium ${
        session.registrationOpen
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}>
        Registration is currently <strong>{session.registrationOpen ? 'OPEN' : 'CLOSED'}</strong>.
        {!session.registrationOpen && ' New players cannot join.'}
      </div>

      {/* Game list */}
      {games.length === 0 && (
        <p className="text-center text-gray-400 py-10">No games yet. Players will auto-create teams when they join.</p>
      )}

      <div className="space-y-3">
        {[...games]
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .map(game => (
            <GameRow key={game.id} game={game} />
          ))}
      </div>
    </div>
  );
}

function GameRow({ game }: { game: Game }) {
  const [loading, setLoading] = useState(false);
  const players = Object.values(game.players ?? {});
  const { state, config } = game;

  const phaseColor: Record<string, string> = {
    lobby: 'info',
    onboarding: 'info',
    ordering: 'warning',
    processing: 'warning',
    summary: 'default',
    ended: 'success',
  };

  async function advance(phase: string) {
    setLoading(true);
    try { await updateGameState(game.id, { phase: phase as Game['state']['phase'] }); }
    finally { setLoading(false); }
  }

  const totalWasted = ROLES.reduce(
    (s, r) => s + (state.roles?.[r]?.wastageHistory ?? []).reduce((a: number, v: number) => a + v, 0),
    0,
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-gray-800">{players[0]?.teamName ?? game.id}</span>
            <Badge variant={phaseColor[state?.phase] as 'default' | 'info' | 'warning' | 'success' | 'danger' ?? 'default'}>
              {state?.phase}
            </Badge>
            <span className="text-xs text-gray-400">Round {state?.currentRound}/{config?.totalRounds}</span>
          </div>

          {/* Players */}
          <div className="flex gap-2 flex-wrap mt-1">
            {ROLES.map(role => {
              const p = players.find(pl => pl.role === role);
              return (
                <span key={role} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                  <span className="text-gray-500">{ROLE_LABELS[role as Role]}: </span>
                  <span className="font-medium">{p ? p.name : '—'}</span>
                </span>
              );
            })}
          </div>

          {/* Cost summary */}
          {state?.currentRound > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Team cost: <strong>${ROLES.reduce((s, r) => s + (state.roles?.[r]?.totalCost ?? 0), 0).toFixed(2)}</strong>
              &nbsp;·&nbsp;Total wasted: <strong className="text-red-600">{totalWasted} units</strong>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          {state?.phase === 'lobby' && (
            <Button size="sm" onClick={() => advance('ordering')} disabled={loading}>Start</Button>
          )}
          {state?.phase === 'summary' && (
            <Button size="sm" onClick={() => advance('ordering')} disabled={loading}>Next Round</Button>
          )}
          {state?.phase === 'ordering' && (
            <Button size="sm" variant="ghost" onClick={() => advance('summary')} disabled={loading}>
              Force Summary
            </Button>
          )}
          <Button size="sm" variant="ghost"
            onClick={async () => { setLoading(true); try { await resetGameValues(game.id); } finally { setLoading(false); } }}
            disabled={loading}
          >
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
}
