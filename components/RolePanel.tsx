'use client';
import React from 'react';
import { RoleState, GameConfig, Role, ROLE_LABELS } from '@/lib/types';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { InventoryBuckets } from './InventoryBuckets';
import { WastageAlert } from './WastageAlert';

interface RolePanelProps {
  role: Role;
  rs: RoleState;
  config: GameConfig;
  currentRound: number;
  isOwnRole: boolean;
}

export function RolePanel({ role, rs, config, currentRound, isOwnRole }: RolePanelProps) {
  return (
    <Card className={isOwnRole ? 'ring-2 ring-cake-400' : ''}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{ROLE_LABELS[role]}</h3>
        {isOwnRole && <Badge variant="info">You</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Inventory" value={rs.totalInventory} />
        <Stat label="Demand" value={rs.incomingOrder} />
        <Stat label="Shipped" value={rs.outgoingShipment} />
        <Stat label="Lost Sales" value={rs.lostSales} highlight={rs.lostSales > 0 ? 'warn' : undefined} />
        <Stat label="Wasted" value={rs.wastedUnits} highlight={rs.wastedUnits > 0 ? 'danger' : undefined} />
        <Stat label="Round cost" value={`$${rs.roundCost.toFixed(2)}`} />
      </div>

      {isOwnRole && (
        <>
          {currentRound > 0 && (
            <WastageAlert
              wastedUnits={rs.wastedUnits}
              wastageCost={rs.roundWastageCost}
              wastageCostPerUnit={config.wastageCostPerUnit}
            />
          )}
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Inventory shelf life
            </p>
            <InventoryBuckets
              buckets={rs.inventoryBuckets}
              currentRound={currentRound}
              expiryWeeks={config.expiryWeeks}
            />
          </div>
        </>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Total cost: <strong className="text-gray-700">${rs.totalCost.toFixed(2)}</strong></span>
          <span className="text-gray-400">This round: ${rs.roundCost.toFixed(2)}</span>
        </div>
        <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
          <span>Holding: <strong>${rs.roundHoldingCost.toFixed(2)}</strong></span>
          <span>Wastage: <strong className={rs.roundWastageCost > 0 ? 'text-red-500' : ''}>${rs.roundWastageCost.toFixed(2)}</strong></span>
          <span>Lost sales: <strong className={rs.roundLostSalesCost > 0 ? 'text-amber-600' : ''}>${(rs.roundLostSalesCost ?? 0).toFixed(2)}</strong></span>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: 'warn' | 'danger';
}) {
  const color =
    highlight === 'danger' ? 'text-red-600' :
    highlight === 'warn'   ? 'text-amber-600' :
    'text-gray-800';

  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
