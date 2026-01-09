import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const resend = new Resend(import.meta.env.RESEND_API_KEY);
const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save to Supabase database
    const { error: dbError } = await supabase
      .from('subscribers')
      .upsert(
        { email, subscribed_at: new Date().toISOString() },
        { onConflict: 'email' }
      );

    if (dbError) {
      console.error('Failed to save to database:', dbError);
      return new Response(JSON.stringify({ error: 'Failed to save subscription' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add contact to Resend audience (non-blocking, may fail with restricted API key)
    const audienceId = import.meta.env.RESEND_AUDIENCE_ID;
    if (audienceId) {
      try {
        await resend.contacts.create({
          email,
          audienceId,
          unsubscribed: false,
        });
      } catch (contactError) {
        console.warn('Could not add contact to audience:', contactError);
      }
    }

    // Send confirmation email
    const { error: sendError } = await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Blow',
      text: "You're on the list.",
    });

    if (sendError) {
      console.error('Failed to send email:', sendError);
      return new Response(JSON.stringify({ error: 'Failed to send confirmation email' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
