-- Add per-tier maximum tickets per order
ALTER TABLE ticket_tiers
  ADD COLUMN max_per_order INT NOT NULL DEFAULT 4;

COMMENT ON COLUMN ticket_tiers.max_per_order IS 'Maximum number of tickets a single order can purchase for this tier';
