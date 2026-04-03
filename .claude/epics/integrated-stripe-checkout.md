# Epic: Integrated Stripe Checkout

## Intent

Replace manual Stripe payment links with server-side Stripe Checkout Sessions. Buyers click a ticket tier on the landing page, get redirected to Stripe's hosted checkout, and return to a confirmation page. A webhook syncs buyer emails to Supabase subscribers + Resend audience, closing the 24% audience leak identified in the March 21 post-mortem. Must ship before May 5 event.

## Current State

- **Payments:** A single hardcoded `buy.stripe.com` payment link is embedded as a QR code on the door page (`src/pages/door/[event].astro` line 38). No Stripe SDK, no webhooks, no post-purchase automation.
- **Email sync:** `src/pages/api/subscribe.ts` syncs website subscribers to Supabase + Resend audience (lines 34-61). Stripe buyers bypass this entirely — 17 of 74 buyers (24%) from March 21 never entered the email list.
- **Landing page:** `src/pages/index.astro` has an Events window (lines 56-70) with static text ("May 5, 2026"). No buy buttons.
- **Dependencies:** No `stripe` package in `package.json`. No Stripe env vars in `.env.example`.
- **Door page:** QR code generation at line 38 now uses `config.stripeUrl` (from Step 1 fix), falling back to `blow.nyc` when empty.

## Delta

### New files
- `src/pages/api/create-checkout.ts` — Creates Stripe Checkout Session, returns redirect URL
- `src/pages/api/stripe-webhook.ts` — Handles `checkout.session.completed`, syncs email to Supabase + Resend
- `src/pages/success.astro` — Post-purchase confirmation page (Windows 98 theme)

### Modified files
- `src/pages/index.astro` — Add ticket tier buttons to Events window, client JS for checkout redirect
- `src/pages/door/[event].astro` — Update QR target to site homepage (buy page)
- `package.json` — Add `stripe` dependency
- `.env.example` — Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## API Surface

### POST `/api/create-checkout`
```
Request:  { priceId: string, quantity?: number }
Response: { url: string }  (Stripe Checkout Session URL)
Errors:   400 (missing priceId), 500 (Stripe API failure)
```

Creates a Stripe Checkout Session with:
- `line_items: [{ price: priceId, quantity: quantity ?? 1 }]`
- `mode: 'payment'`
- `success_url` → `/success?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url` → `/`
- `metadata: { event: 'may5' }`

### POST `/api/stripe-webhook`
```
Request:  Raw body + Stripe-Signature header
Response: 200 (always, to prevent retries)
```

On `checkout.session.completed`:
1. Extract `customer_details.email`
2. Upsert into `subscribers` table (reuse subscribe.ts pattern)
3. Add to Resend audience (reuse subscribe.ts pattern)

## UI Breakdown

### Events window (`index.astro`)
Add below the existing event info:
- Two buttons: "Regular — $20" and "Supporter — $30"
- Style with 98.css button classes
- On click: POST to `/api/create-checkout` with the price ID → redirect to returned URL

### Success page (`success.astro`)
- Windows 98 themed (reuse Layout + Window components)
- "You're in" confirmation message
- Link back to homepage

### Door page QR update
- QR code points to `https://blow.nyc` (the homepage with buy buttons) instead of raw Stripe link

## Acceptance Criteria

- `pnpm build` passes with all new files
- Clicking "Regular" on landing page → redirects to Stripe Checkout with $20 price
- Clicking "Supporter" → redirects to Stripe Checkout with $30 price
- Completing purchase → redirected to `/success` page
- Webhook receives `checkout.session.completed` → buyer email appears in Supabase `subscribers` table
- Webhook syncs buyer to Resend audience (non-blocking, same pattern as subscribe.ts)
- Door page QR code shows homepage URL
- No Stripe secret key exposed to client (all Stripe calls server-side)

## Known Risks

- **Stripe Products/Prices must exist in Dashboard first.** Pete needs to create the product with two prices and provide the `price_xxx` IDs. These will be referenced in the Events window buttons.
- **Webhook requires production URL.** Can test locally with `stripe listen --forward-to localhost:4321/api/stripe-webhook`, but the Stripe Dashboard webhook config needs the deployed Vercel URL.
- **Env vars must be set on Vercel.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` need to be added before deploy.
- **Raw body access for webhook signature.** Astro's `request.text()` should provide the raw body. If the Vercel adapter transforms it, may need `request.clone()` workaround.
