'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoAssignPlayer } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const assignment = await autoAssignPlayer(email.trim());
      // Store assignment in sessionStorage for the client
      sessionStorage.setItem('playerId', assignment.playerId);
      sessionStorage.setItem('gameId', assignment.gameId);
      sessionStorage.setItem('role', assignment.role);
      sessionStorage.setItem('email', email.trim().toLowerCase());
      router.push(`/assigned?gameId=${assignment.gameId}&role=${assignment.role}&team=${encodeURIComponent(assignment.teamName)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🎂</div>
        <h2 className="text-3xl font-bold text-cake-700">Welcome to the Cake Game</h2>
        <p className="text-gray-500 mt-2">
          A perishable supply chain simulation. Manage your inventory carefully —
          stock expires after <strong>3 weeks</strong>!
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-cake-100 p-6">
        <form onSubmit={handleJoin} className="space-y-4">
          <Input
            label="Your email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Joining...' : 'Join Game →'}
          </Button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100 space-y-2 text-xs text-gray-400">
          <p>🎭 You&apos;ll be auto-assigned a role: Manufacturer, Distributor, Wholesaler, or Retailer.</p>
          <p>⏰ Inventory expires after 3 rounds. Wastage costs $2/unit.</p>
          <p>📉 Unmet demand is lost — $4/unit penalty. No backlog.</p>
        </div>
      </div>

      <p className="text-center mt-4 text-xs text-gray-400">
        Session facilitator?{' '}
        <a href="/admin" className="text-cake-600 hover:underline">Go to admin panel →</a>
      </p>
    </div>
  );
}
