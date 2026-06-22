-- =============================================================================
-- Migration: fix_team_number_sequence
-- Run in Supabase Dashboard → SQL Editor → New query
--
-- Fixes Bug 2: duplicate team names when two players sign in simultaneously
-- and both land in the needsCreate path.
--
-- Root cause: the old code used `SELECT COUNT(*) + 1 FROM games` which is NOT
-- atomic — two concurrent callers see the same count and get the same team
-- number, resulting in "The Glazed Ones" appearing for two teams.
--
-- Fix: a Postgres sequence is guaranteed to return a unique value per call,
-- even under concurrent load.
-- =============================================================================

-- ── 1. Create the sequence (skip if already exists) ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS team_number_seq
  START  1
  INCREMENT  1
  NO CYCLE;

-- ── 2. Replace assign_player_atomic with the sequence-based version ───────────
CREATE OR REPLACE FUNCTION assign_player_atomic(
  p_email TEXT,
  p_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email      TEXT    := LOWER(TRIM(p_email));
  v_player_id  TEXT    := REGEXP_REPLACE(LOWER(TRIM(p_email)), '[^a-z0-9]', '_', 'g');
  v_reg_open   BOOLEAN;
  v_game_row   RECORD;
  v_key        TEXT;
  v_val        JSONB;
  v_used       TEXT[];
  v_role       TEXT;
  v_team_name  TEXT;
  v_team_num   INT;
  v_game_id    TEXT;
  v_player_obj JSONB;
  v_i          INT;
  v_role_order TEXT[] := ARRAY['manufacturer','distributor','wholesaler','retailer'];
  v_team_names TEXT[] := ARRAY[
    'Crème de la Crème','Rolling Scones','Batter Up','The Glazed Ones',
    'Flour Power','Rise & Shine','Tier One Tiers','Sweet Supply',
    'The Fondant Five','Icing Icons','Layered Leaders','Whisk Takers',
    'Custard Crew','The Piping Hot','Shelf Life Squad'
  ];
BEGIN
  -- ── Serialize all concurrent logins through a single row lock ──────────────
  SELECT registration_open
  INTO   v_reg_open
  FROM   session_settings
  WHERE  id = 1
  FOR UPDATE;

  -- ── 1. Return existing assignment if this email is already in any active game
  FOR v_game_row IN
    SELECT id, players
    FROM   games
    WHERE  state->>'phase' IN ('lobby','onboarding','ordering','processing','summary')
    ORDER  BY created_at ASC
    FOR UPDATE
  LOOP
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
    LOOP
      IF v_val->>'email' = v_email THEN
        RETURN jsonb_build_object(
          'playerId',   v_key,
          'gameId',     v_game_row.id,
          'role',       v_val->>'role',
          'teamName',   COALESCE(v_val->>'teamName', ''),
          'teamNumber', COALESCE((v_val->>'teamNumber')::INT, 1)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- ── 2. Registration gate ───────────────────────────────────────────────────
  IF NOT COALESCE(v_reg_open, TRUE) THEN
    RAISE EXCEPTION 'Registration is currently closed. Contact your session organiser.';
  END IF;

  -- ── 3. Find lobby game with an open human slot (already locked above) ──────
  v_game_id := NULL;
  FOR v_game_row IN
    SELECT id, players
    FROM   games
    WHERE  state->>'phase' = 'lobby'
    ORDER  BY created_at ASC
    FOR UPDATE
  LOOP
    -- Collect roles already taken by human (non-bot) players
    v_used := ARRAY[]::TEXT[];
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
    LOOP
      IF COALESCE((v_val->>'isBot')::BOOLEAN, FALSE) = FALSE THEN
        v_used := v_used || ARRAY[v_val->>'role'];
      END IF;
    END LOOP;

    -- Slot available?
    IF array_length(v_used, 1) IS NULL OR array_length(v_used, 1) < 4 THEN
      -- Pick first role not yet taken
      v_role := NULL;
      FOR v_i IN 1..4 LOOP
        IF NOT (v_role_order[v_i] = ANY(COALESCE(v_used, ARRAY[]::TEXT[]))) THEN
          v_role := v_role_order[v_i];
          EXIT;
        END IF;
      END LOOP;

      -- Inherit team name/number from first human already in the game
      v_team_name := NULL;
      v_team_num  := NULL;
      FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
      LOOP
        IF COALESCE((v_val->>'isBot')::BOOLEAN, FALSE) = FALSE THEN
          v_team_name := v_val->>'teamName';
          v_team_num  := (v_val->>'teamNumber')::INT;
          EXIT;
        END IF;
      END LOOP;

      v_game_id := v_game_row.id;
      EXIT;
    END IF;
  END LOOP;

  -- ── 4a. Atomically join existing game ─────────────────────────────────────
  IF v_game_id IS NOT NULL THEN
    v_player_obj := jsonb_build_object(
      'id',         v_player_id,
      'name',       p_name,
      'email',      v_email,
      'role',       v_role,
      'isAdmin',    FALSE,
      'isBot',      FALSE,
      'joinedAt',   (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      'teamName',   COALESCE(v_team_name, ''),
      'teamNumber', COALESCE(v_team_num, 1)
    );

    -- Single atomic write — no read-modify-write race
    UPDATE games
    SET    players = players || jsonb_build_object(v_player_id, v_player_obj)
    WHERE  id = v_game_id;

    RETURN jsonb_build_object(
      'playerId',   v_player_id,
      'gameId',     v_game_id,
      'role',       v_role,
      'teamName',   COALESCE(v_team_name, ''),
      'teamNumber', COALESCE(v_team_num, 1)
    );
  END IF;

  -- ── 4b. No open game — use SEQUENCE for guaranteed-unique team number ──────
  -- nextval() is atomic even under concurrent load — unlike COUNT(*)+1 which
  -- caused two teams to share the same number (and thus the same name).
  v_team_num  := nextval('team_number_seq');
  v_team_name := v_team_names[((v_team_num - 1) % 15) + 1];

  RETURN jsonb_build_object(
    'needsCreate', TRUE,
    'teamNumber',  v_team_num,
    'teamName',    v_team_name,
    'playerId',    v_player_id
  );
END;
$$;

-- Grant execute to anon (public) role so the client-side SDK can call it
GRANT EXECUTE ON FUNCTION assign_player_atomic(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION assign_player_atomic(TEXT, TEXT) TO authenticated;

-- ── 3. Reset the sequence to be safe for a fresh session ──────────────────
-- Optional: run this before each workshop to restart team numbering from 1.
-- SELECT setval('team_number_seq', 1, false);
