# Epic F: Dashboard Foundation

## Intent

Build the admin dashboard shell — dark-themed, mobile-first, Bloomberg-terminal inspired. This is the container that all future admin features (event reporting, guest management, settings) will live inside. Distinct from the public Win98 site.

## Current State

- **AdminLayout.astro** — Exists but uses Win98 light gray (`--win98-bg: #c0c0c0`). Has a single "Dashboard" tab and a logout link. No dark theme.
- **Admin page** — `src/pages/admin/index.astro` uses the wrong layout (`Layout.astro` instead of `AdminLayout.astro`). Shows "Coming soon" placeholder.
- **Auth** — Working. Middleware gates `/admin/*`, checks Supabase session cookies, whitelist enforcement via `src/lib/auth.ts`.
- **CSS tokens** — `src/styles/tokens.css` already has dark tokens (`--surface-dark: #000080`, `--surface-darker: #000058`, `--text-light: #ffffff`) but they're unused in admin.
- **Door page** — `src/pages/door/[event].astro` proves dark theme styling works in this codebase (uses `--surface-dark` background with white text).
- **Navigation** — Public site has BottomNav (mobile) and Taskbar (desktop) as separate components. Admin has a placeholder tab bar.

## Delta

### Modified files

- `src/layouts/AdminLayout.astro` — Dark theme overhaul: `--surface-dark` backgrounds, white text, updated 98.css overrides. Mobile-first bottom tab nav with icons (Dashboard, Events, Guests, Settings). Desktop: top bar or sidebar nav. Proper logout button (form POST, not bare link).
- `src/pages/admin/index.astro` — Switch to AdminLayout, add dashboard landing content (placeholder cards for stats that Epic G will populate).
- `src/styles/tokens.css` — Add admin-specific tokens if needed (e.g., `--admin-bg`, `--admin-surface`, `--admin-border`).

### New files

- `src/pages/admin/events.astro` — Placeholder events management page
- `src/pages/admin/guests.astro` — Placeholder guest list page
- `src/pages/admin/settings.astro` — Placeholder settings page

### No changes

- No database schema changes
- No new API endpoints
- No new dependencies

## UI Breakdown

### AdminLayout dark theme
- Background: dark navy (`--surface-dark`) or near-black
- Text: white (`--text-light`)
- Accent: `--blow-red` for active states, highlights
- 98.css window overrides: dark title bars, dark window bodies, light text
- Monospace font option for data-heavy sections

### Mobile bottom nav (< 600px)
- Fixed bottom bar, 4 tabs with SVG icons
- Dashboard | Events | Guests | Settings
- Active tab highlighted with `--blow-red`
- Pattern: matches existing BottomNav component approach

### Desktop nav (>= 600px)
- Top bar or left sidebar with same 4 sections
- Title bar shows "Blow Admin" with logout button
- Active section highlighted

### Admin sub-pages
- Each page uses AdminLayout with `title` prop
- Content area scrollable, padding consistent with `--space-md`
- All pages show "Coming soon" initially — Epic G and beyond will fill them

## Acceptance Criteria

- `pnpm build` passes
- `/admin` renders dark-themed dashboard shell (not Win98 gray)
- Bottom nav visible on mobile with 4 tabs
- Desktop nav visible on wider screens
- All 4 admin routes work: `/admin`, `/admin/events`, `/admin/guests`, `/admin/settings`
- Tab navigation highlights active page
- Logout button works (form POST to `/api/auth/logout`)
- Auth middleware still gates all `/admin/*` routes
- Visually distinct from public Win98 site

## Constraints

- Vanilla JS only (no React/Svelte), Astro islands pattern
- CSS custom properties for all theming (no hardcoded colors)
- SVG icons (not emoji — learned from mobile UI bugs session)
- Don't break public site styling (admin styles scoped to AdminLayout)
