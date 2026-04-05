import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const event = url.searchParams.get('event');
  if (!event) {
    return new Response(JSON.stringify({ error: 'Missing event parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data: guests, error } = await supabase
    .from('guests')
    .select('*')
    .eq('event', event);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allGuests = guests ?? [];
  const totalGuests = allGuests.reduce((s, g) => s + (g.tickets as number), 0);
  const checkedIn = allGuests.reduce((s, g) => s + (g.checked_in_count as number), 0);
  const showRate = totalGuests > 0 ? Math.round((checkedIn / totalGuests) * 100) : 0;

  const walkIns = allGuests.filter((g) => g.ticket_type === 'Walk-in');
  const walkInCount = walkIns.length;

  // Revenue breakdown by ticket type
  // Since amount_cents isn't in the DB yet, we derive from ticket_type pricing
  const TIER_PRICES: Record<string, number> = {
    'Regular': 2000,
    'Supporter': 3500,
    'Walk-in': 2000,
  };

  const tierBreakdown: Record<string, { count: number; tickets: number; revenue: number }> = {};
  for (const g of allGuests) {
    const tier = (g.ticket_type as string) || 'Unknown';
    if (!tierBreakdown[tier]) {
      tierBreakdown[tier] = { count: 0, tickets: 0, revenue: 0 };
    }
    tierBreakdown[tier].count++;
    tierBreakdown[tier].tickets += g.tickets as number;
    tierBreakdown[tier].revenue += (g.tickets as number) * (TIER_PRICES[tier] ?? 0);
  }

  const totalRevenue = Object.values(tierBreakdown).reduce((s, t) => s + t.revenue, 0);

  // Arrival timeline: group check-ins by 15-min intervals
  const arrivals: { time: string; count: number; cumulative: number }[] = [];
  const checkedInGuests = allGuests
    .filter((g) => g.first_checked_in_at)
    .sort((a, b) =>
      new Date(a.first_checked_in_at as string).getTime() -
      new Date(b.first_checked_in_at as string).getTime()
    );

  if (checkedInGuests.length > 0) {
    // Group into 15-min buckets
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
    (g) => g.checked_in_count === 0 && g.ticket_type !== 'Walk-in'
  );
  const preSaleTotal = allGuests.filter((g) => g.ticket_type !== 'Walk-in').length;
  const noShowRate = preSaleTotal > 0 ? Math.round((noShows.length / preSaleTotal) * 100) : 0;

  // Before midnight count
  let beforeMidnight = 0;
  for (const g of checkedInGuests) {
    const h = new Date(g.first_checked_in_at as string).getHours();
    // Before midnight = hours < 24 (same day, before 12 AM next day)
    // Since events typically run 10 PM - 4 AM, "before midnight" means hour >= 18 && hour < 24
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
        walkInLimit: 30,
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
        walkInLimit: 30,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
