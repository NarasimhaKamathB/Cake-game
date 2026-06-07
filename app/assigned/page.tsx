'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { subscribeToGame } from '@/lib/supabase';
import { Game, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_TAGS, Role } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

function AssignedContent() {
  const params = useSearchParams();
  const router = useRouter();
  const gameId = params.get('gameId') ?? '';
  const role = (params.get('role') ?? '') as Role;
  const team = params.get('team') ?? '';

  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const unsub = subscribeToGame(gameId, g => {
      setGame(g);
      if (g?.state.phase === 'onboarding' || g?.state.phase === 'ordering') {
        router.push(`/game/${gameId}`);
      }
    });
    return unsub;
  }, [gameId, router]);

  const players = game ? Object.values(game.players) : [];

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-3">🎭</div>
        <h2 className="text-2xl font-bold text-cake-700">You&apos;re in!</h2>
        <p className="text-gray-500">Waiting for the facilitator to start the game.</p>
      </div>

      <Card className="text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Your team</p>
        <p className="text-xl font-bold text-gray-800">{team}</p>
        <div className="mt-3 inline-block">
          <Badge variant="info">{ROLE_LABELS[role]}</Badge>
        </div>
        <p className="text-sm text-gray-500 mt-2">{ROLE_DESCRIPTIONS[role]}</p>
        <p className="text-xs text-cake-600 mt-1">{ROLE_TAGS[role]}</p>
      </Card>

      <Card title="Team members">
        <div className="space-y-2">
          {players.length === 0 && <p className="text-sm text-gray-400">Loading teammates...</p>}
          {players.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{p.name}</span>
              <Badge>{p.role ? ROLE_LABELS[p.role as Role] : 'Unassigned'}</Badge>
            </div>
          ))}
          {players.length < 4 && (
            <p className="text-xs text-gray-400 mt-2">
              Waiting for {4 - players.length} more player{4 - players.length !== 1 ? 's' : ''}...
            </p>
          )}
        </div>
      </Card>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">⏰ Remember: perishability rules</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Any stock held for more than <strong>3 rounds</strong> expires automatically.</li>
          <li>Expired units cost <strong>$2/unit</strong> in wastage.</li>
          <li>Unfulfilled demand is <strong>lost</strong> — no backlog.</li>
          <li>Order wisely: over-ordering wastes money, under-ordering loses sales.</li>
        </ul>
      </div>

      <p className="text-center text-xs text-gray-400 animate-pulse">
        ⏳ Waiting for facilitator to start...
      </p>
    </div>
  );
}

export default function AssignedPage() {
  return (
    <Suspense fallback={
      <div className="text-center mt-20 text-gray-400">
        <div className="text-4xl mb-3">⏳</div>
        <p>Loading...</p>
      </div>
    }>
      <AssignedContent />
    </Suspense>
  );
}
