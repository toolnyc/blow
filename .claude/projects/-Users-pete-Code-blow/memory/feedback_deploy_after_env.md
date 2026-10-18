---
name: feedback_deploy_after_env
description: Never deploy before confirming env vars are set — sequence matters
type: feedback
---

Never deploy until env var changes are confirmed set by the user. Deploying before env vars are ready bakes in empty/stale values and breaks prod.

**Why:** Deployed twice before Pete had set the new Stripe keys, causing "could not load event" on the public site. The module-level `requireEnv()` crashed the entire endpoint.

**How to apply:** When env vars need to change: (1) tell Pete exactly what to run, (2) wait for confirmation they did it, (3) verify with `vercel env ls` that timestamps are fresh, (4) THEN deploy. Never deploy optimistically.
