import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { requireAdmin } from '../../lib/auth';
import { requireEnv } from '../../lib/env';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// GET — list tiers for an event
export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const eventSlug = url.searchParams.get('event');
  if (!eventSlug) {
    return new Response(JSON.stringify({ error: 'Missing event parameter' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: tiers, error } = await auth.supabase
    .from('ticket_tiers')
    .select('*')
    .eq('event_slug', eventSlug)
    .order('sort_order');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ tiers: tiers ?? [] }), { status: 200, headers: JSON_HEADERS });
};

// POST — create a tier and its Stripe product/price
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const eventSlug = typeof body.event_slug === 'string' ? body.event_slug.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const priceCents = typeof body.price_cents === 'number' ? body.price_cents : 0;
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
  const visibility = typeof body.visibility === 'string' && ['visible', 'scheduled', 'hidden'].includes(body.visibility)
    ? body.visibility : 'visible';
  const availableFrom = typeof body.available_from === 'string' ? body.available_from : null;
  const availableUntil = typeof body.available_until === 'string' ? body.available_until : null;

  if (!eventSlug || !name || priceCents <= 0) {
    return new Response(JSON.stringify({ error: 'event_slug, name, and price_cents (> 0) are required' }), { status: 400, headers: JSON_HEADERS });
  }

  // Verify the event exists
  const { data: event } = await auth.supabase
    .from('events')
    .select('slug, name')
    .eq('slug', eventSlug)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ error: `Event "${eventSlug}" not found` }), { status: 404, headers: JSON_HEADERS });
  }

  // Create Stripe product + price
  let stripeKey: string;
  try {
    stripeKey = requireEnv('STRIPE_SECRET_KEY');
  } catch {
    return new Response(JSON.stringify({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' }), { status: 500, headers: JSON_HEADERS });
  }

  let stripeProductId: string;
  let stripePriceId: string;

  try {
    const stripe = new Stripe(stripeKey);

    const product = await stripe.products.create({
      name: `${event.name} — ${name}`,
      metadata: { event_slug: eventSlug, tier_name: name },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceCents,
      currency: 'usd',
      metadata: { event_slug: eventSlug, tier_name: name },
    });

    stripeProductId = product.id;
    stripePriceId = price.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Stripe product creation error:', msg);
    return new Response(JSON.stringify({ error: `Stripe error: ${msg}` }), { status: 500, headers: JSON_HEADERS });
  }

  // Insert tier into DB
  const { data: tier, error } = await auth.supabase
    .from('ticket_tiers')
    .insert({
      event_slug: eventSlug,
      name,
      price_cents: priceCents,
      stripe_price_id: stripePriceId,
      stripe_product_id: stripeProductId,
      sort_order: sortOrder,
      visibility,
      available_from: availableFrom,
      available_until: availableUntil,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ tier }), { status: 201, headers: JSON_HEADERS });
};

// PATCH — update tier visibility / scheduling
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const tierId = typeof body.id === 'string' ? body.id : '';
  if (!tierId) {
    return new Response(JSON.stringify({ error: 'Tier id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.visibility === 'string' && ['visible', 'scheduled', 'hidden'].includes(body.visibility)) {
    updates.visibility = body.visibility;
  }
  if (body.available_from !== undefined) {
    updates.available_from = typeof body.available_from === 'string' ? body.available_from : null;
  }
  if (body.available_until !== undefined) {
    updates.available_until = typeof body.available_until === 'string' ? body.available_until : null;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: tier, error } = await auth.supabase
    .from('ticket_tiers')
    .update(updates)
    .eq('id', tierId)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ tier }), { status: 200, headers: JSON_HEADERS });
};

// DELETE — deactivate a tier
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const tierId = typeof body.id === 'string' ? body.id : '';
  if (!tierId) {
    return new Response(JSON.stringify({ error: 'Tier id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { error } = await auth.supabase
    .from('ticket_tiers')
    .update({ active: false })
    .eq('id', tierId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
};
