# Epic: Event Creation Form

## Intent

Build an admin UI for creating and editing events. Currently events must be seeded directly in the database — there's no way for Pete to create an event from his phone before a party. This is the missing link between "database exists" and "dashboard is useful."

## Dependencies

- **Database Migrations Verification** — `events` table must exist
- **Epic F (Dashboard Foundation)** — AdminLayout must exist (done)

## Current State

- **`events` table schema:** id, slug, name, date, venue, walk_in_limit, stripe_url, capacity, created_at
- **No create/edit UI** — admin pages are read-only or placeholder
- **`/admin/settings.astro`** — "coming soon" placeholder, natural home for event management
- **No API endpoint** for creating/updating events
- **Stripe products** are created manually in the Stripe dashboard; the `stripe_url` field stores a payment link URL

## Delta

### New API endpoints

#### POST `/api/events`
Create a new event.
```json
// Request
{
  "slug": "may3",
  "name": "Blow — May 3",
  "date": "2026-05-03",
  "venue": "TBD",
  "walk_in_limit": 30,
  "capacity": 200,
  "stripe_url": "https://buy.stripe.com/xxx"
}

// Response
{ "event": { "id": "uuid", "slug": "may3", ... } }
```

**Validation:**
- `slug` required, unique, lowercase alphanumeric + hyphens
- `name` required
- `date` required, must be valid date
- `walk_in_limit` optional, default 30
- `capacity` optional
- `stripe_url` optional (can be added later)

**Auth:** Require admin session (same pattern as `event-stats.ts`)

#### PUT `/api/events`
Update an existing event.
```json
// Request
{ "slug": "may3", "name": "Blow — May 3 (Updated)", "capacity": 250 }
```
Only provided fields are updated. `slug` identifies the record.

#### GET `/api/events`
List all events (already exists as `/api/events-list.ts` — may need to be extended or replaced).

### New page: Event management

Replace `/admin/settings.astro` placeholder OR create `/admin/events/new.astro`.

**Recommended approach:** Add event management to the existing `/admin/events.astro` page as a secondary view. The primary view is the event night reporting dashboard; a "Manage Events" tab or section shows the creation form and event list.

### UI Breakdown

#### Event list view
- List of all events, most recent first
- Each row: name, date, venue, slug, guest count
- Tap to edit
- "New Event" button at top
- Nothing design: `--surface` cards, Space Mono data labels, divider rows

#### Event creation/edit form
- **Fields:**
  - Event name (text input)
  - Slug (auto-generated from name, editable)
  - Date (date input)
  - Venue (text input)
  - Capacity (number input, optional)
  - Walk-in limit (number input, default 30)
  - Stripe URL (text input, optional — paste from Stripe dashboard)
- **Layout:** Single column, underline inputs (Nothing design pattern)
- **Labels:** Space Mono, ALL CAPS, `--text-secondary`
- **Submit:** Primary pill button `[ CREATE EVENT ]`
- **Feedback:** Inline `[SAVED]` / `[ERROR: ...]` bracket text (no toasts)

#### Stripe product attachment
For v1, Stripe products are created manually in the Stripe dashboard and the payment link URL is pasted into the event form. This is intentional — Stripe product creation via API adds complexity without much value at current scale.

**Future (not this epic):** API-driven Stripe product creation with tier configuration per event.

### Modified files

- `src/pages/admin/events.astro` — Add event management section/tab alongside existing reporting dashboard
- `src/styles/tokens.css` — No changes needed (Nothing tokens will be in a separate stylesheet)

### New files

- `src/pages/api/events.ts` — POST (create) and PUT (update) endpoints
- Possibly `src/pages/admin/events/new.astro` if using a separate page instead of inline form

## Acceptance Criteria

- Admin can create a new event from `/admin/events` on mobile
- Admin can edit an existing event
- Event list shows all events with key metadata
- Slug auto-generates from name but is editable
- Validation prevents duplicate slugs and missing required fields
- Inline error/success feedback (no toasts)
- `pnpm build` passes
- Works on mobile (primary use case)

## Constraints

- Vanilla JS only — no framework libraries
- Nothing design system for styling (admin stylesheet)
- Auth required on all endpoints (admin session check)
- No Stripe API integration in this epic — URL paste only
