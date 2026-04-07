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
  const subscriberHours = url.searchParams.get('subscriber_hours');
  const eventSlug = url.searchParams.get('event_slug');
  const ticketTypes = url.searchParams.get('ticket_types')?.split(',').filter(Boolean) ?? [];
  const checkinEventSlug = url.searchParams.get('checkin_event_slug');
  const checkinBefore = url.searchParams.get('checkin_before');

  const emails = new Set<string>();

  // Source 1: Subscribers
  if (allSubscribers) {
    let query = auth.supabase
      .from('subscribers')
      .select('email')
      .is('unsubscribed_at', null);

    if (subscriberHours) {
      const hours = parseInt(subscriberHours, 10);
      if (hours > 0) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        query = query.gte('subscribed_at', since);
      }
    }

    const { data: subs } = await query;

    for (const s of subs ?? []) {
      if (s.email) emails.add(s.email.toLowerCase());
    }
  }

  // Source 2: Ticket buyers
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

  // Source 3: Door check-ins
  if (checkinEventSlug) {
    let query = auth.supabase
      .from('guests')
      .select('email, first_checked_in_at')
      .eq('event', checkinEventSlug)
      .gt('checked_in_count', 0);

    if (checkinBefore) {
      query = query.lt('first_checked_in_at', checkinBefore);
    }

    const { data: guests } = await query;

    for (const g of guests ?? []) {
      if (g.email) emails.add(g.email.toLowerCase());
    }
  }

  return new Response(JSON.stringify({ count: emails.size }), { status: 200, headers: JSON_HEADERS });
};
