# Epic: Door Page Database Wiring

## Intent

Replace all hardcoded event configuration in the door page with database lookups from the `events` table. The door page currently has a `EVENT_CONFIG` JavaScript object that maps event slugs to walk-in limits and Stripe URLs. This breaks every time a new event is created and requires a code deploy to change settings.

## Dependencies

- **Database Migrations Verification** — `events` table must exist and be populated
- **Event Creation Form** — should be able to create events before wiring the door

## Current State

### Door page (`src/pages/door/[event].astro`)
- Route param `[event]` is the event slug (e.g., `/door/may3`)
- **Hardcoded `EVENT_CONFIG`:**
  ```javascript
  const EVENT_CONFIG = {
    'march21': { walkinLimit: 30 },
    'may5': { walkinLimit: 30 },
  };
  ```
- Walk-in limit enforcement uses this config
- Stripe URL for QR code display may also be hardcoded or in config
- Guest data comes from Supabase `guests` table (already database-driven)
- Check-in API (`/api/checkin`) works correctly

### Add guest API (`src/pages/api/add-guest.ts`)
- Walk-in limit is hardcoded to 30:
  ```typescript
  const WALK_IN_LIMIT = 30;
  ```
- Should read from `events.walk_in_limit`

### Events table schema
- `slug` — matches route param
- `name` — display name
- `walk_in_limit` — per-event walk-in cap
- `stripe_url` — payment link for QR display
- `capacity` — total event capacity

## Delta

### Modified files

#### `src/pages/door/[event].astro`
- **Server-side (frontmatter):** Fetch event from `events` table by slug
  ```typescript
  const { event: slug } = Astro.params;
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!event) return Astro.redirect('/admin');
  ```
- Pass event data (name, walk_in_limit, stripe_url, capacity) to the template
- **Remove `EVENT_CONFIG`** object entirely
- Update walk-in limit references to use database value
- Update QR code / Stripe URL to use `event.stripe_url`
- Update page title to use `event.name`
- **404 handling:** If event slug doesn't exist in database, show error or redirect

#### `src/pages/api/add-guest.ts`
- Accept `event` slug in request body (already does)
- Look up event from database to get `walk_in_limit`
- Replace hardcoded `WALK_IN_LIMIT = 30` with database value
- If event not found, return 404

#### `src/pages/api/checkin.ts`
- No changes needed — already works with guest records, doesn't reference event config

#### `src/pages/api/delete-guest.ts`
- No changes needed — operates on guest ID only

### Edge cases

1. **Event doesn't exist:** Door page should show a clear error ("Event not found") rather than a blank page or crash
2. **No walk-in limit set:** Default to 30 if `walk_in_limit` is null in the database
3. **No Stripe URL:** Hide the QR/payment section if `stripe_url` is null
4. **Capacity tracking:** Optionally show total capacity vs. current guest count (if `capacity` is set)

### No new files

This epic modifies existing files only. No new pages, components, or API endpoints.

## Acceptance Criteria

- Door page loads event configuration from the `events` table
- `EVENT_CONFIG` hardcoded object is removed
- Walk-in limit enforced per-event from database
- Add-guest API uses per-event walk-in limit from database
- Door page shows event name from database
- QR code / Stripe URL uses `event.stripe_url`
- Invalid event slugs show a clear error state
- Existing check-in flow works identically
- `pnpm build` passes
- Works on mobile (primary use case — Pete uses this at the door)

## Constraints

- Do not change the URL structure (`/door/[event]`)
- Do not change the check-in UX or guest list behavior
- Keep the door page self-contained (no imports from admin code)
- The door page does NOT require admin auth — it's a separate operational tool
