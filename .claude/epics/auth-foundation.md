# Epic: Auth Foundation

## Intent

Add admin authentication so Pete can access a gated `/admin` section. Single authorized user (`boss@blowme.nyc`) via Supabase Auth magic link. Login triggered from bottom nav → 98.css popup window with email input → magic link sent → callback sets session → redirect to `/admin`.

## Current State

- **Auth:** None. No Supabase Auth configured. The project uses `@supabase/supabase-js` for database only (anon key).
- **Middleware:** No Astro middleware exists (`src/middleware.ts` does not exist).
- **Admin routes:** None. No `/admin` pages.
- **API routes:** `subscribe.ts`, `checkin.ts`, `add-guest.ts`, `delete-guest.ts`, `create-checkout.ts`, `stripe-webhook.ts` — all use `export const prerender = false` and follow the same pattern.
- **Astro config:** `output: 'static'` with `adapter: vercel()`. SSR pages use `export const prerender = false` per-page.
- **Env vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` already set. No `SUPABASE_SERVICE_ROLE_KEY`.
- **Bottom nav:** The Taskbar component (`src/components/Taskbar.astro`) has a Start menu with Subscribe, Mixtapes, Events items. No "Login" or "Admin" item yet.

## Delta

### New files
- `src/pages/api/auth/login.ts` — POST: validate email is `boss@blowme.nyc`, call Supabase Auth `signInWithOtp`, return success/error
- `src/pages/api/auth/callback.ts` — GET: exchange auth code for session, set cookie, redirect to `/admin`
- `src/pages/api/auth/logout.ts` — POST: clear session cookie, redirect to `/`
- `src/pages/admin/index.astro` — Placeholder admin dashboard (gated by middleware)
- `src/middleware.ts` — Gate `/admin/*` routes: check session cookie, redirect to `/?login=1` if missing

### Modified files
- `src/components/Taskbar.astro` — Add "Admin" item to start menu (opens login window or navigates to `/admin`)
- `src/pages/index.astro` — Add login window (98.css popup with email input, triggered by `?login=1` query param or Start menu click)
- `astro.config.mjs` — May need to add middleware support (verify Astro 5 handles it automatically)

### New env vars
- None new — Supabase Auth uses the existing `SUPABASE_URL` + `SUPABASE_ANON_KEY`. Magic link OTP is configured in the Supabase dashboard (Auth → Providers → Email).

## API Surface

### POST `/api/auth/login`
```
Request:  { email: string }
Response: { success: true } or { error: string }
```
- Validate email === `boss@blowme.nyc` (reject all others with generic "Check your email" to avoid enumeration)
- Call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`
- `emailRedirectTo` points to `/api/auth/callback`

### GET `/api/auth/callback`
```
Query:    ?code=<auth_code>
Response: 302 redirect to /admin
```
- Exchange code via `supabase.auth.exchangeCodeForSession(code)`
- Set `sb-access-token` and `sb-refresh-token` as httpOnly cookies
- Redirect to `/admin`

### POST `/api/auth/logout`
```
Request:  (empty)
Response: 302 redirect to /
```
- Clear session cookies
- Call `supabase.auth.signOut()`

## UI Breakdown

### Login window (`index.astro`)
- 98.css `window` component with title "Login"
- Contains: email input + "Send Magic Link" button
- On submit: POST to `/api/auth/login`, show "Check your email" message on success
- Triggered by: `?login=1` query param (from bottom nav) or Start menu "Admin" click
- Error state: 98.css error dialog if request fails

### Admin placeholder (`/admin/index.astro`)
- Uses Layout.astro (98.css themed)
- Simple window: "Admin Dashboard — Coming Soon"
- Logout button

### Taskbar update
- Add "Admin" to Start menu items
- Clicking it navigates to `/admin` (middleware will redirect to login if no session)

## Acceptance Criteria

- `pnpm build` passes
- Clicking "Admin" in Start menu → navigates to `/admin`
- Without session → redirected to `/?login=1` → login window appears
- Entering `boss@blowme.nyc` → POST succeeds → "Check your email" shown
- Entering any other email → POST succeeds with same message (no enumeration leak), but no email sent
- Clicking magic link → `/api/auth/callback` → session set → redirect to `/admin`
- `/admin` renders placeholder dashboard when authenticated
- Logout button clears session → redirect to `/`
- No Supabase service role key needed (auth uses anon key)

## Known Risks

- **Supabase Auth must be enabled.** Magic link provider needs to be turned on in Supabase Dashboard → Auth → Providers → Email. Site URL and redirect URLs must be configured.
- **Cookie handling on Vercel.** httpOnly cookies with `SameSite=Lax` should work. Need to verify Astro middleware can read cookies from the request.
- **Static output mode.** Astro `output: 'static'` with per-page `prerender = false` should work for API routes and middleware, but need to verify middleware runs for hybrid mode.
