import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  // Get distinct events with guest counts, ordered by most recent activity
  const { data: guests, error } = await supabase
    .from('guests')
    .select('event, created_at');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Group by event and find the latest created_at per event
  const eventMap = new Map<string, { event: string; guestCount: number; latestDate: string }>();
  for (const g of guests ?? []) {
    const existing = eventMap.get(g.event);
    if (!existing) {
      eventMap.set(g.event, {
        event: g.event,
        guestCount: 1,
        latestDate: g.created_at,
      });
    } else {
      existing.guestCount++;
      if (g.created_at > existing.latestDate) {
        existing.latestDate = g.created_at;
      }
    }
  }

  const events = Array.from(eventMap.values()).sort(
    (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );

  return new Response(JSON.stringify({ events }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
