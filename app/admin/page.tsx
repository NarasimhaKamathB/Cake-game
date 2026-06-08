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
  updateGameState,
} from '@/lib/supabase';
import { Game, GameConfig, ROLES, ROLE_LABELS, SessionSettings, Role, DEFAULT_CONFIG } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// ─── Config Editor ────────────────────────────────────────────────────────────

function ConfigEditor({
  current,
  onSave,
}: {
  current: GameConfig;
  onSave: (cfg: GameConfig) => Promise<void>;
}) {
  const [open, setOpen]           = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [totalRounds, setTotalRounds]   = useState(String(current.totalRounds));
  const [expiryWeeks, setExpiryWeeks]   = useState(String(current.expiryWeeks));
  const [holdingCost, setHoldingCost]   = useState(String(current.holdingCostPerUnit));
  const [wastageCost, setWastageCost]   = useState(String(current.wastageCostPerUnit));
  const [lostCost, setLostCost]         = useState(String(current.lostSalesCostPerUnit ?? 4));
  const [startInv, setStartInv]         = useState(String(current.startingInventory));
  const [scheduleStr, setScheduleStr]   = useState(current.demandSchedule.join(', '));

  // keep form in sync when upstream changes (e.g. first load)
  useEffect(() => {
    setTotalRounds(String(current.totalRounds));
    setExpiryWeeks(String(current.expiryWeeks));
    setHoldingCost(String(current.holdingCostPerUnit));
    setWastageCost(String(current.wastageCostPerUnit));
    setLostCost(String(current.lostSalesCostPerUnit ?? 4));
    setStartInv(String(current.startingInventory));
    setScheduleStr(current.demandSchedule.join(', '));
  }, [current]);

  function parseSchedule(raw: string): number[] {
    return raw.split(/[,\s]+/).map(s => Math.max(0, parseInt(s) || 0)).filter((_, i, arr) => arr.length > 0);
  }

  function buildPreview(schedule: number[], rounds: number): string {
    const preview: number[] = [];
    for (let i = 1; i <= Math.min(rounds, 6); i++) {
      preview.push(schedule[Math.min(i - 1, schedule.length - 1)]);
    }
    if (rounds > 6) preview.push(-1); // sentinel for "..."
    return preview.map((v, i) => v === -1 ? '…' : `Wk${i + 1}:${v}`).join(' → ');
  }

  async function handleSave() {
    const schedule = parseSchedule(scheduleStr);
    if (schedule.length === 0) return alert('Enter at least one demand value.');
    const cfg: GameConfig = {
      totalRounds:           Math.max(1, parseInt(totalRounds) || DEFAULT_CONFIG.totalRounds),
      expiryWeeks:           Math.max(1, parseInt(expiryWeeks) || DEFAULT_CONFIG.expiryWeeks),
      holdingCostPerUnit:    Math.max(0, parseFloat(holdingCost) || DEFAULT_CONFIG.holdingCostPerUnit),
      wastageCostPerUnit:    Math.max(0, parseFloat(wastageCost) || DEFAULT_CONFIG.wastageCostPerUnit),
      lostSalesCostPerUnit:  Math.max(0, parseFloat(lostCost)   || DEFAULT_CONFIG.lostSalesCostPerUnit),
      startingInventory:     Math.max(0, parseInt(startInv)     || DEFAULT_CONFIG.startingInventory),
      demandSchedule:        schedule,
    };
    setSaving(true);
    try {
      await onSave(cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const schedule = parseSchedule(scheduleStr);
  const rounds   = Math.max(1, parseInt(totalRounds) || 20);

  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <p className="font-semibold text-cake-700">⚙️ Game Configuration</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {current.totalRounds} weeks · {current.expiryWeeks}-week expiry ·
            demand {current.demandSchedule.slice(0, 3).join(', ')}{current.demandSchedule.length > 3 ? '…' : ''}
          </p>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲ Collapse' : '▼ Edit'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ Config applies to <strong>new games only</strong>. Already-created games keep their original settings.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Total weeks */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Total Weeks</span>
              <input
                type="number" min={1} max={52} value={totalRounds}
                onChange={e => setTotalRounds(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>

            {/* Expiry weeks */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Expiry Weeks (shelf life)</span>
              <input
                type="number" min={1} max={20} value={expiryWeeks}
                onChange={e => setExpiryWeeks(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>

            {/* Starting inventory */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Starting Inventory (units)</span>
              <input
                type="number" min={0} max={200} value={startInv}
                onChange={e => setStartInv(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>

            {/* Holding cost */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Holding Cost ($/unit/wk)</span>
              <input
                type="number" min={0} step={0.1} value={holdingCost}
                onChange={e => setHoldingCost(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>

            {/* Wastage cost */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Wastage Cost ($/expired unit)</span>
              <input
                type="number" min={0} step={0.5} value={wastageCost}
                onChange={e => setWastageCost(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>

            {/* Lost sales cost */}
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Lost Sales Cost ($/unit unmet)</span>
              <input
                type="number" min={0} step={0.5} value={lostCost}
                onChange={e => setLostCost(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
              />
            </label>
          </div>

          {/* Demand schedule */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">
              Customer Demand Schedule (comma-separated, last value repeats)
            </span>
            <textarea
              rows={2}
              value={scheduleStr}
              onChange={e => setScheduleStr(e.target.value)}
              placeholder="e.g. 4, 4, 8, 12, 16, 20, 20, 20"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cake-400 resize-none"
            />
            {schedule.length > 0 && (
              <p className="text-xs text-gray-400">
                Preview: {buildPreview(schedule, rounds)}
              </p>
            )}
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Config'}
            </Button>
            <Button variant="ghost" onClick={() => {
              setTotalRounds(String(DEFAULT_CONFIG.totalRounds));
              setExpiryWeeks(String(DEFAULT_CONFIG.expiryWeeks));
              setHoldingCost(String(DEFAULT_CONFIG.holdingCostPerUnit));
              setWastageCost(String(DEFAULT_CONFIG.wastageCostPerUnit));
              setLostCost(String(DEFAULT_CONFIG.lostSalesCostPerUnit));
              setStartInv(String(DEFAULT_CONFIG.startingInventory));
              setScheduleStr(DEFAULT_CONFIG.demandSchedule.join(', '));
            }}>
              Reset to Default
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [session, setSession] = useState<SessionSettings>({ registrationOpen: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAllGames().then(setGames);
    const unsubGames    = subscribeToAllGames(setGames);
    const unsubSession  = subscribeToSessionSettings(setSession);
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

  async function handleSaveConfig(cfg: GameConfig) {
    await updateSessionSettings({ gameConfig: cfg });
  }

  const activeConfig = session.gameConfig ?? DEFAULT_CONFIG;
  const totalPlayers = games.reduce((s, g) => s + Object.keys(g.players ?? {}).length, 0);
  const activeGames  = games.filter(g => !['ended', 'lobby'].includes(g.state?.phase)).length;

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

      {/* Config editor */}
      <ConfigEditor current={activeConfig} onSave={handleSaveConfig} />

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

// ─── Game Row ─────────────────────────────────────────────────────────────────

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
            <span className="text-xs text-gray-400">
              Round {state?.currentRound}/{config?.totalRounds}
              {config?.expiryWeeks && (
                <span className="ml-2 text-cake-500">{config.expiryWeeks}w expiry</span>
              )}
            </span>
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
              &nbsp;·&nbsp;Wasted: <strong className="text-red-600">{totalWasted} units</strong>
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
          <a href={`/admin/game/${game.id}`}>
            <Button size="sm" variant="ghost">👁 Watch</Button>
          </a>
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
