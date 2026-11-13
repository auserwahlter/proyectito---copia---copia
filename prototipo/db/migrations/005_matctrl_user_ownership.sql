ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS owner_id text;

CREATE INDEX IF NOT EXISTS idx_tournaments_owner_created
  ON tournaments (owner_id, created_at DESC);
