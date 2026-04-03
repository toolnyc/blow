---
name: feature
description: Build a planned feature from an epic
requires: epic-created
sets: feature-active
---

# /feature — Build a planned feature

## Procedure

1. Resolve epic file: `.claude/epics/$ARGUMENTS.md`
   - If $ARGUMENTS is empty, check `.claude/state/epic-created` for the active slug
   - If no epic found, tell user to run `/epic` first
2. Check `feature-active` sentinel:
   - If active and <48h old: ask resume or start new
   - If active and >48h old: expired, start fresh
3. Set `feature-active` sentinel with epic slug as context
4. Clear `verify-passed` sentinel (stale from previous work)
5. Read the epic file fully and follow the delta plan

### Build Order (strict)

**Schema first** (if epic has Data Model section):
- Run `/db-migrate <name>` for each new table
- Verify migration applied before proceeding

**API layer** (if epic has API Surface section):
- Create/modify endpoints in `src/pages/api/`
- Follow existing patterns (see `subscribe.ts`, `checkin.ts`)

**UI layer** (if epic has UI Breakdown section):
- Create/modify pages in `src/pages/`
- Create/modify components in `src/components/`
- Follow existing Astro component patterns

**Verification:**
- Run `/verify` when all work is done

6. On clean verify: update epic status line to `completed`
7. Output: "Feature complete. Run `/session-close`."

## Rules

- Never write code without reading the epic first
- Fix the epic if current state is wrong (don't build on false assumptions)
- Never silently expand scope beyond what the epic defines
- Quick fixes (<5 lines to existing files) don't need an epic — just do them
