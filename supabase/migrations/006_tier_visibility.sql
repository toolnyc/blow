-- Add visibility and scheduling columns to ticket_tiers
ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ;

-- Constraint: visibility must be one of the allowed values
ALTER TABLE ticket_tiers
  ADD CONSTRAINT chk_tier_visibility CHECK (visibility IN ('visible', 'scheduled', 'hidden'));

-- Set existing tiers to hidden (immediate need: hide current tiers)
UPDATE ticket_tiers SET visibility = 'hidden' WHERE active = true;
