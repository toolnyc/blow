import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import {
  notifyDailySummary,
  notifySalesAlert,
  notifyError,
  type EventSummary,
  type TierSummary,
} from '../../../lib/discord';

export const prerender = false;

const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_ANON_KEY
);

function verifyCron(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return true; // no secret configured = allow (dev)
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch upcoming events (today or future)
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('slug, name, date, capacity')
      .gte('date', today)
      .order('date', { ascending: true });

    if (eventsError) {
      console.error('Cron: failed to fetch events:', eventsError);
      void notifyError({ endpoint: 'cron/daily-summary', message: eventsError.message });
      return new Response(JSON.stringify({ error: 'Failed to fetch events' }), { status: 500 });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ message: 'No upcoming events' }), { status: 200 });
    }

    // Fetch subscriber count
    const { count: subscriberCount } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true });

    const slugs = events.map((e) => e.slug);

    // Fetch all orders for upcoming events
    const { data: allOrders } = await supabase
      .from('orders')
      .select('event, ticket_type, quantity, amount_cents, created_at')
      .in('event', slugs);

    // Fetch all guests for walk-in counts
    const { data: allGuests } = await supabase
      .from('guests')
      .select('event, ticket_type, tickets')
      .in('event', slugs);

    const orders = allOrders ?? [];
    const guests = allGuests ?? [];

    const summaries: EventSummary[] = [];

    for (const ev of events) {
      const eventDate = new Date(ev.date);
      const daysUntil = Math.max(0, Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const dateStr = eventDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      const eventOrders = orders.filter((o) => o.event === ev.slug);
      const eventGuests = guests.filter((g) => g.event === ev.slug);

      // Tier breakdown from orders
      const tierMap = new Map<string, TierSummary>();
      for (const o of eventOrders) {
        const name = (o.ticket_type as string) ?? 'Unknown';
        const existing = tierMap.get(name) ?? { name, sold: 0, revenue: 0 };
        existing.sold += o.quantity as number;
        existing.revenue += o.amount_cents as number;
        tierMap.set(name, existing);
      }

      // Add walk-ins from guests table
      const walkIns = eventGuests.filter((g) => g.ticket_type === 'Walk-in');
      if (walkIns.length > 0) {
        const existing = tierMap.get('Walk-in') ?? { name: 'Walk-in', sold: 0, revenue: 0 };
        existing.sold += walkIns.reduce((s, g) => s + (g.tickets as number), 0);
        tierMap.set('Walk-in', existing);
      }

      const tiers = Array.from(tierMap.values());
      const ticketsSold = tiers.reduce((s, t) => s + t.sold, 0);
      const revenue = tiers.reduce((s, t) => s + t.revenue, 0);

      // Last 24h sales
      const last24hSales = eventOrders.filter(
        (o) => new Date(o.created_at as string) >= new Date(yesterday)
      ).reduce((s, o) => s + (o.quantity as number), 0);

      const summary: EventSummary = {
        eventName: ev.name,
        eventSlug: ev.slug,
        date: dateStr,
        daysUntil,
        ticketsSold,
        capacity: ev.capacity ?? null,
        revenue,
        tiers,
        last24hSales,
        subscriberCount: subscriberCount ?? 0,
      };

      summaries.push(summary);

      // --- Sales push alerts ---
      generateAlerts(summary, eventOrders, yesterday);
    }

    await notifyDailySummary(summaries);

    return new Response(JSON.stringify({ sent: summaries.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Cron error:', err);
    void notifyError({ endpoint: 'cron/daily-summary', message: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateAlerts(summary: EventSummary, eventOrders: any[], yesterday: string): void {
  const { eventName, daysUntil, ticketsSold, capacity, last24hSales } = summary;

  const fillPct = capacity ? Math.round((ticketsSold / capacity) * 100) : null;

  // 1. Event approaching + low fill
  if (capacity && daysUntil <= 7 && daysUntil > 0 && fillPct !== null && fillPct < 70) {
    const spotsLeft = capacity - ticketsSold;
    void notifySalesAlert({
      eventName,
      reason: `Event is ${daysUntil} day${daysUntil === 1 ? '' : 's'} away but only ${fillPct}% full`,
      stats: `${ticketsSold}/${capacity} tickets sold — ${spotsLeft} spots left`,
      recommendation: daysUntil <= 3
        ? 'Time to push hard — story blitz, DMs, last-call post'
        : 'Ramp up promo — post to stories, hit group chats, consider a price bump or flash tier',
    });
  }

  // 2. Sales stalled — had sales before but zero in last 24h, event within 10 days
  if (daysUntil <= 10 && daysUntil > 0 && ticketsSold > 0 && last24hSales === 0) {
    void notifySalesAlert({
      eventName,
      reason: 'Zero sales in the last 24 hours',
      stats: `${ticketsSold} total tickets sold, 0 in last 24h`,
      recommendation: 'Momentum stalled — post a teaser, share a lineup update, or drop a promo code',
    });
  }

  // 3. Velocity drop — compare last 24h to daily average
  if (daysUntil <= 14 && daysUntil > 0 && ticketsSold > 5) {
    const totalDays = eventOrders.length > 0
      ? Math.max(1, Math.ceil(
          (Date.now() - new Date(eventOrders[0].created_at as string).getTime()) / (1000 * 60 * 60 * 24)
        ))
      : 1;
    const dailyAvg = ticketsSold / totalDays;
    if (dailyAvg > 1 && last24hSales < dailyAvg * 0.3) {
      void notifySalesAlert({
        eventName,
        reason: `Sales velocity dropped — ${last24hSales} today vs ${dailyAvg.toFixed(1)}/day average`,
        stats: `${ticketsSold} total, averaging ${dailyAvg.toFixed(1)}/day, last 24h: ${last24hSales}`,
        recommendation: 'Pace is slipping — good time for a story post or a crew-level push',
      });
    }
  }

  // 4. Almost sold out — celebrate and push for sellout
  if (capacity && fillPct !== null && fillPct >= 85 && fillPct < 100 && daysUntil > 0) {
    const spotsLeft = capacity - ticketsSold;
    void notifySalesAlert({
      eventName,
      reason: `${fillPct}% sold — almost there!`,
      stats: `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left out of ${capacity}`,
      recommendation: `"Only ${spotsLeft} left" is the best marketing copy there is — post it everywhere`,
    });
  }

  // 5. Sold out
  if (capacity && ticketsSold >= capacity && daysUntil > 0) {
    void notifySalesAlert({
      eventName,
      reason: 'SOLD OUT',
      stats: `${ticketsSold}/${capacity} — every ticket gone`,
      recommendation: 'Post the sold-out graphic. Consider opening a last-minute tier or bumping walk-in capacity.',
    });
  }
}
