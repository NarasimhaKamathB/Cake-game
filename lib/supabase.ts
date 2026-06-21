import { createClient } from '@supabase/supabase-js';
import {
  Game,
  GameConfig,
  GameState,
  Player,
  Role,
  SessionSettings,
  DEFAULT_CONFIG,
  ROLES,
  ROLE_LABELS,
} from './types';
import { generateGameCode, createInitialGameState } from './gameLogic';

// ─── Client ───────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Game CRUD ────────────────────────────────────────────────────────────────

export async function createGame(
  hostPlayer: Omit<Player, 'id'>,
  config: GameConfig,
): Promise<string> {
  const gameId = 'team_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const code = generateGameCode();
  const playerId = hostPlayer.email.replace(/[^a-zA-Z0-9]/g, '_');
  const player: Player = { ...hostPlayer, id: playerId };

  const game: Game = {
    id: gameId,
    code,
    hostId: playerId,
    config,
    players: { [playerId]: player },
    state: createInitialGameState(config),
    createdAt: Date.now(),
  };

  const { error } = await supabase.from('games').insert({
    id: game.id,
    code: game.code,
    host_id: game.hostId,
    config: game.config,
    state: game.state,
    players: game.players,
    created_at: game.createdAt,
  });

  if (error) throw new Error(error.message);
  return gameId;
}

export async function getGame(gameId: string): Promise<Game | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (error || !data) return null;
  return rowToGame(data);
}

export async function findGameByCode(code: string): Promise<Game | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (error || !data) return null;
  return rowToGame(data);
}

export async function getAllGames(): Promise<Game[]> {
  const { data, error } = await supabase.from('games').select('*');
  if (error || !data) return [];
  return data.map(rowToGame);
}

export async function updateGameState(gameId: string, state: Partial<GameState>): Promise<void> {
  const current = await getGame(gameId);
  if (!current) return;
  const merged = { ...current.state, ...state };
  const { error } = await supabase.from('games').update({ state: merged }).eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function updateFullGameState(gameId: string, state: GameState): Promise<void> {
  const { error } = await supabase.from('games').update({ state }).eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function joinGame(gameId: string, player: Player): Promise<void> {
  const current = await getGame(gameId);
  if (!current) throw new Error('Game not found');
  const players = { ...current.players, [player.id]: player };
  const { error } = await supabase.from('games').update({ players }).eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function updatePlayerRole(
  gameId: string,
  playerId: string,
  role: string,
): Promise<void> {
  const current = await getGame(gameId);
  if (!current) return;
  const players = {
    ...current.players,
    [playerId]: { ...current.players[playerId], role },
  };
  const { error } = await supabase.from('games').update({ players }).eq('id', gameId);
  if (error) throw new Error(error.message);
}

// ─── Real-time subscription ───────────────────────────────────────────────────

export function subscribeToGame(
  gameId: string,
  callback: (game: Game | null) => void,
): () => void {
  const channel = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => {
        callback(payload.new ? rowToGame(payload.new) : null);
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function subscribeToAllGames(callback: (games: Game[]) => void): () => void {
  const channel = supabase
    .channel('all-games')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, async () => {
      const games = await getAllGames();
      callback(games);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ─── Session settings ─────────────────────────────────────────────────────────

export async function getSessionSettings(): Promise<SessionSettings> {
  const { data } = await supabase
    .from('session_settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (!data) return { registrationOpen: true };
  return {
    registrationOpen: data.registration_open,
    gameConfig: data.game_config ?? undefined,
  };
}

export async function updateSessionSettings(settings: Partial<SessionSettings>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (settings.registrationOpen !== undefined) patch.registration_open = settings.registrationOpen;
  if (settings.gameConfig !== undefined) patch.game_config = settings.gameConfig;
  await supabase.from('session_settings').upsert({ id: 1, ...patch });
}

export function subscribeToSessionSettings(
  callback: (s: SessionSettings) => void,
): () => void {
  const channel = supabase
    .channel('session-settings')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
      (payload) => {
        if (payload.new) {
          const row = payload.new as { registration_open: boolean };
          callback({ registrationOpen: row.registration_open });
        }
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ─── Admin actions ────────────────────────────────────────────────────────────

/**
 * Fill any unfilled roles in a game with bot players.
 * Bots are named "Bot (Role)" and have isBot: true.
 */
export async function autoFillBotPlayers(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game) return;

  const usedRoles = new Set(
    Object.values(game.players)
      .map(p => p.role as Role)
      .filter(Boolean),
  );
  const missingRoles = ROLES.filter(r => !usedRoles.has(r));
  if (missingRoles.length === 0) return;

  const firstPlayer = Object.values(game.players)[0];
  const newPlayers = { ...game.players };

  for (const role of missingRoles) {
    const botId = `bot_${role}`;
    const botPlayer: Player = {
      id: botId,
      name: `Bot (${ROLE_LABELS[role]})`,
      email: `bot_${role}@system`,
      role,
      isBot: true,
      isAdmin: false,
      joinedAt: Date.now(),
      teamName: firstPlayer?.teamName ?? '',
      teamNumber: firstPlayer?.teamNumber ?? 1,
    };
    newPlayers[botId] = botPlayer;
  }

  const { error } = await supabase
    .from('games')
    .update({ players: newPlayers })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function startAllGames(): Promise<void> {
  const games = await getAllGames();
  const preGame = games.filter(g => ['lobby', 'onboarding'].includes(g.state?.phase));

  await Promise.all(
    preGame.map(async g => {
      // Fill any empty role slots with bots first
      await autoFillBotPlayers(g.id);
      // Then transition to ordering with a round-start timestamp
      const roundStartedAt = Date.now();
      await updateGameState(g.id, { phase: 'ordering', roundStartedAt });
    }),
  );
}

export async function deleteAllGames(): Promise<void> {
  await supabase.from('games').delete().neq('id', '');
}

export async function resetGameValues(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game) return;
  const freshState = createInitialGameState(game.config);
  freshState.phase = 'ordering';
  await updateFullGameState(gameId, freshState);
}

export async function resetGameFull(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game) return;
  const freshState = createInitialGameState(game.config);
  freshState.phase = 'lobby';
  const { error } = await supabase
    .from('games')
    .update({ state: freshState, players: {} })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

// ─── Auto-assignment ──────────────────────────────────────────────────────────

function formatName(email: string): string {
  return email.split('@')[0]
    .replace(/[._\-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Atomically assigns a player to a lobby game slot (or creates a new team).
 *
 * Concurrent safety: the heavy lifting is done by the `assign_player_atomic`
 * Postgres RPC which holds a row-level lock on `session_settings` for the
 * duration of the transaction, serializing all simultaneous logins.
 * This eliminates the previous TOCTOU where two players could both read "slot
 * X is free", both pick the same role, and one write silently overwrites the
 * other.
 *
 * New-team creation (when RPC returns needsCreate=true) still runs client-side
 * because `createInitialGameState` is TypeScript. The chance of two concurrent
 * new-team creations is tiny (< 10 ms window) and a retry loop handles it.
 */
export async function autoAssignPlayer(email: string): Promise<{
  playerId: string;
  gameId: string;
  role: Role;
  teamName: string;
  teamNumber: number;
}> {
  const trimmed = email.trim().toLowerCase();
  const name = formatName(trimmed);

  // ── Call atomic Postgres RPC ──────────────────────────────────────────────
  const { data, error } = await supabase.rpc('assign_player_atomic', {
    p_email: trimmed,
    p_name:  name,
  });

  if (error) throw new Error(error.message);

  type RpcResult = {
    needsCreate?: boolean;
    playerId:     string;
    gameId?:      string;
    role?:        Role;
    teamName:     string;
    teamNumber:   number;
  };
  const result = data as RpcResult;

  // ── Existing or newly-joined game ─────────────────────────────────────────
  if (!result.needsCreate) {
    return {
      playerId:   result.playerId,
      gameId:     result.gameId!,
      role:       result.role!,
      teamName:   result.teamName,
      teamNumber: result.teamNumber,
    };
  }

  // ── No open lobby game — need to create a new team ────────────────────────
  // Retry the RPC once (with jitter) in case another client just created a
  // game in the window between our RPC returning and now.
  await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

  const { data: retryData, error: retryErr } = await supabase.rpc('assign_player_atomic', {
    p_email: trimmed,
    p_name:  name,
  });

  if (!retryErr && retryData && !(retryData as RpcResult).needsCreate) {
    const r2 = retryData as RpcResult;
    return { playerId: r2.playerId, gameId: r2.gameId!, role: r2.role!, teamName: r2.teamName, teamNumber: r2.teamNumber };
  }

  // Still no open game → create a new team (client-side, uses TypeScript gameLogic)
  const session = await getSessionSettings();
  const activeConfig = session.gameConfig ?? DEFAULT_CONFIG;
  return createTeamGame(trimmed, result.teamName, result.teamNumber, activeConfig);
}

async function createTeamGame(
  email: string,
  teamName: string,
  teamNumber: number,
  config: GameConfig = DEFAULT_CONFIG,
): Promise<{ playerId: string; gameId: string; role: Role; teamName: string; teamNumber: number }> {
  const gameId = 'team_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const code = generateGameCode();
  const playerId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const role: Role = 'manufacturer';

  const player: Player = {
    id: playerId,
    name: formatName(email),
    email,
    role,
    isAdmin: false,
    joinedAt: Date.now(),
    teamName,
    teamNumber,
  };

  const game: Game = {
    id: gameId,
    code,
    hostId: playerId,
    config,
    players: { [playerId]: player },
    state: createInitialGameState(config),
    createdAt: Date.now(),
  };

  const { error } = await supabase.from('games').insert({
    id: game.id,
    code: game.code,
    host_id: game.hostId,
    config: game.config,
    state: game.state,
    players: game.players,
    created_at: game.createdAt,
  });

  if (error) throw new Error(error.message);
  return { playerId, gameId, role, teamName, teamNumber };
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGame(row: any): Game {
  return {
    id: row.id,
    code: row.code,
    hostId: row.host_id,
    config: row.config,
    state: row.state,
    players: row.players ?? {},
    createdAt: row.created_at,
  };
}
