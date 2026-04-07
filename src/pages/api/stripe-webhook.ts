import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { notifyPurchase, notifyError } from '../../lib/discord';

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
    void notifyError({ endpoint: 'stripe-webhook', message: String(err), context: 'Signature verification' });
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;
    const eventSlug = session.metadata?.event ?? 'unknown';

    // Retrieve line items to determine tier and quantity
    let ticketType = 'regular';
    let quantity = 1;
    let amountCents = session.amount_total ?? 0;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
      const firstItem = lineItems.data[0];
      if (firstItem) {
        quantity = firstItem.quantity ?? 1;
        // Derive tier from the price description or product name
        const description = (firstItem.description ?? '').toLowerCase();
        if (description.includes('supporter')) {
          ticketType = 'supporter';
        } else {
          ticketType = 'regular';
        }
      }
    } catch (lineItemErr) {
      console.warn('Webhook: could not fetch line items:', lineItemErr);
    }

    // 1. Create order record
    const { error: orderError } = await supabase
      .from('orders')
      .upsert(
        {
          event: eventSlug,
          stripe_session_id: session.id,
          customer_email: email ?? null,
          ticket_type: ticketType,
          quantity,
          amount_cents: amountCents,
          status: 'completed',
        },
        { onConflict: 'stripe_session_id' }
      );

    if (orderError) {
      console.error('Webhook: failed to create order:', orderError);
      void notifyError({ endpoint: 'stripe-webhook', message: orderError.message, context: 'Order upsert' });
    }

    // 2. Upsert guest record linked to event
    if (email) {
      const guestName = session.customer_details?.name ?? email;
      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .upsert(
          {
            event: eventSlug,
            name: guestName,
            email,
            ticket_type: ticketType,
            tickets: quantity,
            checked_in_count: 0,
          },
          { onConflict: 'event,name' }
        )
        .select('id')
        .single();

      if (guestError) {
        console.error('Webhook: failed to upsert guest:', guestError);
        void notifyError({ endpoint: 'stripe-webhook', message: guestError.message, context: 'Guest upsert' });
      }

      // Link guest to order if we got a guest id
      if (guestData?.id) {
        await supabase
          .from('orders')
          .update({ guest_id: guestData.id })
          .eq('stripe_session_id', session.id);
      }

      // Notify Discord of purchase (awaited but caught — Stripe gives us 10s)
      await notifyPurchase({
        email,
        guestName,
        eventSlug,
        ticketType,
        quantity,
        amountCents,
      }).catch(() => {});

      // 3. Upsert into subscribers
      const { error: dbError } = await supabase
        .from('subscribers')
        .upsert(
          { email, subscribed_at: new Date().toISOString() },
          { onConflict: 'email' }
        );

      if (dbError) {
        console.error('Webhook: failed to save subscriber:', dbError);
      }

      // Add to Resend audience (non-blocking)
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
