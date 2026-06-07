-- =============================================================================
-- Cake-game Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ── Games table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.games (
  id          TEXT        PRIMARY KEY,
  code        TEXT        UNIQUE NOT NULL,
  host_id     TEXT,
  config      JSONB       NOT NULL DEFAULT '{}',
  state       JSONB       NOT NULL DEFAULT '{}',
  players     JSONB       NOT NULL DEFAULT '{}',
  created_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS games_code_idx ON public.games (code);

-- ── Session settings table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_settings (
  id                  INT     PRIMARY KEY DEFAULT 1,
  registration_open   BOOLEAN NOT NULL DEFAULT TRUE,
  -- Facilitator-configured game parameters applied to all new games.
  -- Null means use the application DEFAULT_CONFIG.
  game_config         JSONB   DEFAULT NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.session_settings (id, registration_open)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Migration: add game_config if upgrading an existing schema ───────────────
-- Run this block if the table already exists without the game_config column:
-- ALTER TABLE public.session_settings ADD COLUMN IF NOT EXISTS game_config JSONB DEFAULT NULL;

-- ── Row-Level Security (disable for simplicity; tighten for production) ──────
ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_settings DISABLE ROW LEVEL SECURITY;

-- ── Enable real-time replication ─────────────────────────────────────────────
-- This allows Supabase Realtime to broadcast changes to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_settings;
