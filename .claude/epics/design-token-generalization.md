# Epic: Design Token Generalization

## Intent

Extract shared design tokens (colors, spacing, typography) into CSS custom properties. Reskin the door page to use 98.css window chrome with a dark color scheme (not sleek/modern — retro Win98 feel). Create an admin layout with bottom tab nav. Add a public-site bottom nav with Subscribe | Mixtapes | Events | Admin links.

## Current State

- **Design tokens:** Brand color `#ff2845` is hardcoded across files. `Layout.astro` has a few `.brand-accent` / `button.brand` utility classes but most pages use raw hex values.
- **Door page (`door/[event].astro`):** Fully custom dark UI — `#111` header, `#2a2a2a` inputs, `#f0f0f0` background. Does NOT use 98.css. Does NOT use Layout.astro. ~810 lines, self-contained with inline styles.
- **Public site:** Uses 98.css via CDN (`unpkg.com/98.css`). Layout.astro provides the desktop background + taskbar. Windows are draggable 98.css windows.
- **Taskbar:** Win98-style bottom taskbar with Start menu. Contains Subscribe, Mixtapes, Events items. No persistent bottom nav for mobile.
- **Admin layout:** Does not exist yet.
- **98.css:** Installed as npm dep (`98.css@^0.1.21`) AND loaded via CDN in Layout.astro.

## Delta

### New files
- `src/styles/tokens.css` — CSS custom properties for brand colors, neutrals, spacing, typography
- `src/layouts/AdminLayout.astro` — 98.css themed layout with bottom tab nav for admin pages
- `src/components/BottomNav.astro` — Public site bottom nav: Subscribe | Mixtapes | Events | Admin

### Modified files
- `src/layouts/Layout.astro` — Import tokens.css, replace hardcoded colors with custom properties, add BottomNav
- `src/pages/door/[event].astro` — Reskin: add 98.css import, use window chrome for header/modals, dark Win98 palette, replace modern rounded styles with retro equivalents
- `src/pages/index.astro` — Replace hardcoded brand colors with token vars
- `src/components/Taskbar.astro` — Add "Admin" menu item (shared with Epic 1)

## Design Tokens (`tokens.css`)

```css
:root {
  /* Brand */
  --blow-red: #ff2845;
  --blow-red-dark: #cc1f37;

  /* Neutrals (dark palette for door/admin) */
  --surface-dark: #000080;
  --surface-darker: #000058;
  --text-light: #ffffff;
  --text-muted: #808080;

  /* Win98 system colors */
  --win98-bg: #c0c0c0;
  --win98-active: #000080;
  --win98-white: #ffffff;
  --win98-border-light: #ffffff;
  --win98-border-dark: #808080;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-system: 'Pixelated MS Sans Serif', Arial, sans-serif;
  --font-size-sm: 11px;
  --font-size-base: 13px;
  --font-size-lg: 16px;
}
```

## UI Breakdown

### Door page reskin
- Import 98.css (from npm, not CDN)
- Wrap header in a 98.css `window` with title bar "Blow — Door"
- PIN modal and QR modal use 98.css `window` chrome
- Add guest form uses 98.css input/button styles
- Dark background: use Win98 navy (`#000080`) or similar dark retro color instead of `#111`
- Guest rows: keep functional layout but use 98.css sunken panel (`sunken`) for the list area
- Buttons: 98.css styled with brand red accent for primary actions
- No rounded corners, no modern shadows — boxy retro feel
- Keep the functional UX identical (search, check-in, QR, add guest, PIN)

### Bottom nav (public site)
- Fixed bottom bar, replaces or supplements existing Taskbar
- Four items: Subscribe | Mixtapes | Events | Admin
- Subscribe/Mixtapes/Events scroll to or open the corresponding window
- Admin navigates to `/admin` (or `/?login=1` if no session)
- 98.css styled: raised panel, 98.css buttons
- Mobile-first: visible on all screen sizes

### Admin layout
- 98.css themed shell (gray desktop background)
- Title bar at top: "Blow Admin"
- Bottom tab nav: tabs for admin sections (placeholder for now — Dashboard tab active)
- Content area renders child pages
- Logout button in title bar

## Acceptance Criteria

- `pnpm build` passes
- `tokens.css` exists and defines all brand/system tokens
- Door page uses 98.css window chrome for header and modals
- Door page has retro boxy aesthetic, no rounded corners or modern styling
- Door page functional behavior unchanged (search, check-in, QR, add guest, PIN)
- Public site bottom nav shows Subscribe | Mixtapes | Events | Admin
- Admin layout renders with bottom tab nav
- All hardcoded `#ff2845` replaced with `var(--blow-red)` in modified files

## Known Risks

- **Door page is ~810 lines.** The reskin touches styles throughout — high risk of breaking the functional JS. Must preserve all `id` and `class` selectors used by the script.
- **98.css specificity.** 98.css has opinionated base styles. Dark mode override will need careful specificity management.
- **Taskbar vs BottomNav.** The existing Taskbar is Win98 desktop chrome. The new BottomNav is a mobile-first navigation bar. Need to decide: show both on desktop, BottomNav only on mobile? Current plan: BottomNav on all sizes, Taskbar remains as desktop chrome.
