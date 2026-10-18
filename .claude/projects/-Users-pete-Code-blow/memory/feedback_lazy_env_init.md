---
name: feedback_lazy_env_init
description: Use lazy init for env-dependent services to avoid module-level crashes
type: feedback
---

Never use `requireEnv()` at module top-level (e.g. `const stripe = new Stripe(requireEnv(...))`). If the key is missing, it kills the entire module including unrelated route handlers (GET killed by POST's Stripe dependency).

**Why:** Adding `requireEnv('STRIPE_SECRET_KEY')` at module scope in create-checkout.ts crashed the GET endpoint that just lists events — no Stripe needed. Took down the public event card.

**How to apply:** Use lazy getter functions like `function getStripe() { return new Stripe(requireEnv('STRIPE_SECRET_KEY')); }` and call them inside the handler that actually needs the service.
