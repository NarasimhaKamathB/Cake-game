'use client';
import React from 'react';

interface WastageAlertProps {
  wastedUnits: number;
  wastageCost: number;
  wastageCostPerUnit: number;
}

export function WastageAlert({ wastedUnits, wastageCost, wastageCostPerUnit }: WastageAlertProps) {
  if (wastedUnits === 0) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
        <span>✅</span>
        <span>No wastage this round — well managed!</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
      <span className="text-xl">🗑️</span>
      <div>
        <p className="text-sm font-semibold text-red-700">
          {wastedUnits} unit{wastedUnits !== 1 ? 's' : ''} expired this round
        </p>
        <p className="text-xs text-red-600 mt-0.5">
          Wastage cost: <strong>${wastageCost.toFixed(2)}</strong>
          {' '}(${wastageCostPerUnit}/unit × {wastedUnits} units)
        </p>
        <p className="text-xs text-red-500 mt-1">
          Tip: order closer to actual demand to reduce over-stocking.
        </p>
      </div>
    </div>
  );
}
