'use client';
import React from 'react';
import { GameState, GameConfig, ROLES, ROLE_LABELS } from '@/lib/types';
import { Card } from './ui/Card';

interface WeeklySummaryProps {
  state: GameState;
  config: GameConfig;
}

export function WeeklySummary({ state, config }: WeeklySummaryProps) {
  const round = state.currentRound;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Round {round} Summary</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cake-50">
              <th className="text-left p-2 font-semibold text-cake-700">Role</th>
              <th className="text-right p-2 font-semibold text-gray-600">Demand</th>
              <th className="text-right p-2 font-semibold text-gray-600">Received</th>
              <th className="text-right p-2 font-semibold text-gray-600">Shipped</th>
              <th className="text-right p-2 font-semibold text-gray-600">Inventory</th>
              <th className="text-right p-2 font-semibold text-amber-600">Lost Sales</th>
              <th className="text-right p-2 font-semibold text-red-600">Wasted</th>
              <th className="text-right p-2 font-semibold text-gray-600">Order Placed</th>
              <th className="text-right p-2 font-semibold text-gray-800">Round Cost</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map(role => {
              const rs = state.roles[role];
              if (!rs) return null;
              return (
                <tr key={role} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-2 font-medium text-gray-700">{ROLE_LABELS[role]}</td>
                  <td className="p-2 text-right">{rs.incomingOrder}</td>
                  <td className="p-2 text-right">{rs.incomingShipment}</td>
                  <td className="p-2 text-right">{rs.outgoingShipment}</td>
                  <td className="p-2 text-right">{rs.totalInventory}</td>
                  <td className="p-2 text-right text-amber-600">{rs.lostSales}</td>
                  <td className="p-2 text-right text-red-600 font-medium">{rs.wastedUnits}</td>
                  <td className="p-2 text-right">{rs.outgoingOrder}</td>
                  <td className="p-2 text-right font-semibold">${rs.roundCost.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="bg-cake-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {ROLES.map(role => {
            const rs = state.roles[role];
            const totalWaste = (rs?.wastageHistory ?? []).reduce((s: number, v: number) => s + v, 0);
            return (
              <div key={role}>
                <p className="text-xs text-gray-500">{ROLE_LABELS[role]}</p>
                <p className="text-base font-bold text-gray-800">${rs?.totalCost.toFixed(2)}</p>
                <p className="text-xs text-red-500">{totalWaste} units wasted total</p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-cake-200 text-center">
          <p className="text-xs text-gray-500">Cumulative team cost</p>
          <p className="text-2xl font-bold text-cake-700">
            ${ROLES.reduce((s, r) => s + (state.roles[r]?.totalCost ?? 0), 0).toFixed(2)}
          </p>
        </div>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        Holding: ${config.holdingCostPerUnit}/unit/round &nbsp;·&nbsp;
        Wastage: ${config.wastageCostPerUnit}/expired unit &nbsp;·&nbsp;
        Shelf life: {config.expiryWeeks} rounds
      </p>
    </div>
  );
}
