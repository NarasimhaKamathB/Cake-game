import {
  Role,
  RoleState,
  GameState,
  GameConfig,
  DEFAULT_ROLE_STATE,
  ROLES,
  InventoryBucket,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Coerce Firebase/Supabase JSONB arrays (may come back as objects) to real arrays. */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value) as T[];
  return [];
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialGameState(config: GameConfig): GameState {
  // Seed the pipeline with round-1 demand so players don't start empty
  const seed = config.demandSchedule?.[0] ?? 4;
  const roles = {} as Record<Role, RoleState>;

  for (const role of ROLES) {
    // Split starting inventory evenly across expiryWeeks buckets so players
    // immediately see stock ageing across all shelf-life slots.
    // e.g. expiryWeeks=3, startingInventory=12 → three buckets of 4 units
    // aged at rounds -(expiryWeeks-1), -(expiryWeeks-2), …, 0
    // → they expire in rounds 1, 2, 3 respectively.
    const buckets: InventoryBucket[] = [];
    const bucketCount  = config.expiryWeeks;          // one bucket per age slot
    const baseQty      = Math.floor(config.startingInventory / bucketCount);
    const remainder    = config.startingInventory - baseQty * bucketCount;

    for (let i = 0; i < bucketCount; i++) {
      const arrivedRound = -(bucketCount - 1 - i);    // oldest first: -(n-1), -(n-2), …, 0
      const qty = baseQty + (i === bucketCount - 1 ? remainder : 0); // put remainder in newest bucket
      if (qty > 0) buckets.push({ arrivedRound, quantity: qty });
    }

    roles[role] = {
      ...DEFAULT_ROLE_STATE,
      inventoryBuckets: buckets,
      totalInventory: config.startingInventory,
      shipmentPipeline: role === 'manufacturer' ? [seed, seed] : [seed],
    };
  }

  return {
    phase: 'lobby',
    currentRound: 0,
    roles,
    playersDoneOrdering: [],
  };
}

// ─── Perishability: expire old buckets ───────────────────────────────────────

/**
 * Split buckets into expired and active based on the current round.
 * A bucket expires when: currentRound - arrivedRound >= expiryWeeks
 * i.e., arrivedRound <= currentRound - expiryWeeks
 */
function applyExpiry(
  buckets: InventoryBucket[],
  currentRound: number,
  expiryWeeks: number,
): { active: InventoryBucket[]; expired: InventoryBucket[]; wastedUnits: number } {
  const expiryThreshold = currentRound - expiryWeeks;
  const expired = buckets.filter(b => b.arrivedRound <= expiryThreshold);
  const active = buckets.filter(b => b.arrivedRound > expiryThreshold);
  const wastedUnits = expired.reduce((sum, b) => sum + b.quantity, 0);
  return { active, expired, wastedUnits };
}

// ─── FIFO fulfillment ─────────────────────────────────────────────────────────

/**
 * Fulfill `demand` units from `buckets` using FIFO (oldest first).
 * Returns remaining buckets and how many units were actually shipped.
 * Unmet demand is lost (no backlog).
 */
function fulfillDemand(
  buckets: InventoryBucket[],
  demand: number,
): { remaining: InventoryBucket[]; shipped: number; lostSales: number } {
  let remaining = demand;
  const newBuckets: InventoryBucket[] = [];
  let shipped = 0;

  // buckets are already sorted oldest-first
  for (const bucket of buckets) {
    if (remaining <= 0) {
      newBuckets.push(bucket);
      continue;
    }
    const take = Math.min(bucket.quantity, remaining);
    shipped += take;
    remaining -= take;
    if (bucket.quantity > take) {
      newBuckets.push({ ...bucket, quantity: bucket.quantity - take });
    }
    // If take === bucket.quantity, bucket is fully consumed — don't push
  }

  const lostSales = Math.max(0, remaining); // any unmet demand is lost
  return { remaining: newBuckets, shipped, lostSales };
}

// ─── Core round processor ─────────────────────────────────────────────────────

export function processRound(
  state: GameState,
  config: GameConfig,
  orders: Record<Role, number>,
): GameState {
  const newRound = state.currentRound + 1;
  const newRoles = { ...state.roles };

  const customerDemand = getDemandForRound(config, newRound);

  // Helper to read pipeline (may be serialized as object by Supabase JSONB)
  const pipe = (role: Role): number[] => toArray<number>(state.roles[role]?.shipmentPipeline);
  const buckets = (role: Role): InventoryBucket[] =>
    toArray<InventoryBucket>(state.roles[role]?.inventoryBuckets);

  // ── What each role receives from upstream this round ──
  const received: Record<Role, number> = {
    retailer: pipe('retailer')[0] ?? 0,
    wholesaler: pipe('wholesaler')[0] ?? 0,
    distributor: pipe('distributor')[0] ?? 0,
    manufacturer: pipe('manufacturer')[0] ?? 0,
  };

  // ── Downstream demand each role faces ──
  const incomingOrders: Record<Role, number> = {
    retailer: customerDemand,
    wholesaler: orders.retailer,
    distributor: orders.wholesaler,
    manufacturer: orders.distributor,
  };

  // ── Process each role ──
  for (const role of ROLES) {
    const rs: RoleState = { ...newRoles[role] };

    rs.incomingShipment = received[role];
    rs.incomingOrder = incomingOrders[role];

    // 1. Add incoming shipment as a new bucket (arrived this round)
    const currentBuckets: InventoryBucket[] = [
      ...buckets(role),
      ...(received[role] > 0 ? [{ arrivedRound: newRound, quantity: received[role] }] : []),
    ];

    // 2. Expire batches older than expiryWeeks
    const { active, wastedUnits } = applyExpiry(currentBuckets, newRound, config.expiryWeeks);

    // 3. Fulfill demand FIFO — no backlog, lost sales instead
    const { remaining, shipped, lostSales } = fulfillDemand(active, incomingOrders[role]);

    // 4. Compute costs
    const totalInventory = remaining.reduce((s, b) => s + b.quantity, 0);
    const holdingCost   = totalInventory * config.holdingCostPerUnit;
    const wastageCost   = wastedUnits    * config.wastageCostPerUnit;
    const lostSalesCost = lostSales      * (config.lostSalesCostPerUnit ?? 4);
    const roundCost     = holdingCost + wastageCost + lostSalesCost;

    // 5. Write back
    rs.inventoryBuckets   = remaining;
    rs.totalInventory     = totalInventory;
    rs.outgoingShipment   = shipped;
    rs.lostSales          = lostSales;
    rs.wastedUnits        = wastedUnits;
    rs.roundHoldingCost   = holdingCost;
    rs.roundWastageCost   = wastageCost;
    rs.roundLostSalesCost = lostSalesCost;
    rs.roundCost          = roundCost;
    rs.totalCost          = (Number(rs.totalCost) || 0) + roundCost;
    rs.outgoingOrder      = orders[role];
    rs.orderPlaced        = false;

    // 6. Append to history
    rs.orderHistory         = [...(toArray<number>(rs.orderHistory)),         orders[role]];
    rs.inventoryHistory     = [...(toArray<number>(rs.inventoryHistory)),     totalInventory];
    rs.wastageHistory       = [...(toArray<number>(rs.wastageHistory)),       wastedUnits];
    rs.lostSalesHistory     = [...(toArray<number>(rs.lostSalesHistory)),     lostSales];
    rs.lostSalesCostHistory = [...(toArray<number>(rs.lostSalesCostHistory)), lostSalesCost];
    rs.costHistory          = [...(toArray<number>(rs.costHistory)),          roundCost];
    rs.receivedHistory      = [...(toArray<number>(rs.receivedHistory)),      received[role]];
    rs.shippedHistory       = [...(toArray<number>(rs.shippedHistory)),       shipped];
    rs.demandHistory        = [...(toArray<number>(rs.demandHistory)),        incomingOrders[role]];

    newRoles[role] = rs;
  }

  // ── Advance shipment pipelines ──
  // Each role receives what its upstream shipped this round (1-week delay).
  // Manufacturer has a 2-week production delay.
  newRoles.retailer = {
    ...newRoles.retailer,
    shipmentPipeline: [newRoles.wholesaler.outgoingShipment],
  };
  newRoles.wholesaler = {
    ...newRoles.wholesaler,
    shipmentPipeline: [newRoles.distributor.outgoingShipment],
  };
  newRoles.distributor = {
    ...newRoles.distributor,
    shipmentPipeline: [newRoles.manufacturer.outgoingShipment],
  };
  newRoles.manufacturer = {
    ...newRoles.manufacturer,
    shipmentPipeline: [
      pipe('manufacturer')[1] ?? 0, // last round's order arrives next round
      orders.manufacturer,           // this round's order arrives in 2 rounds
    ],
  };

  const isEnded = newRound >= config.totalRounds;

  return {
    ...state,
    currentRound: newRound,
    roles: newRoles,
    phase: isEnded ? 'ended' : 'summary',
    playersDoneOrdering: [],
  };
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export function getTotalTeamCost(roles: Record<Role, RoleState>): number {
  return ROLES.reduce((sum, role) => sum + (roles[role]?.totalCost ?? 0), 0);
}

export function getTotalWastage(roles: Record<Role, RoleState>): number {
  return ROLES.reduce(
    (sum, role) =>
      sum + toArray<number>(roles[role]?.wastageHistory).reduce((s, v) => s + v, 0),
    0,
  );
}

/**
 * Return the scheduled customer demand for a given round (1-indexed).
 * If round exceeds the schedule length, the last value is repeated.
 */
export function getDemandForRound(config: GameConfig, round: number): number {
  const schedule = config.demandSchedule;
  if (!schedule || schedule.length === 0) return 4;
  const idx = Math.min(round - 1, schedule.length - 1);
  return schedule[idx];
}

/** @deprecated use getDemandForRound — kept for backward compatibility */
export function getCustomerDemand(config: GameConfig): number {
  return getDemandForRound(config, 1);
}

/**
 * Simple heuristic order suggestion for a player:
 * order = demand + (target_stock - current_stock)
 * where target_stock is 2x the average demand to buffer for expiry risk.
 */
export function getSuggestedOrder(rs: RoleState, config: GameConfig): number {
  const schedule = config.demandSchedule ?? [];
  const avgDemand = schedule.length > 0
    ? Math.round(schedule.reduce((s, v) => s + v, 0) / schedule.length)
    : 10;
  const targetStock = avgDemand * 2;
  const suggestion = Math.max(0, rs.incomingOrder + (targetStock - rs.totalInventory));
  return suggestion;
}
