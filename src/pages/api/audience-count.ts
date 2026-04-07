import type { APIRoute } from 'astro';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// GET — preview audience count for a segment filter
export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const allSubscribers = url.searchParams.get('all_subscribers') === '1';
  const eventSlug = url.searchParams.get('event_slug');
  const ticketTypes = url.searchParams.get('ticket_types')?.split(',').filter(Boolean) ?? [];

  const emails = new Set<string>();

  if (allSubscribers) {
    const { data: subs } = await auth.supabase
      .from('subscribers')
      .select('email')
      .is('unsubscribed_at', null);

    for (const s of subs ?? []) {
      if (s.email) emails.add(s.email.toLowerCase());
    }
  }

  if (eventSlug) {
    let query = auth.supabase
      .from('orders')
      .select('customer_email, ticket_type')
      .eq('event', eventSlug)
      .eq('status', 'completed');

    if (ticketTypes.length > 0) {
      query = query.in('ticket_type', ticketTypes);
    }

    const { data: orders } = await query;

    for (const o of orders ?? []) {
      if (o.customer_email) emails.add(o.customer_email.toLowerCase());
    }
  }

  return new Response(JSON.stringify({ count: emails.size }), { status: 200, headers: JSON_HEADERS });
};
