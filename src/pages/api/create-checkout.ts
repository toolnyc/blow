import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

const TIER_LOOKUP_KEYS: Record<string, string> = {
  regular: 'blow-regular',
  supporter: 'blow-supporter',
};

export const POST: APIRoute = async ({ request, url }) => {
  let tier: string;
  let quantity: number;
  let event: string;
  try {
    const body = await request.json();
    tier = body.tier;
    quantity = body.quantity ?? 1;
    event = body.event ?? 'may5';
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

  const lookupKey = TIER_LOOKUP_KEYS[tier];
  if (!lookupKey) {
    return new Response(JSON.stringify({ error: 'Invalid tier. Use "regular" or "supporter".' }), {
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

  try {
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const price = prices.data[0];

    if (!price) {
      return new Response(JSON.stringify({ error: `No price found for tier "${tier}"` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const origin = `${url.protocol}//${url.host}`;
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity }],
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { event },
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
