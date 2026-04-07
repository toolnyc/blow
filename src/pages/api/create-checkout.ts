import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { notifyError } from '../../lib/discord';
import { requireEnv } from '../../lib/env';

export const prerender = false;

function getStripe() {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'));
}

// GET — return next upcoming event and its active tiers (public)
export const GET: APIRoute = async () => {
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
  );

  const { data: event } = await supabase
    .from('events')
    .select('slug, name, date, venue')
    .gte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: true })
    .limit(1)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ event: null, tiers: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();

  // Fetch active tiers that are either always-visible or within their scheduled window
  const { data: allTiers } = await supabase
    .from('ticket_tiers')
    .select('name, price_cents, visibility, available_from, available_until')
    .eq('event_slug', event.slug)
    .eq('active', true)
    .in('visibility', ['visible', 'scheduled'])
    .order('sort_order');

  // Filter scheduled tiers by their time window
  const tiers = (allTiers ?? []).filter((t) => {
    if (t.visibility === 'visible') return true;
    // scheduled — must be within [available_from, available_until]
    if (t.available_from && now < t.available_from) return false;
    if (t.available_until && now > t.available_until) return false;
    return true;
  }).map(({ name, price_cents }) => ({ name, price_cents }));

  return new Response(JSON.stringify({ event, tiers }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, url }) => {
  let tier: string;
  let quantity: number;
  let event: string;
  let accessCode: string | undefined;
  try {
    const body = await request.json();
    tier = body.tier;
    quantity = body.quantity ?? 1;
    event = body.event ?? '';
    accessCode = typeof body.access_code === 'string' ? body.access_code.trim().toUpperCase() : undefined;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!event || typeof event !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid event parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!tier || typeof tier !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid tier parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return new Response(JSON.stringify({ error: 'Quantity must be 1-10' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up tier from DB
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
  );

  // If access code provided, validate it and allow hidden tiers
  let validatedCodeId: string | undefined;
  let allowedTierNames: string[] | undefined;

  if (accessCode) {
    const { data: codeData } = await supabase
      .from('access_codes')
      .select('id, tier_names, max_uses, used_count, expires_at')
      .eq('event_slug', event)
      .eq('code', accessCode)
      .eq('active', true)
      .single();

    if (!codeData) {
      return new Response(JSON.stringify({ error: 'Invalid access code' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This access code has expired' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (codeData.max_uses !== null && codeData.used_count >= codeData.max_uses) {
      return new Response(JSON.stringify({ error: 'This access code has reached its usage limit' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    validatedCodeId = codeData.id;
    allowedTierNames = codeData.tier_names;
  }

  // Build tier query — with access code, skip visibility filter
  let tierQuery = supabase
    .from('ticket_tiers')
    .select('stripe_price_id, name, price_cents, visibility, available_from, available_until')
    .eq('event_slug', event)
    .ilike('name', tier)
    .eq('active', true);

  if (!accessCode) {
    tierQuery = tierQuery.in('visibility', ['visible', 'scheduled']);
  }

  const { data: tierData } = await tierQuery.single();

  if (!tierData?.stripe_price_id) {
    return new Response(JSON.stringify({ error: `No active tier "${tier}" found for event "${event}"` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // If using access code, verify the tier is in the allowed list
  if (allowedTierNames) {
    const tierAllowed = allowedTierNames.some((n) => n.toLowerCase() === tierData.name.toLowerCase());
    if (!tierAllowed) {
      return new Response(JSON.stringify({ error: 'This access code does not grant access to this tier' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Enforce scheduling window for non-access-code purchases
  if (!accessCode && tierData.visibility === 'scheduled') {
    const now = new Date().toISOString();
    if ((tierData.available_from && now < tierData.available_from) ||
        (tierData.available_until && now > tierData.available_until)) {
      return new Response(JSON.stringify({ error: 'This ticket tier is not currently available' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Increment used_count if using access code
  if (validatedCodeId) {
    const { data: current } = await supabase
      .from('access_codes')
      .select('used_count')
      .eq('id', validatedCodeId)
      .single();

    await supabase
      .from('access_codes')
      .update({ used_count: (current?.used_count ?? 0) + 1 })
      .eq('id', validatedCodeId);
  }

  try {
    const origin = `${url.protocol}//${url.host}`;
    const cancelUrl = accessCode
      ? `${origin}/early-access?code=${encodeURIComponent(accessCode)}`
      : `${origin}/`;

    const session = await getStripe().checkout.sessions.create({
      line_items: [{ price: tierData.stripe_price_id, quantity }],
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { event, tier: tierData.name, ...(accessCode ? { access_code: accessCode } : {}) },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    void notifyError({ endpoint: 'create-checkout', message: String(err), context: `Event: ${event}, Tier: ${tier}` });
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
