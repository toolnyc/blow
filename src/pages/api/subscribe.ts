import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const resend = new Resend(import.meta.env.RESEND_API_KEY);
const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

export const POST: APIRoute = async ({ request, url }) => {
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
    const siteUrl = `${url.protocol}//${url.host}`;
    const wordmarkUrl = `${siteUrl}/wordmark.svg`;

    const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 40px 20px; background-color: #000000; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; margin: 0 auto;">
    <tr>
      <td align="center" style="padding-bottom: 30px;">
        <img src="${wordmarkUrl}" alt="Blow" width="200" style="max-width: 200px; height: auto;" />
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 30px 0; color: #ff2845; font-size: 18px;">
        You're on the list. We'll reach out when we're ready to party.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top: 40px; border-top: 1px solid #333333;">
        <p style="color: #888888; font-size: 14px; margin: 20px 0 10px 0;">
          XOXO,<br>The Boss
        </p>
        <a href="https://instagram.com/blowme.nyc" style="color: #ff2845; text-decoration: none; font-size: 14px;">@blowme.nyc</a>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const { error: sendError } = await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Blow',
      html: htmlEmail,
      text: "You're on the list. We'll reach out when we're ready to party.\n\nXOXO,\nThe Boss\n\n@blowme.nyc - https://instagram.com/blowme.nyc",
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
