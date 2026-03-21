-- Run this in the Supabase SQL editor before seeding

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  name text not null,
  email text,
  ticket_type text,
  tickets int not null default 1,
  notes text,
  checked_in_count int not null default 0,
  first_checked_in_at timestamptz,
  last_action_at timestamptz,
  created_at timestamptz default now(),
  unique(event, name)
);

-- This is an internal tool table, not user-facing — disable RLS
alter table guests disable row level security;

create index if not exists guests_event_idx on guests(event);
