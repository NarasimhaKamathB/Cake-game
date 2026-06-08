'use client';
import React from 'react';
import { GameState, GameConfig, ROLES, ROLE_LABELS, Role } from '@/lib/types';
import { Card } from './ui/Card';

interface WeeklySummaryProps {
  state: GameState;
  config: GameConfig;
  /** If provided, only this role's row is shown (player view).
   *  Omit or pass null/undefined to show all roles (admin view). */
  myRole?: Role | null;
}

export function WeeklySummary({ state, config, myRole }: WeeklySummaryProps) {
  const round = state.currentRound;
  const visibleRoles = myRole ? [myRole] : ROLES;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">
        Round {round} Summary
        {myRole && (
          <span className="ml-2 text-sm font-normal text-cake-600">
            — {ROLE_LABELS[myRole]}
          </span>
        )}
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cake-50">
              {!myRole && <th className="text-left p-2 font-semibold text-cake-700">Role</th>}
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
            {visibleRoles.map(role => {
              const rs = state.roles[role];
              if (!rs) return null;
              return (
                <tr key={role} className="border-t border-gray-100 hover:bg-gray-50">
                  {!myRole && (
                    <td className="p-2 font-medium text-gray-700">{ROLE_LABELS[role]}</td>
                  )}
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

      {/* Per-role cost breakdown (player view only) */}
      {myRole && (() => {
        const rs = state.roles[myRole];
        if (!rs) return null;
        return (
          <Card className="bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Your cost breakdown — Round {round}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Holding</p>
                <p className="text-lg font-bold text-gray-700">${rs.roundHoldingCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Wastage</p>
                <p className={`text-lg font-bold ${rs.roundWastageCost > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                  ${rs.roundWastageCost.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Lost Sales</p>
                <p className={`text-lg font-bold ${(rs.roundLostSalesCost ?? 0) > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                  ${(rs.roundLostSalesCost ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">Your cumulative total</p>
              <p className="text-xl font-bold text-cake-700">${rs.totalCost.toFixed(2)}</p>
            </div>
          </Card>
        );
      })()}

      {/* Team totals — admin view only */}
      {!myRole && (
        <Card className="bg-cake-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-3">
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
          <div className="border-t border-cake-200 pt-3 text-center">
            <p className="text-xs text-gray-500">Cumulative team cost</p>
            <p className="text-2xl font-bold text-cake-700">
              ${ROLES.reduce((s, r) => s + (state.roles[r]?.totalCost ?? 0), 0).toFixed(2)}
            </p>
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center">
        Holding: ${config.holdingCostPerUnit}/unit/round &nbsp;·&nbsp;
        Wastage: ${config.wastageCostPerUnit}/expired unit &nbsp;·&nbsp;
        Lost sales: ${config.lostSalesCostPerUnit}/unit &nbsp;·&nbsp;
        Shelf life: {config.expiryWeeks} rounds
      </p>
    </div>
  );
}
