# AGENTS.md — Blow

> Primary instruction source for all AI agents working on this project.
> CLAUDE.md is the entry point; this file has the details.

---

## Project

Blow is a DIY party series in New York. The site handles email capture, brand display, event operations (door check-in, guest lists, walk-ins), and will grow into admin dashboarding and post-event reporting.

**Live:** https://blow.nyc
**Instagram:** @blowme.nyc

---

## Stack

- **Framework:** Astro 5 (SSR via `@astrojs/vercel`)
- **Database:** Supabase (Postgres)
- **Email:** Resend (transactional + audience sync)
- **Payments:** Stripe (payment links, door QR codes)
- **Deployment:** Vercel
- **Styling:** 98.css (Windows 98 retro theme)
- **Brand color:** #ff2845

---

## Commands

```bash
pnpm dev        # localhost:4321
pnpm build      # Production build → ./dist/
pnpm preview    # Preview production build
```

---

## Environment Variables

```bash
RESEND_API_KEY          # Resend transactional email
RESEND_AUDIENCE_ID      # Resend audience for subscriber sync
RESEND_FROM_EMAIL       # From address (boss@blowme.nyc)
SUPABASE_URL            # Supabase project URL
SUPABASE_ANON_KEY       # Supabase anonymous key
DATABASE_URL            # Direct Postgres connection
```

---

## Architecture

```
src/
├── pages/
│   ├── index.astro              # Landing page (Windows 98 desktop)
│   ├── door/[event].astro       # Door check-in tool
│   └── api/
│       ├── subscribe.ts         # Email subscription
│       ├── checkin.ts           # Guest check-in (increment/undo)
│       ├── add-guest.ts         # Walk-in guest entry
│       └── delete-guest.ts      # Remove guest
├── components/
│   ├── Window.astro             # Draggable window
│   ├── BootScreen.astro         # Startup splash
│   └── Taskbar.astro            # Bottom bar with clock
└── layouts/
    └── Layout.astro             # Base HTML shell

supabase/
├── guests.sql                   # Guests table (door check-in)
└── migrations/
    └── 001_create_subscribers.sql  # Email subscribers
```

---

## Database

### guests
Door check-in data. RLS disabled (internal tool).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| event | text | Event identifier (e.g., "march21") |
| name | text | Guest name |
| email | text | Optional |
| ticket_type | text | "Walk-in", "Regular", etc. |
| tickets | int | Party size |
| checked_in_count | int | Incremented at door |
| first_checked_in_at | timestamptz | First check-in time |
| last_action_at | timestamptz | Last modification |
| created_at | timestamptz | Record creation |

### subscribers
Email list. RLS enabled.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email | text | Unique |
| subscribed_at | timestamptz | |
| unsubscribed_at | timestamptz | Nullable |

---

## Conventions

- **TypeScript strict** — no `any`, use `unknown`
- **Astro components** — `.astro` files for pages and components
- **API routes** — TypeScript files in `src/pages/api/`
- **File naming** — kebab-case throughout `src/`
- **Client-side JS** — vanilla JS in `<script>` tags, no framework
- **Styling** — 98.css for Windows theme, CSS custom properties for brand tokens
- **No inline styles** — use `<style>` blocks in Astro components

---

## Knowledge Base

Session reports and project knowledge stored in Obsidian:

```
/Users/pete/Dropbox/Notes/Obsidian/Clubstack/Blow/
├── Blow Roadmap.md
├── Phase 0 — Agentic Build Pattern.md
├── Post-Mortem — March 21 2026.md
├── Epic A–J (planned features)
└── Session Reports/
    └── Session — YYYY-MM-DD <title>.md
```

**Obsidian write pattern:**
```bash
mkdir -p "/Users/pete/Dropbox/Notes/Obsidian/Clubstack/Blow/Session Reports"
# Then use Write tool to create the markdown file
```

---

## Skills

All skills live in `.claude/skills/`. Sentinels enforce execution order.

| Skill | Requires | Sets | Purpose |
|-------|----------|------|---------|
| `/epic` | nothing | `epic-created` | Plan a feature from plain English |
| `/feature` | `epic-created` | `feature-active` | Build the planned feature |
| `/db-migrate` | `feature-active` | — | Create and apply a Supabase migration |
| `/verify` | nothing | `verify-passed` | Run `pnpm build`, fix errors |
| `/session-close` | nothing | clears all | Capture learnings to Obsidian, clear state |

### Workflow

```
/epic "add post-event reporting"
  → Plans the feature, writes .claude/epics/post-event-reporting.md
  → Sets epic-created sentinel

/feature post-event-reporting
  → Reads the epic, builds in order: schema → API → UI
  → Sets feature-active sentinel (gates new file creation)

/verify
  → Runs pnpm build, fixes errors
  → Sets verify-passed sentinel (gates git commit)

/session-close
  → Writes session report to Obsidian
  → Clears all sentinels
```

### Quick Fixes

Changes under 5 lines to existing files don't need an epic. Just edit directly.

---

## Hook System

Hooks enforce discipline via `.claude/settings.json`:

| Event | Hook | Behavior |
|-------|------|----------|
| SessionStart | `session-start.mjs` | Dirty exit detection, resume prompt |
| PreToolUse | `pre-tool-gate.mjs` | Hard-block new `src/` or `supabase/` files without `feature-active`; soft-warn on commit without `verify-passed` |
| PostToolUse | `post-tool-schema.mjs` | Lint SQL migrations (RLS, conventions) |
| Stop | `stop.mjs` | Remind to run `/session-close` |

---

## Git

- Branch: `master` (single branch for now)
- Commits: imperative, lowercase, no period
- No force pushes
