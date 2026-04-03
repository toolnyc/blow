---
name: session-close
description: End-of-session capture — write report to Obsidian, clear sentinels
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
   - If no changes since last commit: skip to step 5

2. Summarize work done:
   - Features built or modified
   - Migrations created
   - Bugs fixed
   - Decisions made

3. Review for new conventions:
   - Did we establish any new patterns?
   - Should CLAUDE.md or AGENTS.md be updated?
   - Are any skills out of date?
   - Fix stale docs in-session before closing

4. Write session report to Obsidian:
   ```bash
   cd "/Users/pete/Dropbox/Notes/Obsidian/Clubstack" && obsidian create \
     path="Blow/Session Reports/Session — $(date '+%Y-%m-%d') <title>.md" \
     content="<report>" 2>/dev/null
   ```

   If the `obsidian` CLI is not available, write the file directly:
   ```bash
   mkdir -p "/Users/pete/Dropbox/Notes/Obsidian/Clubstack/Blow/Session Reports"
   ```
   Then use the Write tool to create the markdown file.

   ### Report Template

   ```markdown
   # Session — <date> <title>

   ## What was built
   - Bullet list of features, fixes, migrations

   ## Decisions made
   - Any architectural or product decisions with rationale

   ## Conventions established
   - New patterns or rules (if any)

   ## Open questions
   - Anything unresolved for next session

   ## Epic link
   Related epic: [[Epic X — Name]] (if applicable)
   ```

   **Rules for Obsidian content:**
   - No backticks or code fences (Obsidian renders them poorly in some contexts)
   - Plain text + simple markdown (headers, bullets, bold, wiki-links)
   - Use `[[wiki-links]]` for cross-references to other Obsidian notes
   - Keep it concise — this is a reference, not a transcript

5. Clear all sentinels:
   ```bash
   node -e "import('./.claude/hooks/sentinels.mjs').then(s => s.clearAll())"
   ```
   Also remove `.claude/epics/.active` if it exists.

6. Verify Obsidian write succeeded (check file exists).

## Rules

- Never skip the "new conventions" check — stale docs are expensive
- Fix skills/docs in the current session before clearing sentinels
- If no meaningful work was done, skip the Obsidian report but still clear sentinels
