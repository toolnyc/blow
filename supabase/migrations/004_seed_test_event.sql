-- Seed a test event for development
INSERT INTO events (slug, name, date, venue, walk_in_limit)
VALUES ('may3', 'Blow — May 3', '2026-05-03', 'TBD', 30)
ON CONFLICT (slug) DO NOTHING;
