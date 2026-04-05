# Epic: Dynamic Checkout

## Intent

Make the Stripe checkout flow event-aware. Currently the checkout endpoint hardcodes event metadata and pricing tier lookup keys. This epic parameterizes checkout so each event can have its own pricing configuration, and the public site dynamically shows the correct buy buttons for the active event.

## Dependencies

- **Database Migrations Verification** — `events` and `orders` tables must exist
- **Event Creation Form** — events must be manageable before dynamic checkout makes sense

## Current State

### Checkout endpoint (`src/pages/api/create-checkout.ts`)
- Accepts `{ tier, quantity, event }` but `event` defaults to hardcoded value
- Uses Stripe lookup keys `blow-regular` and `blow-supporter` — these are global, not per-event
- Returns Stripe checkout URL
- Line items reference a single set of prices

### Stripe webhook (`src/pages/api/stripe-webhook.ts`)
- Handles `checkout.session.completed`
- Creates `orders` record with event slug from metadata
- Upserts `guests` record linked to order
- Adds customer to Resend audience
- **Working correctly** — just needs the checkout side to pass correct event metadata

### Public site (`src/pages/index.astro`)
- Buy buttons hardcoded: Regular ($20), Supporter ($30)
- Buttons currently disabled
- No event selector — assumes one active event

### Events table
- Has `stripe_url` column (payment link URL) but no structured pricing data
- No per-event price configuration

## Delta

### Schema change

Add pricing configuration to the events table:

```sql
-- Migration: 004_add_event_pricing.sql
ALTER TABLE events
  ADD COLUMN pricing jsonb DEFAULT '[]'::jsonb;

-- Example pricing value:
-- [
--   { "tier": "regular", "label": "Regular", "price_cents": 2000, "stripe_price_id": "price_xxx" },
--   { "tier": "supporter", "label": "Supporter", "price_cents": 3000, "stripe_price_id": "price_yyy" }
-- ]

COMMENT ON COLUMN events.pricing IS 'Array of pricing tiers with Stripe price IDs';
```

**Why JSONB:** Pricing tiers vary per event (some events might have VIP, early bird, etc.). A flexible JSON array avoids a separate `event_tiers` table for what's currently 2-3 rows per event.

### Modified files

#### `src/pages/api/create-checkout.ts`
- Accept `event` slug as required parameter
- Look up event from database to get pricing config
- Use event-specific `stripe_price_id` instead of global lookup keys
- Pass event slug in Stripe metadata (already partially done)
- Validate tier exists for this event

```typescript
// Before: hardcoded lookup key
line_items: [{ price: 'blow-regular', quantity }]

// After: event-specific price ID
const event = await getEvent(slug);
const tier = event.pricing.find(t => t.tier === tierName);
line_items: [{ price: tier.stripe_price_id, quantity }]
```

#### `src/pages/index.astro`
- Fetch active/upcoming event from database
- Render buy buttons dynamically from event pricing tiers
- Show event name and date
- If no active event, show "No upcoming events" state
- Enable/disable buttons based on event availability

#### `src/pages/api/stripe-webhook.ts`
- No changes needed — already reads event from metadata and creates orders correctly

### New API endpoint

#### GET `/api/active-event`
Returns the current/next upcoming event with pricing for the public site.
```json
{
  "event": {
    "slug": "may3",
    "name": "Blow — May 3",
    "date": "2026-05-03",
    "pricing": [
      { "tier": "regular", "label": "Regular", "price_cents": 2000 },
      { "tier": "supporter", "label": "Supporter", "price_cents": 3000 }
    ]
  }
}
```
**No auth required** — public endpoint. Excludes `stripe_price_id` from response (server-side only).

### Event creation form update
The event creation form (previous epic) needs a pricing section:
- Add/remove pricing tiers
- Each tier: label, price (dollars), Stripe price ID
- Stripe price IDs are created in the Stripe dashboard and pasted in (same pattern as `stripe_url`)

### New files

- `supabase/migrations/004_add_event_pricing.sql`
- `src/pages/api/active-event.ts`

## Acceptance Criteria

- Checkout uses event-specific Stripe price IDs from the database
- Public site dynamically shows pricing for the active event
- Buy buttons render correct tier labels and prices
- If no active event, buttons are hidden/disabled gracefully
- Stripe webhook continues to create orders correctly
- Event creation form includes pricing tier configuration
- `pnpm build` passes
- Works on mobile

## Constraints

- Stripe products/prices are still created manually in the Stripe dashboard
- Price IDs are pasted into the event form (no Stripe API for product creation)
- Only one "active" event at a time on the public site (closest upcoming by date)
- JSONB pricing keeps the schema simple — no separate tiers table
