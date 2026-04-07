-- Access codes: unlock hidden tiers for early/exclusive purchases
create table access_codes (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  code text not null,
  tier_names text[] not null,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz default now(),
  unique(event_slug, code)
);

create index idx_access_codes_event on access_codes(event_slug);

alter table access_codes disable row level security;

-- Email campaigns: targeted sends to audience segments
create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  html_body text not null,
  audience_segment jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'failed')),
  sent_count int not null default 0,
  resend_batch_id text,
  created_at timestamptz default now()
);

alter table email_campaigns disable row level security;
