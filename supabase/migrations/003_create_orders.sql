-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL REFERENCES events(slug),
  guest_id UUID REFERENCES guests(id),
  stripe_session_id TEXT UNIQUE NOT NULL,
  customer_email TEXT,
  ticket_type TEXT,
  quantity INT NOT NULL DEFAULT 1,
  amount_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event);
CREATE INDEX IF NOT EXISTS idx_orders_guest_id ON orders(guest_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);

-- Internal tool table — disable RLS
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
