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

const TEAM_NAMES = [
  'Crème de la Crème', 'Rolling Scones', 'Batter Up', 'The Glazed Ones',
  'Flour Power', 'Rise & Shine', 'Tier One Tiers', 'Sweet Supply',
  'The Fondant Five', 'Icing Icons', 'Layered Leaders', 'Whisk Takers',
  'Custard Crew', 'The Piping Hot', 'Shelf Life Squad',
];

const ROLE_ORDER: Role[] = ['manufacturer', 'distributor', 'wholesaler', 'retailer'];

function formatName(email: string): string {
  return email.split('@')[0]
    .replace(/[._\-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export async function autoAssignPlayer(email: string): Promise<{
  playerId: string;
  gameId: string;
  role: Role;
  teamName: string;
  teamNumber: number;
}> {
  const trimmed = email.trim().toLowerCase();
  const session = await getSessionSettings();
  const games = await getAllGames();
  const activePhases = ['lobby', 'onboarding', 'ordering', 'processing', 'summary'];

  // Return existing assignment
  for (const game of games) {
    if (!activePhases.includes(game.state?.phase)) continue;
    for (const [playerId, player] of Object.entries(game.players ?? {})) {
      if (player.email === trimmed) {
        return {
          playerId,
          gameId: game.id,
          role: player.role as Role,
          teamName: player.teamName ?? '',
          teamNumber: player.teamNumber ?? 1,
        };
      }
    }
  }

  if (!session.registrationOpen) {
    throw new Error('Registration is currently closed. Contact your session organiser.');
  }

  // Find a lobby game with an open human slot (ignore bot slots)
  const openSlots = games
    .filter(g => g.state?.phase === 'lobby')
    .map(g => {
      const humanPlayers = Object.values(g.players ?? {}).filter(p => !p.isBot);
      return { game: g, playerCount: humanPlayers.length };
    })
    .filter(({ playerCount }) => playerCount < 4)
    .sort((a, b) => b.playerCount - a.playerCount);

  if (openSlots.length > 0) {
    const { game } = openSlots[0];
    const usedRoles = Object.values(game.players ?? {})
      .filter(p => !p.isBot)
      .map(p => p.role as Role);
    const availableRole = ROLE_ORDER.find(r => !usedRoles.includes(r))!;
    const playerId = trimmed.replace(/[^a-zA-Z0-9]/g, '_');
    const firstHuman = Object.values(game.players ?? {}).find(p => !p.isBot);
    const teamName = firstHuman?.teamName ?? '';
    const teamNumber = firstHuman?.teamNumber ?? 1;

    const player: Player = {
      id: playerId,
      name: formatName(trimmed),
      email: trimmed,
      role: availableRole,
      isAdmin: false,
      joinedAt: Date.now(),
      teamName,
      teamNumber,
    };

    await joinGame(game.id, player);
    return { playerId, gameId: game.id, role: availableRole, teamName, teamNumber };
  }

  // Create a new team game using the facilitator's configured settings
  const teamNumber = games.length + 1;
  const teamName = TEAM_NAMES[(teamNumber - 1) % TEAM_NAMES.length];
  const activeConfig = session.gameConfig ?? DEFAULT_CONFIG;
  return createTeamGame(trimmed, teamName, teamNumber, activeConfig);
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
