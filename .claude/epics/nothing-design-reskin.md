# Epic: Nothing Design Reskin (Admin + Door)

## Intent

Restyle the admin dashboard and door page using the Nothing design system — a monochromatic, typographically-driven design language inspired by Swiss modernism and instrument panels. The public Win98 site stays untouched. This creates two distinct visual identities: retro desktop (public) and precision instrument (operations).

## Dependencies

- **Epic F (Dashboard Foundation)** — AdminLayout exists (done)
- **Nothing design skill** installed at `~/.claude/skills/nothing-design/`

## Current State

### Admin styling
- `AdminLayout.astro` has custom dark theme: `--admin-bg: #0a0a0f`, `--admin-surface: #14141f`
- Uses `Pixelated MS Sans Serif` font (Win98 aesthetic — wrong for instrument panel)
- No 98.css loaded (good — clean slate)
- Mobile bottom nav + desktop top nav already built
- Event reporting page (`events.astro`) has stats cards, SVG chart, guest table

### Door page styling
- Loads 98.css via CDN
- Light background with Win98 window chrome
- Custom color overrides for check-in states (yellow partial, green full)
- ~810 lines, heavily styled inline

### Current tokens (`src/styles/tokens.css`)
- Mix of Win98 system colors, brand colors, and admin dark tokens
- `--blow-red: #ff2845` is the brand accent
- `--font-system: 'Pixelated MS Sans Serif'`

### Public site
- 98.css + Win98 desktop metaphor
- **Must not change** — this epic does not touch the public site

## Architecture: Two Stylesheets

### 1. `src/styles/nothing.css` — Admin + Door stylesheet
New file. Contains all Nothing design tokens adapted for Blow:
- Nothing color system (OLED black, surface grays, text hierarchy)
- Blow red (`#ff2845`) as the accent color (replacing Nothing's `#D71921`)
- Space Grotesk + Space Mono typography
- Doto for hero display numbers
- 8px spacing grid
- Component patterns (buttons, inputs, cards, tables, nav)

### 2. `src/styles/tokens.css` — Public site tokens (unchanged)
Keep existing Win98 tokens for the public site. No modifications.

### Loading strategy
- `AdminLayout.astro` → loads `nothing.css` (replaces current inline admin styles)
- `door/[event].astro` → loads `nothing.css` (replaces 98.css + custom overrides)
- `Layout.astro` → continues loading 98.css + `tokens.css` (no change)

## Delta

### New files

#### `src/styles/nothing.css`
Complete Nothing design system tokens + base styles adapted for Blow.

**Accent color mapping:**
| Nothing token | Blow value | Reason |
|---------------|-----------|--------|
| `--accent` | `#ff2845` | Blow brand red replaces Nothing red |
| `--accent-subtle` | `rgba(255, 40, 69, 0.15)` | Tinted brand red |
| All other tokens | Same as Nothing spec | No reason to deviate |

**Font loading:**
```html
<link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;700&family=Space+Grotesk:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

**Base styles included:**
- CSS reset (box-sizing, margin, padding)
- Body defaults (font, color, background)
- `.label` utility (Space Mono, ALL CAPS, letter-spacing)
- `.data` utility (Space Mono, tabular-nums)
- Button variants (primary pill, secondary outlined, ghost, destructive)
- Input styles (underline preferred)
- Card/surface styles
- Table styles
- Navigation patterns
- State patterns (loading, empty, error, disabled)

### Modified files

#### `src/layouts/AdminLayout.astro`
- Import `nothing.css` instead of inline admin styles
- Load Google Fonts (Space Grotesk, Space Mono, Doto)
- Restyle nav using Nothing navigation pattern:
  - Mobile bottom bar: Space Mono ALL CAPS labels, active = `--text-display` + underline
  - Desktop top bar: horizontal text nav, bracket or pipe style
- Remove all inline `<style>` admin color/font definitions (moved to `nothing.css`)
- Keep layout structure (slot, nav, logout) — only restyle

#### `src/pages/admin/index.astro`
- Restyle dashboard cards as Nothing widgets:
  - `--surface` background, 16px radius
  - Hero metric: large Space Mono/Doto, left-aligned
  - Category label: ALL CAPS Space Mono, `--text-secondary`
  - No shadows, no gradients
- Dot-grid background for empty state areas

#### `src/pages/admin/events.astro`
- Restyle stats cards: Nothing widget pattern
- Restyle arrival timeline chart:
  - Line 1.5px `--text-display`
  - Axis labels: Space Mono `--caption`
  - Grid: `--border`, horizontal only
  - No area fill
- Restyle revenue breakdown table: Nothing table pattern
  - Header: `--label` style
  - Numbers: Space Mono, right-aligned
  - No zebra striping
- Restyle guest list: Nothing list/data row pattern
  - Dividers instead of alternating backgrounds
  - Status via segmented progress bars or color-coded values
- Replace event selector dropdown with Nothing segmented control or bracket nav

#### `src/pages/admin/guests.astro`
- Restyle placeholder using Nothing empty state pattern:
  - Centered, 96px+ padding
  - Headline `--text-secondary`
  - Optional dot-matrix illustration
  - No mascot/emoji

#### `src/pages/admin/settings.astro`
- Same Nothing empty state treatment

#### `src/pages/door/[event].astro`
- **Remove 98.css CDN import**
- **Import `nothing.css`**
- Restyle header/event info bar:
  - `--surface` background
  - Event name: `--heading` size, Space Grotesk
  - Stats: Space Mono data values with `--label` units
- Restyle guest list:
  - `--surface` cards or `--border` divider rows
  - Check-in states: use Nothing status colors
    - Not checked in: `--text-primary` (neutral)
    - Partially checked in: `--warning` value color
    - Fully checked in: `--success` value color
  - Walk-in badge: `--border-visible` outlined chip
- Restyle buttons:
  - Check-in: Primary pill button (white bg, black text)
  - Undo: Ghost button
  - Add guest: Secondary outlined button
- Restyle search input: underline style with `--label` placeholder
- Restyle modals (QR, PIN):
  - Backdrop `rgba(0,0,0,0.8)`
  - Dialog `--surface` + `1px solid --border-visible` + 16px radius
  - Close: `[ X ]` ghost button
- Walk-in counter: segmented progress bar (signature Nothing element)
  - Discrete blocks showing walk-ins used vs. limit
  - Fills with `--accent` when over limit

### Unchanged files

- `src/styles/tokens.css` — no changes
- `src/layouts/Layout.astro` — no changes
- `src/pages/index.astro` — no changes
- `src/components/Window.astro`, `Taskbar.astro`, `BootScreen.astro`, `BottomNav.astro` — no changes
- All API endpoints — no changes

## UI Specifications

### Typography hierarchy (admin)
| Level | Font | Size | Weight | Color | Use |
|-------|------|------|--------|-------|-----|
| Display | Doto | 48–72px | 400 | `--text-display` | Hero metrics (total guests, revenue) |
| Heading | Space Grotesk | 24px | 500 | `--text-display` | Page titles, section heads |
| Body | Space Grotesk | 16px | 400 | `--text-primary` | Descriptions, guest names |
| Data | Space Mono | 14–16px | 400 | `--text-primary` | Numbers, counts, amounts |
| Label | Space Mono | 11px | 400 | `--text-secondary` | ALL CAPS category labels |
| Caption | Space Mono | 12px | 400 | `--text-secondary` | Timestamps, footnotes |

### Color mapping (admin + door)
| Purpose | Token | Value |
|---------|-------|-------|
| Background | `--black` | `#000000` |
| Card surface | `--surface` | `#111111` |
| Elevated surface | `--surface-raised` | `#1A1A1A` |
| Subtle border | `--border` | `#222222` |
| Visible border | `--border-visible` | `#333333` |
| Muted text | `--text-secondary` | `#999999` |
| Body text | `--text-primary` | `#E8E8E8` |
| Headlines | `--text-display` | `#FFFFFF` |
| Brand accent | `--accent` | `#ff2845` |
| Checked in | `--success` | `#4A9E5C` |
| Partial check-in | `--warning` | `#D4A843` |
| Over limit | `--accent` | `#ff2845` |

### Navigation (admin)
- **Mobile bottom bar:** 4 tabs, Space Mono ALL CAPS, active = white text + 2px bottom border in `--accent`
- **Desktop top bar:** `[ DASHBOARD ]  EVENTS  GUESTS  SETTINGS` bracket style, active = `--text-display`
- **Logout:** Ghost button, `--text-secondary`, right-aligned

### Door page specifics
- **Header bar:** Fixed top, `--surface` bg, event name left, stats right
- **Guest row:** Full-width, `1px solid --border` divider, 12px vertical padding
  - Name (Space Grotesk, `--text-primary`)
  - Ticket type chip (outlined, `--caption`)
  - Check-in count (Space Mono, status-colored)
  - Action buttons right-aligned
- **Walk-in progress:** Segmented bar below header, discrete blocks, 8px height
- **Add guest modal:** `--surface` dialog, underline inputs, `[ ADD GUEST ]` primary pill
- **QR modal:** `--surface` dialog, QR code centered, `[ CLOSE ]` ghost button

## Acceptance Criteria

- Admin dashboard uses Nothing design system (Space Grotesk/Mono, OLED black, instrument aesthetic)
- Door page uses Nothing design system (same tokens, same fonts)
- Public Win98 site is completely unaffected
- `nothing.css` is a standalone stylesheet — no dependencies on `tokens.css`
- Google Fonts loaded only on admin + door pages (not public site)
- All existing functionality preserved (check-in, stats, nav, auth)
- Mobile-first responsive design maintained
- Minimum 44px touch targets on all interactive elements
- Stats display uses appropriate Nothing patterns (segmented bars, data labels)
- `pnpm build` passes
- No 98.css loaded on admin or door pages

## Constraints

- Vanilla JS only — no framework
- CSS custom properties for all theming (no hardcoded colors in component styles)
- SVG icons only (Lucide preferred), monoline 1.5px stroke
- No shadows, gradients, blur, or bounce animations anywhere
- No toasts — use inline bracket text for feedback
- Door page must remain fast — no heavy font loads that block rendering
- Preserve all existing `id` and `class` selectors used by JavaScript (door page has ~200 lines of vanilla JS)

## Known Risks

- **Door page is ~810 lines** with deeply integrated styles. Reskinning without breaking JS requires careful preservation of all `id`, `class`, and structural selectors.
- **Font loading performance** — Space Grotesk + Space Mono + Doto is 3 font families. Use `font-display: swap` and preconnect to avoid FOIT.
- **Admin events page is ~1,044 lines** — largest page, most complex styling. Should be reskinned section by section, not all at once.
- **Blow red vs Nothing red** — `#ff2845` (Blow) vs `#D71921` (Nothing). Using Blow red maintains brand consistency but slightly changes the Nothing aesthetic. This is intentional.
