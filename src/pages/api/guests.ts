import type { APIRoute } from 'astro';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// GET — list all guests across all events, with repeat-customer info
export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const eventFilter = url.searchParams.get('event') || '';

  let query = auth.supabase
    .from('guests')
    .select('id, event, name, email, ticket_type, tickets, checked_in_count, first_checked_in_at, created_at, notes')
    .order('created_at', { ascending: false });

  if (eventFilter) {
    query = query.eq('event', eventFilter);
  }

  const { data: guests, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  const allGuests = guests ?? [];

  // Build repeat-customer map by email
  const emailCounts = new Map<string, number>();
  for (const g of allGuests) {
    if (g.email) {
      emailCounts.set(g.email, (emailCounts.get(g.email) ?? 0) + 1);
    }
  }

  // Annotate guests with event_count
  const enriched = allGuests.map(g => ({
    ...g,
    event_count: g.email ? (emailCounts.get(g.email) ?? 1) : 1,
  }));

  // Fetch event list for filter dropdown
  const { data: events } = await auth.supabase
    .from('events')
    .select('slug, name')
    .order('date', { ascending: false });

  return new Response(JSON.stringify({
    guests: enriched,
    events: events ?? [],
    total: enriched.length,
  }), { status: 200, headers: JSON_HEADERS });
};
