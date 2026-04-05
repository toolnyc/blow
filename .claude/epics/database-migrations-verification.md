# Epic: Database Migrations Verification

## Intent

Verify and apply all pending Supabase migrations. Session reports conflict — one says 002/003 were run, a later one says they weren't. This epic resolves the ambiguity and ensures the `events`, `orders`, and `guests` tables are in the expected state before any feature work begins.

## Current State

- **Migration files exist:** `001_create_subscribers.sql`, `002_create_events.sql`, `003_create_orders.sql`
- **Conflicting session reports:**
  - "Auth Fix and Migrations" session (2026-04-05): claims `events`, `guests`, `orders`, `subscribers` tables confirmed
  - "Epic F+G Build" session (2026-04-05): says migrations not yet applied
- **No way to verify from code alone** — must query Supabase directly

## Tasks

### 1. Verify current table state
Connect to Supabase and list existing tables:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

### 2. Check each table's schema
For each expected table (`subscribers`, `events`, `orders`, `guests`), verify columns match the migration definitions:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = '{table}' AND table_schema = 'public';
```

### 3. Apply missing migrations
If any table is missing:
- Run the corresponding migration SQL against the Supabase database
- Use `psql` with `DATABASE_URL` or the Supabase SQL editor
- Verify after each migration

### 4. Verify foreign key constraints
The `orders` table has FKs to `events.slug` and `guests.id`. Confirm these constraints exist:
```sql
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint WHERE contype = 'f';
```

### 5. Seed a test event
Insert a test event for dashboard verification:
```sql
INSERT INTO events (slug, name, date, venue, walk_in_limit, capacity)
VALUES ('test-event', 'Test Event', '2026-05-03', 'TBD', 30, 200);
```

### 6. Update session report status
After verification, document the actual state so future sessions aren't confused.

## Acceptance Criteria

- All four tables exist: `subscribers`, `events`, `orders`, `guests`
- Column schemas match migration definitions
- Foreign key constraints are in place
- At least one test event is seeded
- Session report documents verified state

## Dependencies

None — this is a prerequisite for all other epics.

## Constraints

- Do NOT modify migration files — they're checked into git as the source of truth
- If tables exist but schema differs, document the delta before making changes
- Use `DATABASE_URL` env var for connection (never hardcode credentials)
