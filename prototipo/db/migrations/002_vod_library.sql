ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private')),
  ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_streams_visibility
  ON streams (visibility, status, started_at DESC);
