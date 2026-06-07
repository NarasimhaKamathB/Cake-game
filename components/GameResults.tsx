'use client';
import React from 'react';
import { Game, ROLES, ROLE_LABELS } from '@/lib/types';
import { Card } from './ui/Card';

interface GameResultsProps {
  game: Game;
}

export function GameResults({ game }: GameResultsProps) {
  const { state, config } = game;

  const teamTotal = ROLES.reduce((s, r) => s + (state.roles[r]?.totalCost ?? 0), 0);
  const totalWasted = ROLES.reduce(
    (s, r) => s + (state.roles[r]?.wastageHistory ?? []).reduce((a: number, v: number) => a + v, 0),
    0,
  );
  const totalLost = ROLES.reduce(
    (s, r) => s + (state.roles[r]?.lostSalesHistory ?? []).reduce((a: number, v: number) => a + v, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-cake-700">🎂 Game Over</h2>
        <p className="text-gray-500 mt-1">Final results after {config.totalRounds} rounds</p>
      </div>

      {/* Team totals */}
      <Card className="text-center bg-cake-50">
        <p className="text-sm text-gray-500">Total Team Cost</p>
        <p className="text-4xl font-bold text-cake-700 my-1">${teamTotal.toFixed(2)}</p>
        <div className="flex justify-center gap-6 text-sm text-gray-500 mt-2">
          <span>🗑️ {totalWasted} units wasted</span>
          <span>📉 {totalLost} units lost</span>
        </div>
      </Card>

      {/* Per-role breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ROLES.map(role => {
          const rs = state.roles[role];
          if (!rs) return null;
          const totalWastedRole = (rs.wastageHistory ?? []).reduce((s: number, v: number) => s + v, 0);
          const totalLostRole = (rs.lostSalesHistory ?? []).reduce((s: number, v: number) => s + v, 0);
          const holdingTotal = (rs.costHistory ?? []).reduce((s: number, v: number) => s + v, 0) - totalWastedRole * config.wastageCostPerUnit;

          return (
            <Card key={role}>
              <h3 className="font-semibold text-gray-700 mb-3">{ROLE_LABELS[role]}</h3>
              <div className="space-y-1 text-sm">
                <Row label="Total cost" value={`$${rs.totalCost.toFixed(2)}`} bold />
                <Row label="Holding cost" value={`$${Math.max(0, holdingTotal).toFixed(2)}`} />
                <Row label="Wastage cost" value={`$${(totalWastedRole * config.wastageCostPerUnit).toFixed(2)}`} color="text-red-600" />
                <Row label="Units wasted" value={totalWastedRole} color="text-red-500" />
                <Row label="Lost sales" value={totalLostRole} color="text-amber-600" />
              </div>

              {/* Mini inventory history chart (bar sparkline) */}
              {rs.inventoryHistory && rs.inventoryHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Inventory over rounds</p>
                  <div className="flex items-end gap-0.5 h-10">
                    {rs.inventoryHistory.map((v: number, i: number) => {
                      const max = Math.max(...rs.inventoryHistory, 1);
                      const h = Math.round((v / max) * 40);
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-cake-300 rounded-sm"
                          style={{ height: `${h}px` }}
                          title={`Round ${i + 1}: ${v}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Wastage sparkline */}
              {rs.wastageHistory && rs.wastageHistory.some((v: number) => v > 0) && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 mb-1">Wastage per round</p>
                  <div className="flex items-end gap-0.5 h-8">
                    {rs.wastageHistory.map((v: number, i: number) => {
                      const max = Math.max(...rs.wastageHistory, 1);
                      const h = Math.round((v / max) * 32);
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-red-300 rounded-sm"
                          style={{ height: `${h}px` }}
                          title={`Round ${i + 1}: ${v} wasted`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-400">
        Shelf life: {config.expiryWeeks} rounds &nbsp;·&nbsp;
        Wastage: ${config.wastageCostPerUnit}/unit &nbsp;·&nbsp;
        Holding: ${config.holdingCostPerUnit}/unit/round
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${color ?? 'text-gray-800'}`}>{value}</span>
    </div>
  );
}
