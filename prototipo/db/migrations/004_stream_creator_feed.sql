ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS creator_id text NOT NULL DEFAULT 'general-user',
  ADD COLUMN IF NOT EXISTS creator_name text NOT NULL DEFAULT 'Usuario general',
  ADD COLUMN IF NOT EXISTS creator_avatar text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_streams_creator_id
  ON streams (creator_id, started_at DESC);
