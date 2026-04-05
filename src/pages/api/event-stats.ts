import type { APIRoute } from 'astro';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const supabase = auth.supabase;

  // Parse event slug from query params
  const url = new URL(request.url);
  const event = url.searchParams.get('event');
  if (!event) {
    return new Response(JSON.stringify({ error: 'Missing event parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch all guests for this event
  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('*')
    .eq('event', event);

  if (guestsError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch guests' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Try to fetch orders (may not exist yet if table hasn't been migrated)
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('event', event);

  // Try to fetch event metadata for walk_in_limit
  const { data: eventData } = await supabase
    .from('events')
    .select('walk_in_limit')
    .eq('slug', event)
    .single();

  const walkInLimit = eventData?.walk_in_limit ?? 30;

  const allGuests = guests ?? [];
  const orderList = orders ?? [];
  const hasOrders = orderList.length > 0;

  const totalGuests = allGuests.reduce((s: number, g: Record<string, unknown>) => s + (g.tickets as number), 0);
  const checkedIn = allGuests.reduce((s: number, g: Record<string, unknown>) => s + (g.checked_in_count as number), 0);
  const showRate = totalGuests > 0 ? Math.round((checkedIn / totalGuests) * 100) : 0;
  const walkInCount = allGuests.filter((g: Record<string, unknown>) => g.ticket_type === 'Walk-in').length;

  // Revenue: use orders table if available, otherwise estimate from tier prices
  const TIER_PRICES: Record<string, number> = {
    'Regular': 2000,
    'Supporter': 3500,
    'Walk-in': 2000,
  };

  const tierBreakdown: Record<string, { count: number; tickets: number; revenue: number }> = {};

  if (hasOrders) {
    // Build tier breakdown from orders (actual payment data)
    for (const order of orderList) {
      const tier = (order.ticket_type as string) ?? 'Unknown';
      if (!tierBreakdown[tier]) {
        tierBreakdown[tier] = { count: 0, tickets: 0, revenue: 0 };
      }
      tierBreakdown[tier].count++;
      tierBreakdown[tier].tickets += order.quantity as number;
      tierBreakdown[tier].revenue += order.amount_cents as number;
    }
    // Add walk-ins from guests (they won't have orders)
    const walkIns = allGuests.filter((g: Record<string, unknown>) => g.ticket_type === 'Walk-in');
    if (walkIns.length > 0) {
      if (!tierBreakdown['Walk-in']) {
        tierBreakdown['Walk-in'] = { count: 0, tickets: 0, revenue: 0 };
      }
      tierBreakdown['Walk-in'].count += walkIns.length;
      tierBreakdown['Walk-in'].tickets += walkIns.reduce((s: number, g: Record<string, unknown>) => s + (g.tickets as number), 0);
      tierBreakdown['Walk-in'].revenue += walkIns.reduce((s: number, g: Record<string, unknown>) => s + (g.tickets as number) * (TIER_PRICES['Walk-in'] ?? 0), 0);
    }
  } else {
    // Estimate from guest ticket types
    for (const g of allGuests) {
      const tier = (g.ticket_type as string) || 'Unknown';
      if (!tierBreakdown[tier]) {
        tierBreakdown[tier] = { count: 0, tickets: 0, revenue: 0 };
      }
      tierBreakdown[tier].count++;
      tierBreakdown[tier].tickets += g.tickets as number;
      tierBreakdown[tier].revenue += (g.tickets as number) * (TIER_PRICES[tier] ?? 0);
    }
  }

  const totalRevenue = Object.values(tierBreakdown).reduce((s, t) => s + t.revenue, 0);

  // Arrival timeline: group check-ins by 15-min intervals
  const arrivals: { time: string; count: number; cumulative: number }[] = [];
  const checkedInGuests = allGuests
    .filter((g: Record<string, unknown>) => g.first_checked_in_at)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(a.first_checked_in_at as string).getTime() -
      new Date(b.first_checked_in_at as string).getTime()
    );

  if (checkedInGuests.length > 0) {
    const bucketMs = 15 * 60 * 1000;
    const firstTime = new Date(checkedInGuests[0].first_checked_in_at as string).getTime();
    const lastTime = new Date(checkedInGuests[checkedInGuests.length - 1].first_checked_in_at as string).getTime();
    const startBucket = Math.floor(firstTime / bucketMs) * bucketMs;
    const endBucket = Math.floor(lastTime / bucketMs) * bucketMs;

    const buckets = new Map<number, number>();
    for (let t = startBucket; t <= endBucket; t += bucketMs) {
      buckets.set(t, 0);
    }

    for (const g of checkedInGuests) {
      const t = new Date(g.first_checked_in_at as string).getTime();
      const bucket = Math.floor(t / bucketMs) * bucketMs;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + (g.checked_in_count as number));
    }

    let cumulative = 0;
    for (const [ts, count] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
      cumulative += count;
      const d = new Date(ts);
      const hours = d.getHours();
      const mins = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      arrivals.push({
        time: `${h12}:${mins} ${ampm}`,
        count,
        cumulative,
      });
    }
  }

  // Peak arrival bucket
  let peakTime = '';
  let peakCount = 0;
  for (const a of arrivals) {
    if (a.count > peakCount) {
      peakCount = a.count;
      peakTime = a.time;
    }
  }

  // Insights
  const noShows = allGuests.filter(
    (g: Record<string, unknown>) => (g.checked_in_count as number) === 0 && g.ticket_type !== 'Walk-in'
  );
  const preSaleTotal = allGuests.filter((g: Record<string, unknown>) => g.ticket_type !== 'Walk-in').length;
  const noShowRate = preSaleTotal > 0 ? Math.round((noShows.length / preSaleTotal) * 100) : 0;

  // Before midnight count
  let beforeMidnight = 0;
  for (const g of checkedInGuests) {
    const h = new Date(g.first_checked_in_at as string).getHours();
    if (h >= 12) {
      beforeMidnight += g.checked_in_count as number;
    }
  }
  const beforeMidnightPct = checkedIn > 0 ? Math.round((beforeMidnight / checkedIn) * 100) : 0;

  return new Response(
    JSON.stringify({
      event,
      summary: {
        totalGuests,
        checkedIn,
        showRate,
        walkInCount,
        walkInLimit: walkInLimit,
        totalRevenue,
      },
      tierBreakdown,
      arrivals,
      peakTime,
      peakCount,
      insights: {
        peakTime,
        peakCount,
        beforeMidnightPct,
        noShowCount: noShows.length,
        noShowRate,
        walkInCount,
        walkInLimit: walkInLimit,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
