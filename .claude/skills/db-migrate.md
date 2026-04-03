---
name: db-migrate
description: Create and apply a Supabase migration
requires: feature-active
sets: nothing
---

# /db-migrate — Create a Supabase migration

## Procedure

**$ARGUMENTS** — descriptive name (e.g., `create-event-metrics`)

1. Determine next migration number:
   - Check `supabase/migrations/` for existing files
   - Next number = highest existing + 1 (zero-padded 3 digits)
2. Create file: `supabase/migrations/<NNN>_<name>.sql`
3. Write SQL following these conventions:

### Table Conventions

```sql
create table if not exists <name> (
  id uuid primary key default gen_random_uuid(),
  -- domain columns here
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: explicitly enable or disable with comment explaining why
alter table <name> enable row level security;
-- OR
alter table <name> disable row level security;  -- internal tool, no public access
```

### Rules

- Primary key: `id uuid default gen_random_uuid()`
- Every table gets `created_at` and `updated_at`
- Foreign keys use `references <table>(id)`
- Add indexes for columns used in WHERE clauses
- Unique constraints for natural keys (e.g., `unique(event, email)`)
- RLS decision must be explicit with a comment justifying enable/disable
- Never store secrets or PII beyond what's operationally necessary

4. Show the migration to the user for review before applying
5. Apply: `node --env-file .env.local -e "..."` or direct psql if DATABASE_URL available
6. Output: "Migration applied. Verify in Supabase dashboard."
