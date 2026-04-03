---
name: epic
description: Plan a feature from plain English before building
requires: nothing
sets: epic-created
---

# /epic — Plan a feature

## Procedure

1. Accept plain English description from $ARGUMENTS
2. Explore the codebase to understand current state:
   - `src/pages/` — existing routes
   - `src/components/` — existing UI
   - `src/pages/api/` — existing endpoints
   - `supabase/` — existing schema
3. Check for existing `.claude/state/epic-created` — if set, ask if replacing
4. Derive slug (kebab-case, max 5 words) from the description
5. Write `.claude/epics/<slug>.md` with this structure:

```markdown
# Epic: <Title>

## Intent
What we're building and why.

## Current State
What exists today (from actual codebase exploration, not assumptions).

## Delta
Minimal changes needed. List new files, modified files, new tables.

## Data Model
New or modified tables with column definitions. Skip if no DB changes.

## API Surface
New or modified endpoints. Skip if no API changes.

## UI Breakdown
Pages and components needed. Skip if no UI changes.

## Acceptance Criteria
Testable statements (build passes, endpoint returns X, page renders Y).

## Known Risks
What could go wrong or block progress.
```

6. Show the epic to the user and wait for confirmation
7. On confirmation: set `epic-created` sentinel with the slug as context
8. Output: "Epic saved. Run `/feature <slug>` to build."

## Rules

- Current state must come from reading the actual codebase, not assumptions
- Delta should be minimal — don't over-scope
- Acceptance criteria must be testable (buildable, verifiable)
- Never auto-confirm — always wait for user approval
