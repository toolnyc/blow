# Epic G: Event Night Reporting

## Intent

Build a real-time event night dashboard inside the admin shell showing door stats, check-in timeline, guest list, and revenue breakdown. This is the primary tool Pete uses during events to monitor the door.

## Dependencies

- **Epic F (Dashboard Foundation)** — AdminLayout and admin nav must exist before this page can be built.

## Current State

- **Guests table** — Tracks name, event, ticket_type, tickets (party size), checked_in_count, first_checked_in_at, last_action_at. No RLS (internal tool).
- **Door page** — `src/pages/door/[event].astro` already computes real-time stats: total checked in, total party size, walk-in count with limits. Dark themed, functional.
- **Check-in API** — `POST /api/checkin` handles increment/undo with validation. Returns updated count.
- **Stripe integration** — `create-checkout.ts` creates sessions with tier metadata. `stripe-webhook.ts` handles `checkout.session.completed` but only syncs email to subscribers table.
- **Event config** — Hardcoded in door page: `EVENT_CONFIG` maps event slugs to walkinLimit and stripeUrl. Not in database.

## Key Gaps Found

1. **Stripe → Guests disconnect** — Webhook creates subscriber records but never creates guest records or stores payment data. Revenue reporting is impossible without this link.
2. **No events table** — Event configuration (name, date, capacity, pricing) is hardcoded in the door page. Needs to be centralized.
3. **No orders/payments table** — Stripe checkout data (tier, quantity, amount, session ID) is not stored anywhere in our database.
4. **Hardcoded event in checkout** — `create-checkout.ts` has `event: 'may5'` hardcoded in metadata. Needs parameterization.

## Delta

### Schema changes (migrations)

- **`events` table** — id, slug (text, unique), name, date, venue, walk_in_limit, stripe_url, capacity, created_at
- **`orders` table** — id, event (text, FK to events.slug), guest_id (FK to guests.id, nullable), stripe_session_id (unique), customer_email, ticket_type, quantity, amount_cents, status, created_at

### Modified files

- `src/pages/api/stripe-webhook.ts` — After `checkout.session.completed`: create order record, upsert guest record linked to event, then sync subscriber.
- `src/pages/api/create-checkout.ts` — Accept `event` parameter instead of hardcoding. Pass to Stripe metadata.
- `src/pages/door/[event].astro` — Read event config from `events` table instead of hardcoded `EVENT_CONFIG` (or keep hardcoded for now, migrate later).

### New files

- `supabase/migrations/002_create_events.sql` — Events table
- `supabase/migrations/003_create_orders.sql` — Orders table
- `src/pages/api/event-stats.ts` — `GET /api/event-stats?event=may5` returns aggregated metrics
- `src/pages/admin/events.astro` — Replace placeholder with event night dashboard (or new sub-route)

### New API endpoint

#### GET `/api/event-stats?event={slug}`
```json
{
  "event": "may5",
  "total_guests": 120,
  "checked_in": 85,
  "walk_ins": 15,
  "walk_in_limit": 30,
  "pre_sale": 105,
  "revenue_cents": 245000,
  "by_tier": {
    "Regular": { "count": 80, "revenue_cents": 160000 },
    "Supporter": { "count": 25, "revenue_cents": 75000 },
    "Walk-in": { "count": 15, "revenue_cents": 10000 }
  },
  "recent_checkins": [
    { "name": "Jane", "ticket_type": "Regular", "checked_in_at": "2026-05-03T23:15:00Z" }
  ]
}
```

## UI Breakdown

### Event selector
- Dropdown or tab to pick active event
- Defaults to most recent/upcoming event

### Stats cards (top row)
- Total Guests | Checked In | Walk-ins (x / limit) | Revenue
- Large numbers, monospace font, dark cards with `--blow-red` accents
- Update every 5-10 seconds via polling

### Check-in timeline
- Simple SVG or canvas chart showing cumulative arrivals over time
- X-axis: time (9pm–4am), Y-axis: headcount
- Derived from `first_checked_in_at` timestamps

### Live guest feed
- Scrollable list of recent check-ins
- Name, ticket type, timestamp
- New entries appear at top with subtle highlight

### Revenue breakdown
- By tier: Regular / Supporter / Walk-in
- Count + total per tier

## Real-time Strategy

**Phase 1 (MVP):** Polling `/api/event-stats` every 5 seconds. Simple, no infrastructure changes.

**Phase 2 (optional):** Supabase Realtime channel subscriptions on `guests` table for instant updates. Only needed if multiple staff watch simultaneously.

## Acceptance Criteria

- `pnpm build` passes
- `/admin/events` shows event night dashboard for selected event
- Stats cards display accurate counts from database
- Revenue displays correctly (requires orders table populated via Stripe webhook)
- Dashboard auto-refreshes via polling
- Check-in timeline renders from existing `first_checked_in_at` data
- New walk-ins and check-ins appear in live feed
- Works on mobile (primary use case — Pete checks phone at door)

## Known Risks

- **Stripe webhook enhancement is critical path** — Revenue data won't exist until webhook creates order records. Backfilling historical data for march21 event may not be possible.
- **Event config migration** — Moving from hardcoded `EVENT_CONFIG` to database requires careful transition to not break the door page.
- **Chart rendering** — Vanilla JS chart (no Chart.js) keeps bundle small but limits chart quality. Simple SVG line chart is sufficient for MVP.
