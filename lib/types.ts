// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = 'retailer' | 'wholesaler' | 'distributor' | 'manufacturer';
export const ROLES: Role[] = ['manufacturer', 'distributor', 'wholesaler', 'retailer'];

export type GamePhase =
  | 'lobby'
  | 'onboarding'
  | 'ordering'
  | 'processing'
  | 'summary'
  | 'ended';

// ─── Perishability ────────────────────────────────────────────────────────────

/**
 * A batch of units that arrived at a node in a specific round.
 * Units expire after EXPIRY_WEEKS from arrivedRound.
 */
export interface InventoryBucket {
  arrivedRound: number; // which round this batch arrived
  quantity: number;
}

// ─── Per-role state ───────────────────────────────────────────────────────────

export interface RoleState {
  /** FIFO queue of inventory batches — oldest first. */
  inventoryBuckets: InventoryBucket[];
  /** Computed sum of all bucket quantities (for display). */
  totalInventory: number;

  incomingOrder: number;
  outgoingOrder: number;
  incomingShipment: number;
  outgoingShipment: number;

  /** Units that expired this round (held >= EXPIRY_WEEKS). */
  wastedUnits: number;
  /** Demand that could not be filled — no backlog, just lost. */
  lostSales: number;

  roundHoldingCost: number;
  roundWastageCost: number;
  roundCost: number;
  totalCost: number;

  orderPlaced: boolean;

  /** Shipment pipeline: goods in transit from upstream. [0] arrives next round. */
  shipmentPipeline: number[];

  // History (one entry per round)
  orderHistory: number[];
  inventoryHistory: number[];   // totalInventory after each round
  wastageHistory: number[];
  lostSalesHistory: number[];
  costHistory: number[];
  receivedHistory: number[];
  shippedHistory: number[];
  demandHistory: number[];
}

// ─── Game-wide state ──────────────────────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  roles: Record<Role, RoleState>;
  playersDoneOrdering: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GameConfig {
  totalRounds: number;
  holdingCostPerUnit: number;   // $ per unit per round
  wastageCostPerUnit: number;   // $ per expired unit
  expiryWeeks: number;          // shelf life in rounds
  startingInventory: number;
  customerDemandMin: number;
  customerDemandMax: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  totalRounds: 13,
  holdingCostPerUnit: 0.5,
  wastageCostPerUnit: 2.0,
  expiryWeeks: 4,
  startingInventory: 12,
  customerDemandMin: 1,
  customerDemandMax: 100,
};

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  isAdmin: boolean;
  joinedAt: number;
  teamName?: string;
  teamNumber?: number;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export interface Game {
  id: string;
  code: string;
  hostId: string;
  config: GameConfig;
  players: Record<string, Player>;
  state: GameState;
  createdAt: number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionSettings {
  registrationOpen: boolean;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  retailer: 'Retailer',
  wholesaler: 'Wholesaler',
  distributor: 'Distributor',
  manufacturer: 'Manufacturer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  retailer: 'Sells directly to end customers.',
  wholesaler: 'Supplies stock to retailers.',
  distributor: 'Links manufacturer to wholesaler.',
  manufacturer: 'Produces the product from raw ingredients.',
};

export const ROLE_TAGS: Record<Role, string> = {
  retailer: 'End consumer sales',
  wholesaler: 'Regional supply',
  distributor: 'Bulk distribution',
  manufacturer: 'Raw → Finished goods',
};

export const UPSTREAM_ROLE: Partial<Record<Role, Role>> = {
  retailer: 'wholesaler',
  wholesaler: 'distributor',
  distributor: 'manufacturer',
};

export const DOWNSTREAM_ROLE: Partial<Record<Role, Role>> = {
  wholesaler: 'retailer',
  distributor: 'wholesaler',
  manufacturer: 'distributor',
};

// ─── Default role state ───────────────────────────────────────────────────────

export const DEFAULT_ROLE_STATE: RoleState = {
  inventoryBuckets: [],
  totalInventory: 0,
  incomingOrder: 0,
  outgoingOrder: 0,
  incomingShipment: 0,
  outgoingShipment: 0,
  wastedUnits: 0,
  lostSales: 0,
  roundHoldingCost: 0,
  roundWastageCost: 0,
  roundCost: 0,
  totalCost: 0,
  orderPlaced: false,
  shipmentPipeline: [],
  orderHistory: [],
  inventoryHistory: [],
  wastageHistory: [],
  lostSalesHistory: [],
  costHistory: [],
  receivedHistory: [],
  shippedHistory: [],
  demandHistory: [],
};
