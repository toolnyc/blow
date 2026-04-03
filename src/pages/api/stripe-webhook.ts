import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
const resend = new Resend(import.meta.env.RESEND_API_KEY);
const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      import.meta.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;

    if (email) {
      // Upsert into subscribers (same pattern as subscribe.ts)
      const { error: dbError } = await supabase
        .from('subscribers')
        .upsert(
          { email, subscribed_at: new Date().toISOString() },
          { onConflict: 'email' }
        );

      if (dbError) {
        console.error('Webhook: failed to save subscriber:', dbError);
      }

      // Add to Resend audience (non-blocking, same pattern as subscribe.ts)
      const audienceId = import.meta.env.RESEND_AUDIENCE_ID;
      if (audienceId) {
        try {
          await resend.contacts.create({
            email,
            audienceId,
            unsubscribed: false,
          });
        } catch (contactError) {
          console.warn('Webhook: could not add contact to audience:', contactError);
        }
      }
    } else {
      console.warn('Webhook: checkout.session.completed without email', session.id);
    }
  }

  // Always return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
