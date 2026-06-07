'use client';
import React from 'react';
import { InventoryBucket } from '@/lib/types';

interface InventoryBucketsProps {
  buckets: InventoryBucket[];
  currentRound: number;
  expiryWeeks: number;
}

/**
 * Visualises inventory batches as colour-coded bars.
 * Red = expiring next round, amber = 1 round left, green = safe.
 */
export function InventoryBuckets({ buckets, currentRound, expiryWeeks }: InventoryBucketsProps) {
  if (!buckets || buckets.length === 0) {
    return <p className="text-sm text-gray-400 italic">No inventory on hand.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-500 mb-2">Each bar = one batch. Colour shows remaining shelf life.</p>
      {[...buckets]
        .sort((a, b) => a.arrivedRound - b.arrivedRound)
        .map((b, i) => {
          const age = currentRound - b.arrivedRound;
          const remaining = expiryWeeks - age;
          const pct = Math.max(0, Math.min(100, (remaining / expiryWeeks) * 100));

          let bg = 'bg-green-400';
          let label = `${remaining}w left`;
          if (remaining <= 1) { bg = 'bg-red-400'; label = 'Expires next round!'; }
          else if (remaining <= 2) { bg = 'bg-amber-400'; label = `${remaining}w left`; }

          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-gray-500 shrink-0">Round {b.arrivedRound}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`${bg} h-4 rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 text-right font-medium">{b.quantity} units</span>
              <span className={`w-28 text-right ${remaining <= 1 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                {label}
              </span>
            </div>
          );
        })}
    </div>
  );
}
