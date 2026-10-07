---
name: session-close
description: End-of-session capture — summarize work in chat, fix stale docs, clear sentinels
requires: nothing
sets: clears all sentinels
---

# /session-close — End of session

## Procedure

1. Check what changed this session:
   ```bash
   git diff --stat HEAD
   git log --oneline -10
   ```
   - If no changes since last commit: skip to step 4

2. Summarize work done, in chat:
   - Features built or modified
   - Migrations created
   - Bugs fixed
   - Decisions made, with rationale
   - Open questions for next session

3. Review for new conventions:
   - Did we establish any new patterns?
   - Should CLAUDE.md or AGENTS.md be updated?
   - Are any skills out of date?
   - Fix stale docs in-session before closing

   If a decision or post-mortem is worth keeping beyond this repo, offer to file it in Notion Tool HQ > Lab (IDs in `~/Code/toolhub/CoS/NOTION.md`). Only write there if Pete says yes.

4. Clear all sentinels:
   ```bash
   node -e "import('./.claude/hooks/sentinels.mjs').then(s => s.clearAll())"
   ```
   Also remove `.claude/epics/.active` if it exists.

## Rules

- Never skip the "new conventions" check — stale docs are expensive
- Fix skills/docs in the current session before clearing sentinels
- The summary stays in chat; don't write report files into the repo or Dropbox
- If no meaningful work was done, skip the summary but still clear sentinels
