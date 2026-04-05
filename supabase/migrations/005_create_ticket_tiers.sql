-- Ticket tiers per event (linked to Stripe prices)
CREATE TABLE IF NOT EXISTS ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug TEXT NOT NULL REFERENCES events(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- e.g. "Regular", "Supporter"
  price_cents INT NOT NULL,        -- price in cents
  stripe_price_id TEXT,            -- Stripe Price ID (set after creation)
  stripe_product_id TEXT,          -- Stripe Product ID
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_tiers_event_name ON ticket_tiers(event_slug, name);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event ON ticket_tiers(event_slug);

ALTER TABLE ticket_tiers DISABLE ROW LEVEL SECURITY;
