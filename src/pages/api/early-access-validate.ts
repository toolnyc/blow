import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// GET — public endpoint to validate an access code and return unlocked tiers
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim().toUpperCase();

  if (!code) {
    return new Response(JSON.stringify({ valid: false, error: 'No access code provided' }), { status: 400, headers: JSON_HEADERS });
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
  );

  // Look up the access code
  const { data: accessCode } = await supabase
    .from('access_codes')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .single();

  if (!accessCode) {
    return new Response(JSON.stringify({ valid: false, error: 'Invalid access code' }), { status: 200, headers: JSON_HEADERS });
  }

  // Check expiry
  if (accessCode.expires_at && new Date(accessCode.expires_at) < new Date()) {
    return new Response(JSON.stringify({ valid: false, error: 'This access code has expired' }), { status: 200, headers: JSON_HEADERS });
  }

  // Check usage limit
  if (accessCode.max_uses !== null && accessCode.used_count >= accessCode.max_uses) {
    return new Response(JSON.stringify({ valid: false, error: 'This access code has reached its usage limit' }), { status: 200, headers: JSON_HEADERS });
  }

  // Fetch the event
  const { data: event } = await supabase
    .from('events')
    .select('slug, name, date, venue')
    .eq('slug', accessCode.event_slug)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ valid: false, error: 'Event not found' }), { status: 200, headers: JSON_HEADERS });
  }

  // Fetch the unlocked tiers (by name, regardless of visibility)
  const { data: allTiers } = await supabase
    .from('ticket_tiers')
    .select('name, price_cents, max_per_order')
    .eq('event_slug', accessCode.event_slug)
    .eq('active', true)
    .order('sort_order');

  const tiers = (allTiers ?? []).filter((t) =>
    accessCode.tier_names.some((n: string) => n.toLowerCase() === t.name.toLowerCase())
  );

  return new Response(JSON.stringify({ valid: true, event, tiers }), { status: 200, headers: JSON_HEADERS });
};
