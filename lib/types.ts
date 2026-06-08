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

export interface InventoryBucket {
  arrivedRound: number;
  quantity: number;
}

// ─── Per-role state ───────────────────────────────────────────────────────────

export interface RoleState {
  inventoryBuckets: InventoryBucket[];
  totalInventory: number;
  incomingOrder: number;
  outgoingOrder: number;
  incomingShipment: number;
  outgoingShipment: number;
  wastedUnits: number;
  lostSales: number;
  roundHoldingCost: number;
  roundWastageCost: number;
  roundLostSalesCost: number;
  roundCost: number;
  totalCost: number;
  orderPlaced: boolean;
  shipmentPipeline: number[];
  orderHistory: number[];
  inventoryHistory: number[];
  wastageHistory: number[];
  lostSalesHistory: number[];
  lostSalesCostHistory: number[];
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
  /** Epoch ms when the current ordering phase began — used for the 30s auto-submit timer. */
  roundStartedAt?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GameConfig {
  totalRounds: number;
  holdingCostPerUnit: number;
  wastageCostPerUnit: number;
  lostSalesCostPerUnit: number;
  expiryWeeks: number;
  startingInventory: number;
  demandSchedule: number[];
}

export const DEFAULT_CONFIG: GameConfig = {
  totalRounds: 20,
  holdingCostPerUnit: 0.5,
  wastageCostPerUnit: 2.0,
  lostSalesCostPerUnit: 4.0,
  expiryWeeks: 3,
  startingInventory: 12,
  demandSchedule: [4, 4, 8, 12, 16, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
};

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  isAdmin: boolean;
  /** true for auto-generated bot players that fill empty slots */
  isBot?: boolean;
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
  gameConfig?: GameConfig;
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
  manufacturer: 'Raw => Finished goods',
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
  roundLostSalesCost: 0,
  roundCost: 0,
  totalCost: 0,
  orderPlaced: false,
  shipmentPipeline: [],
  orderHistory: [],
  inventoryHistory: [],
  wastageHistory: [],
  lostSalesHistory: [],
  lostSalesCostHistory: [],
  costHistory: [],
  receivedHistory: [],
  shippedHistory: [],
  demandHistory: [],
};
