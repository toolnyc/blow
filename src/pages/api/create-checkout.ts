import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

export const POST: APIRoute = async ({ request, url }) => {
  let tier: string;
  let quantity: number;
  let event: string;
  try {
    const body = await request.json();
    tier = body.tier;
    quantity = body.quantity ?? 1;
    event = body.event ?? '';
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

  const { data: tierData } = await supabase
    .from('ticket_tiers')
    .select('stripe_price_id, name, price_cents')
    .eq('event_slug', event)
    .ilike('name', tier)
    .eq('active', true)
    .single();

  if (!tierData?.stripe_price_id) {
    return new Response(JSON.stringify({ error: `No active tier "${tier}" found for event "${event}"` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const origin = `${url.protocol}//${url.host}`;
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: tierData.stripe_price_id, quantity }],
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { event, tier: tierData.name },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
