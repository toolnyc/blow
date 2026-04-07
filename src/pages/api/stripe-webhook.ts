import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { notifyPurchase, notifyError } from '../../lib/discord';
import { requireEnv } from '../../lib/env';

export const prerender = false;

function getStripe() { return new Stripe(requireEnv('STRIPE_SECRET_KEY')); }
function getResend() { return new Resend(requireEnv('RESEND_API_KEY')); }
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

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET')
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

    // Fetch event details for the confirmation email
    let eventName = '';
    let eventDateFormatted = '';
    try {
      const { data: eventRow } = await supabase
        .from('events')
        .select('name, date')
        .eq('slug', eventSlug)
        .single();
      if (eventRow) {
        eventName = eventRow.name ?? '';
        if (eventRow.date) {
          const d = new Date(eventRow.date.slice(0, 10) + 'T00:00:00');
          eventDateFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
      }
    } catch {
      // Non-critical — email still sends without event details
    }

    // Use tier from metadata (set during checkout creation) with line-item fallback
    let ticketType = session.metadata?.tier ?? 'regular';
    let quantity = 1;
    let amountCents = session.amount_total ?? 0;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
      const firstItem = lineItems.data[0];
      if (firstItem) {
        quantity = firstItem.quantity ?? 1;
        // Only fall back to description-based detection if metadata tier is missing
        if (!session.metadata?.tier) {
          const description = (firstItem.description ?? '').toLowerCase();
          ticketType = description.includes('supporter') ? 'supporter' : 'regular';
        }
      }
    } catch (lineItemErr) {
      console.warn('Webhook: could not fetch line items:', lineItemErr);
    }

    // Retrieve payment details for the confirmation email
    let paymentMethodSummary = '';
    let receiptUrl: string | null = null;
    try {
      if (session.payment_intent && typeof session.payment_intent === 'string') {
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ['latest_charge'],
        });
        const charge = pi.latest_charge as Stripe.Charge | null;
        if (charge) {
          receiptUrl = charge.receipt_url ?? null;
          const pm = charge.payment_method_details;
          if (pm?.card) {
            const brand = (pm.card.brand ?? 'card').charAt(0).toUpperCase() + (pm.card.brand ?? 'card').slice(1);
            paymentMethodSummary = `${brand} ending in ${pm.card.last4}`;
          } else if (pm?.type) {
            paymentMethodSummary = pm.type.replace(/_/g, ' ');
          }
        }
      }
    } catch (pmErr) {
      console.warn('Webhook: could not fetch payment details:', pmErr);
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
      const accessCode = session.metadata?.access_code;
      await notifyPurchase({
        email,
        guestName,
        eventSlug,
        ticketType,
        quantity,
        amountCents,
        ...(accessCode ? { accessCode } : {}),
      }).catch(() => {});

      // Send confirmation email
      try {
        const resend = getResend();
        const fromEmail = requireEnv('RESEND_FROM_EMAIL');
        const dollars = (amountCents / 100).toFixed(2);
        const qtyLabel = quantity > 1 ? `${quantity} tickets` : '1 ticket';
        const tierLabel = ticketType.charAt(0).toUpperCase() + ticketType.slice(1);
        const orderDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Build payment detail rows
        const eventRow = eventName || eventDateFormatted
          ? `<tr><td style="padding: 6px 0; color: #888; font-size: 13px; width: 110px; vertical-align: top;">Event</td><td style="padding: 6px 0; font-size: 13px; color: #333; font-weight: 600;">${eventName}${eventDateFormatted ? `<br><span style="font-weight: 400; color: #666;">${eventDateFormatted}</span>` : ''}</td></tr>`
          : '';
        const paymentRow = paymentMethodSummary
          ? `<tr><td style="padding: 6px 0; color: #888; font-size: 13px; width: 110px; vertical-align: top;">Payment</td><td style="padding: 6px 0; font-size: 13px; color: #333;">${paymentMethodSummary}</td></tr>`
          : '';
        const receiptRow = receiptUrl
          ? `<tr><td colspan="2" style="padding: 12px 0 0 0;"><a href="${receiptUrl}" style="color: #ff2845; text-decoration: none; font-size: 13px;">View Stripe Receipt →</a></td></tr>`
          : '';

        await resend.emails.send({
          from: fromEmail,
          to: [email],
          subject: "You're in — Blow",
          html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background: #f9f9f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 40px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 420px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <img src="https://blowme.nyc/wordmark.svg" alt="Blow" width="180" style="display: block; max-width: 180px; height: auto;" />
            </td>
          </tr>
          <!-- Confirmation -->
          <tr>
            <td style="padding: 0 16px 20px 16px;">
              <p style="margin: 0 0 4px 0; font-size: 22px; font-weight: bold; color: #ff2845;">You're in.</p>
              <p style="margin: 0; font-size: 14px; color: #888;">Confirmation for your Blow ticket purchase</p>
            </td>
          </tr>
          <!-- Order Details -->
          <tr>
            <td style="padding: 0 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px;">
                <tr><td style="padding: 0 0 12px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #aaa; font-weight: bold;">Order Details</td><td></td></tr>
                ${eventRow}
                <tr><td style="padding: 6px 0; color: #888; font-size: 13px; width: 110px; vertical-align: top;">Tier</td><td style="padding: 6px 0; font-size: 13px; color: #333; font-weight: 600;">${tierLabel}</td></tr>
                <tr><td style="padding: 6px 0; color: #888; font-size: 13px; vertical-align: top;">Tickets</td><td style="padding: 6px 0; font-size: 13px; color: #333;">${qtyLabel}</td></tr>
                <tr><td style="padding: 6px 0; color: #888; font-size: 13px; vertical-align: top;">Total</td><td style="padding: 6px 0; font-size: 13px; color: #333; font-weight: 600;">$${dollars}</td></tr>
                ${paymentRow}
                <tr><td style="padding: 6px 0; color: #888; font-size: 13px; vertical-align: top;">Date</td><td style="padding: 6px 0; font-size: 13px; color: #333;">${orderDate}</td></tr>
                ${receiptRow}
              </table>
            </td>
          </tr>
          <!-- Next Steps -->
          <tr>
            <td style="padding: 20px 16px 0 16px;">
              <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.6;">Event details coming soon — keep an eye on your inbox.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 32px 16px 16px 16px; border-top: 1px solid #e5e5e5; margin-top: 24px;">
              <p style="color: #888888; font-size: 14px; margin: 0 0 12px 0; line-height: 1.4;">
                XOXO,<br>The Boss
              </p>
              <a href="https://instagram.com/blowme.nyc" style="color: #ff2845; text-decoration: none; font-size: 14px;">@blowme.nyc</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          text: `You're in.\n\nOrder Details\n─────────────${eventName ? `\nEvent: ${eventName}` : ''}${eventDateFormatted ? `\nDate: ${eventDateFormatted}` : ''}\nTier: ${tierLabel}\nTickets: ${qtyLabel}\nTotal: $${dollars}${paymentMethodSummary ? `\nPayment: ${paymentMethodSummary}` : ''}\nOrdered: ${orderDate}${receiptUrl ? `\n\nView Receipt: ${receiptUrl}` : ''}\n\nEvent details coming soon — keep an eye on your inbox.\n\nXOXO,\nThe Boss\n\n@blowme.nyc - https://instagram.com/blowme.nyc`,
        });
      } catch (emailErr) {
        console.error('Webhook: failed to send confirmation email:', emailErr);
        void notifyError({ endpoint: 'stripe-webhook', message: String(emailErr), context: 'Confirmation email' });
      }

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
          await getResend().contacts.create({
            email,
            audienceId,
            unsubscribed: false,
          });
        } catch (contactError) {
          console.warn('Webhook: could not add contact to audience:', contactError);
          void notifyError({ endpoint: 'stripe-webhook', message: String(contactError), context: 'Resend audience sync' });
        }
      }
    } else {
      console.warn('Webhook: checkout.session.completed without email', session.id);
    }
  }

  // Handle refunds — mark orders as refunded so dashboard excludes them
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

    if (paymentIntentId) {
      try {
        // Find the checkout session that created this payment intent
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
        const sessionId = sessions.data[0]?.id;

        if (sessionId) {
          const refundedAmount = charge.amount_refunded ?? 0;
          const totalAmount = charge.amount ?? 0;
          const isFullRefund = refundedAmount >= totalAmount;

          const { error: refundError } = await supabase
            .from('orders')
            .update({ status: isFullRefund ? 'refunded' : 'partial_refund' })
            .eq('stripe_session_id', sessionId);

          if (refundError) {
            console.error('Webhook: failed to update order for refund:', refundError);
            void notifyError({ endpoint: 'stripe-webhook', message: refundError.message, context: 'Refund update' });
          }
        }
      } catch (refundErr) {
        console.error('Webhook: error processing refund:', refundErr);
        void notifyError({ endpoint: 'stripe-webhook', message: String(refundErr), context: 'Refund processing' });
      }
    }
  }

  // Always return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
