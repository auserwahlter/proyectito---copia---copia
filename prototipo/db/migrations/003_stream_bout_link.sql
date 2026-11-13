ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS bout_id text;

CREATE INDEX IF NOT EXISTS idx_streams_bout_id
  ON streams (bout_id);
