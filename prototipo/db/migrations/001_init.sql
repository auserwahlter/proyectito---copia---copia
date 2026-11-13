CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_date date,
  location text NOT NULL DEFAULT '',
  mat_count integer NOT NULL DEFAULT 1 CHECK (mat_count > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  playback_url text NOT NULL DEFAULT '',
  operator jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fighters (
  id text PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  team text NOT NULL DEFAULT 'Independiente',
  belt text NOT NULL DEFAULT 'Blanca',
  weight text NOT NULL DEFAULT '-64 kg',
  initials text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'mint',
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bouts (
  id text PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round >= 0),
  slot integer NOT NULL CHECK (slot >= 0),
  red_id text REFERENCES fighters(id) ON DELETE SET NULL,
  blue_id text REFERENCES fighters(id) ON DELETE SET NULL,
  red_points integer NOT NULL DEFAULT 0 CHECK (red_points >= 0),
  red_advantages integer NOT NULL DEFAULT 0 CHECK (red_advantages >= 0),
  red_penalties integer NOT NULL DEFAULT 0 CHECK (red_penalties >= 0),
  blue_points integer NOT NULL DEFAULT 0 CHECK (blue_points >= 0),
  blue_advantages integer NOT NULL DEFAULT 0 CHECK (blue_advantages >= 0),
  blue_penalties integer NOT NULL DEFAULT 0 CHECK (blue_penalties >= 0),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
  winner_id text REFERENCES fighters(id) ON DELETE SET NULL,
  division_belt text NOT NULL DEFAULT '',
  division_weight text NOT NULL DEFAULT '',
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, slot)
);

CREATE TABLE IF NOT EXISTS streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Directo',
  mat_id text NOT NULL DEFAULT 'mat-01',
  path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended', 'saved', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  recording_start timestamptz,
  duration_seconds numeric(12, 3) NOT NULL DEFAULT 0,
  peak_viewers integer NOT NULL DEFAULT 0,
  final_score jsonb,
  mime_type text,
  file_path text,
  file_size_bytes bigint,
  thumbnail_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fighters_tournament ON fighters (tournament_id);
CREATE INDEX IF NOT EXISTS idx_bouts_tournament ON bouts (tournament_id, round, slot);
CREATE INDEX IF NOT EXISTS idx_streams_status_started ON streams (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_streams_tournament ON streams (tournament_id);
CREATE INDEX IF NOT EXISTS idx_streams_path ON streams (path);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON tournaments;
CREATE TRIGGER trg_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bouts_updated_at ON bouts;
CREATE TRIGGER trg_bouts_updated_at
  BEFORE UPDATE ON bouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_streams_updated_at ON streams;
CREATE TRIGGER trg_streams_updated_at
  BEFORE UPDATE ON streams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
