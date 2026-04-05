import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const ADMIN_EMAILS: string[] = [
  'boss@blowme.nyc',
  'inyourdirtyears@gmail.com',
];

export const GET: APIRoute = async ({ request, cookies }) => {
  // Auth check — require valid admin session
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

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userEmail = authData.user.email?.toLowerCase();
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse event slug from query params
  const url = new URL(request.url);
  const eventSlug = url.searchParams.get('event');
  if (!eventSlug) {
    return new Response(JSON.stringify({ error: 'Missing event parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch event metadata
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('slug', eventSlug)
    .single();

  if (eventError || !eventData) {
    return new Response(JSON.stringify({ error: 'Event not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch all guests for this event
  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('*')
    .eq('event', eventSlug);

  if (guestsError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch guests' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const guestList = guests ?? [];

  // Fetch all orders for this event
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('event', eventSlug);

  if (ordersError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch orders' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderList = orders ?? [];

  // Compute stats
  const totalGuests = guestList.reduce((sum: number, g: Record<string, unknown>) => sum + (g.tickets as number), 0);
  const checkedIn = guestList.reduce((sum: number, g: Record<string, unknown>) => sum + (g.checked_in_count as number), 0);
  const walkIns = guestList.filter((g: Record<string, unknown>) => g.ticket_type === 'Walk-in').length;
  const preSale = orderList.reduce((sum: number, o: Record<string, unknown>) => sum + (o.quantity as number), 0);
  const revenueCents = orderList.reduce((sum: number, o: Record<string, unknown>) => sum + (o.amount_cents as number), 0);

  // By-tier breakdown from orders
  const tierMap: Record<string, { quantity: number; revenue_cents: number }> = {};
  for (const order of orderList) {
    const tier = (order.ticket_type as string) ?? 'unknown';
    if (!tierMap[tier]) {
      tierMap[tier] = { quantity: 0, revenue_cents: 0 };
    }
    tierMap[tier].quantity += order.quantity as number;
    tierMap[tier].revenue_cents += order.amount_cents as number;
  }

  // Recent check-ins (last 10, most recent first)
  const recentCheckins = guestList
    .filter((g: Record<string, unknown>) => g.first_checked_in_at)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(b.first_checked_in_at as string).getTime() - new Date(a.first_checked_in_at as string).getTime()
    )
    .slice(0, 10)
    .map((g: Record<string, unknown>) => ({
      name: g.name,
      ticket_type: g.ticket_type,
      checked_in_at: g.first_checked_in_at,
    }));

  const stats = {
    event: eventSlug,
    total_guests: totalGuests,
    checked_in: checkedIn,
    walk_ins: walkIns,
    walk_in_limit: eventData.walk_in_limit,
    pre_sale: preSale,
    revenue_cents: revenueCents,
    capacity: eventData.capacity,
    by_tier: tierMap,
    recent_checkins: recentCheckins,
  };

  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
