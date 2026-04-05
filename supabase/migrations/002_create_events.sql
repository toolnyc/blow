-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  date TIMESTAMPTZ,
  venue TEXT,
  walk_in_limit INT NOT NULL DEFAULT 30,
  stripe_url TEXT,
  capacity INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- Internal tool table — disable RLS
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
