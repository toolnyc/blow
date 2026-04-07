import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { requireAdmin } from '../../lib/auth';
import { notifyCampaignSend } from '../../lib/discord';
import type { SupabaseClient } from '@supabase/supabase-js';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface AudienceSegment {
  all_subscribers?: boolean;
  subscriber_hours?: number;
  event_slug?: string;
  ticket_types?: string[];
  checkin_event_slug?: string;
  checkin_before?: string;
}

/** Resolve audience segment to a deduplicated list of emails */
async function resolveAudience(supabase: SupabaseClient, segment: AudienceSegment): Promise<string[]> {
  const emails = new Set<string>();

  // Source 1: Subscribers (optionally filtered to last N hours)
  if (segment.all_subscribers) {
    let query = supabase
      .from('subscribers')
      .select('email')
      .is('unsubscribed_at', null);

    if (segment.subscriber_hours && segment.subscriber_hours > 0) {
      const since = new Date(Date.now() - segment.subscriber_hours * 60 * 60 * 1000).toISOString();
      query = query.gte('subscribed_at', since);
    }

    const { data: subs } = await query;

    for (const s of subs ?? []) {
      if (s.email) emails.add(s.email.toLowerCase());
    }
  }

  // Source 2: Ticket buyers (by event, optional ticket type filter)
  if (segment.event_slug) {
    let query = supabase
      .from('orders')
      .select('customer_email, ticket_type')
      .eq('event', segment.event_slug)
      .eq('status', 'completed');

    if (segment.ticket_types && segment.ticket_types.length > 0) {
      query = query.in('ticket_type', segment.ticket_types);
    }

    const { data: orders } = await query;

    for (const o of orders ?? []) {
      if (o.customer_email) emails.add(o.customer_email.toLowerCase());
    }
  }

  // Source 3: Door check-ins (by event, optional "arrived before" filter)
  if (segment.checkin_event_slug) {
    let query = supabase
      .from('guests')
      .select('email, first_checked_in_at')
      .eq('event', segment.checkin_event_slug)
      .gt('checked_in_count', 0);

    if (segment.checkin_before) {
      query = query.lt('first_checked_in_at', segment.checkin_before);
    }

    const { data: guests } = await query;

    for (const g of guests ?? []) {
      if (g.email) emails.add(g.email.toLowerCase());
    }
  }

  return Array.from(emails);
}

/** Wrap campaign body in Blow-branded email shell */
function wrapEmailHtml(body: string, siteUrl: string): string {
  const wordmarkUrl = `${siteUrl}/wordmark.svg`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 40px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 400px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <img src="${wordmarkUrl}" alt="Blow" width="180" style="display: block; max-width: 180px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 16px; color: #333333; font-size: 16px; line-height: 1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 32px 16px 16px 16px; border-top: 1px solid #cccccc;">
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
</html>`;
}

// GET — list campaigns
export const GET: APIRoute = async ({ cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const { data: campaigns, error } = await auth.supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ campaigns: campaigns ?? [] }), { status: 200, headers: JSON_HEADERS });
};

// POST — multiplex on ?action= param: create, update, send, test, delete
export const POST: APIRoute = async ({ request, cookies, url }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const action = new URL(request.url).searchParams.get('action') ?? 'create';

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  if (action === 'create') {
    return handleCreate(auth.supabase, body);
  } else if (action === 'update') {
    return handleUpdate(auth.supabase, body);
  } else if (action === 'send') {
    return handleSend(auth.supabase, body, url);
  } else if (action === 'test') {
    return handleTest(auth.supabase, body, url);
  } else if (action === 'delete') {
    return handleDelete(auth.supabase, body);
  }

  return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: JSON_HEADERS });
};

async function handleCreate(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const htmlBody = typeof body.html_body === 'string' ? body.html_body.trim() : '';
  const audienceSegment = typeof body.audience_segment === 'object' && body.audience_segment !== null
    ? body.audience_segment : {};
  const scheduledAt = typeof body.scheduled_at === 'string' ? body.scheduled_at : null;

  if (!subject || !htmlBody) {
    return new Response(JSON.stringify({ error: 'subject and html_body are required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .insert({
      subject,
      html_body: htmlBody,
      audience_segment: audienceSegment,
      scheduled_at: scheduledAt,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ campaign }), { status: 201, headers: JSON_HEADERS });
}

async function handleUpdate(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Campaign id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: existing } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: JSON_HEADERS });
  }

  if (existing.status !== 'draft') {
    return new Response(JSON.stringify({ error: `Cannot edit a campaign with status "${existing.status}"` }), { status: 400, headers: JSON_HEADERS });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const htmlBody = typeof body.html_body === 'string' ? body.html_body.trim() : '';
  const audienceSegment = typeof body.audience_segment === 'object' && body.audience_segment !== null
    ? body.audience_segment : {};
  const scheduledAt = typeof body.scheduled_at === 'string' ? body.scheduled_at : null;

  if (!subject || !htmlBody) {
    return new Response(JSON.stringify({ error: 'subject and html_body are required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .update({
      subject,
      html_body: htmlBody,
      audience_segment: audienceSegment,
      scheduled_at: scheduledAt,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ campaign }), { status: 200, headers: JSON_HEADERS });
}

async function handleDelete(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Campaign id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: existing } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: JSON_HEADERS });
  }

  if (existing.status !== 'draft') {
    return new Response(JSON.stringify({ error: `Cannot delete a campaign with status "${existing.status}"` }), { status: 400, headers: JSON_HEADERS });
  }

  const { error } = await supabase
    .from('email_campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
}

async function handleSend(supabase: SupabaseClient, body: Record<string, unknown>, siteUrl: URL): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Campaign id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: JSON_HEADERS });
  }

  if (campaign.status !== 'draft') {
    return new Response(JSON.stringify({ error: `Campaign status is "${campaign.status}", expected "draft"` }), { status: 400, headers: JSON_HEADERS });
  }

  const segment = campaign.audience_segment as AudienceSegment;
  const emails = await resolveAudience(supabase, segment);

  if (emails.length === 0) {
    return new Response(JSON.stringify({ error: 'No recipients found for this audience segment' }), { status: 400, headers: JSON_HEADERS });
  }

  const resend = new Resend(import.meta.env.RESEND_API_KEY);
  const fromEmail = import.meta.env.RESEND_FROM_EMAIL;
  const origin = `${siteUrl.protocol}//${siteUrl.host}`;
  const wrappedHtml = wrapEmailHtml(campaign.html_body, origin);

  const scheduledAt = campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()
    ? campaign.scheduled_at
    : undefined;

  let lastBatchId = '';
  let totalSent = 0;

  try {
    // Resend batch limit is 100 per call
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100);
      const batch = chunk.map((email) => ({
        from: fromEmail,
        to: [email],
        subject: campaign.subject,
        html: wrappedHtml,
        ...(scheduledAt ? { scheduledAt } : {}),
      }));

      const { data, error } = await resend.batch.send(batch);
      if (error) throw new Error(error.message);
      if (data) lastBatchId = JSON.stringify(data);
      totalSent += chunk.length;
    }

    const finalStatus = scheduledAt ? 'scheduled' : 'sent';

    await supabase
      .from('email_campaigns')
      .update({
        status: finalStatus,
        sent_count: totalSent,
        resend_batch_id: lastBatchId,
      })
      .eq('id', id);

    void notifyCampaignSend({ subject: campaign.subject, recipientCount: totalSent, status: finalStatus });

    return new Response(JSON.stringify({ success: true, sent_count: totalSent, status: finalStatus }), {
      status: 200, headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error('Campaign send error:', err);

    await supabase
      .from('email_campaigns')
      .update({ status: 'failed' })
      .eq('id', id);

    void notifyCampaignSend({ subject: campaign.subject, recipientCount: 0, status: 'failed', error: String(err) });

    return new Response(JSON.stringify({ error: `Send failed: ${String(err)}` }), { status: 500, headers: JSON_HEADERS });
  }
}

async function handleTest(supabase: SupabaseClient, body: Record<string, unknown>, siteUrl: URL): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Campaign id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: JSON_HEADERS });
  }

  const resend = new Resend(import.meta.env.RESEND_API_KEY);
  const fromEmail = import.meta.env.RESEND_FROM_EMAIL;
  const testEmail = typeof body.test_email === 'string' && body.test_email.trim()
    ? body.test_email.trim()
    : fromEmail;
  const origin = `${siteUrl.protocol}//${siteUrl.host}`;
  const wrappedHtml = wrapEmailHtml(campaign.html_body, origin);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [testEmail],
    subject: `[TEST] ${campaign.subject}`,
    html: wrappedHtml,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ success: true, sent_to: testEmail }), { status: 200, headers: JSON_HEADERS });
}
