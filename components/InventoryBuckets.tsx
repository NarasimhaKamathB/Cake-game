'use client';
import React from 'react';
import { InventoryBucket } from '@/lib/types';

interface InventoryBucketsProps {
  buckets: InventoryBucket[];
  currentRound: number;
  expiryWeeks: number;
}

/**
 * Shows inventory split by age as individual bucket cards.
 * Oldest (expiring soonest) on the left → newest on the right.
 * Colour: red (expires this round) → amber (1 round left) → green (safe).
 */
export function InventoryBuckets({ buckets, currentRound, expiryWeeks }: InventoryBucketsProps) {
  // Always show exactly expiryWeeks slots (oldest → newest), regardless of how many
  // real buckets exist. Quantities are summed per age group; empty ages show 0.
  // This guarantees the full shelf-life spectrum is always visible.
  const slots = Array.from({ length: expiryWeeks }, (_, i) => {
    // i=0 → oldest slot (1w left), i=expiryWeeks-1 → newest slot (expiryWeeks w left)
    const weeksLeft   = i + 1;
    const age         = expiryWeeks - weeksLeft;          // 0 = freshest
    const arrivedRound = currentRound - age;
    const quantity    = (buckets ?? [])
      .filter(b => (currentRound - b.arrivedRound) === age)
      .reduce((s, b) => s + b.quantity, 0);
    return { arrivedRound, quantity, weeksLeft, age };
  });
  const total = slots.reduce((s, sl) => s + sl.quantity, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 flex-wrap">
        {slots.map((b, i) => {
          const age       = b.age;
          const remaining = b.weeksLeft;

          // Colour scheme
          let bg        = 'bg-green-100 border-green-300';
          let textColor = 'text-green-700';
          let badge     = `${remaining}w left`;
          let badgeBg   = 'bg-green-200 text-green-800';

          if (remaining <= 0) {
            bg = 'bg-red-100 border-red-400'; textColor = 'text-red-700';
            badge = 'Expires NOW'; badgeBg = 'bg-red-500 text-white';
          } else if (remaining === 1) {
            bg = 'bg-red-50 border-red-300'; textColor = 'text-red-600';
            badge = 'Expires next!'; badgeBg = 'bg-red-400 text-white';
          } else if (remaining === 2) {
            bg = 'bg-amber-50 border-amber-300'; textColor = 'text-amber-700';
            badge = `${remaining}w left`; badgeBg = 'bg-amber-300 text-amber-900';
          }

          // Bar fill: how much shelf life remains
          const pct = Math.max(0, Math.min(100, (remaining / expiryWeeks) * 100));

          return (
            <div
              key={i}
              className={`flex-1 min-w-[80px] rounded-xl border-2 ${bg} p-2.5 text-center relative`}
            >
              {/* Age badge */}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
                {badge}
              </span>

              {/* Quantity */}
              <p className={`text-2xl font-bold mt-1.5 ${textColor}`}>{b.quantity}</p>
              <p className="text-[10px] text-gray-500">units</p>

              {/* Age info */}
              <p className="text-[10px] text-gray-400 mt-1">
                Age: {age}w / {expiryWeeks}w
              </p>

              {/* Shelf life bar */}
              <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    remaining <= 1 ? 'bg-red-400' : remaining <= 2 ? 'bg-amber-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Total tile */}
        <div className="flex-1 min-w-[80px] rounded-xl border-2 border-cake-300 bg-cake-50 p-2.5 text-center">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cake-200 text-cake-800">
            Total
          </span>
          <p className="text-2xl font-bold mt-1.5 text-cake-700">{total}</p>
          <p className="text-[10px] text-gray-500">units</p>
          <p className="text-[10px] text-gray-400 mt-1">{slots.filter(s => s.quantity > 0).length} batch{slots.filter(s => s.quantity > 0).length !== 1 ? 'es' : ''}</p>
          <div className="mt-1.5 h-1.5 bg-cake-200 rounded-full" />
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        ← Oldest (expires soonest) &nbsp;&nbsp; Newest →
      </p>
    </div>
  );
}
