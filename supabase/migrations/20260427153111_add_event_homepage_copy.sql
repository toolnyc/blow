ALTER TABLE events
ADD COLUMN IF NOT EXISTS homepage_copy TEXT;

UPDATE events
SET homepage_copy = 'a sexy daytime affair on...'
WHERE homepage_copy IS NULL OR btrim(homepage_copy) = '';

ALTER TABLE events
ALTER COLUMN homepage_copy SET DEFAULT 'a sexy daytime affair on...',
ALTER COLUMN homepage_copy SET NOT NULL;
