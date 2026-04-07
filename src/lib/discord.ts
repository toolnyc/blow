// Discord webhook notifications — fire-and-forget, prod-only, non-blocking

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

const COLORS = {
  purchase: 0x2ecc71,
  signup: 0x3498db,
  walkin: 0xf39c12,
  error: 0xe74c3c,
  summary: 0x9b59b6,
  alert: 0xff9800,
} as const;

async function sendWebhook(embeds: DiscordEmbed[]): Promise<void> {
  const url = import.meta.env.DISCORD_WEBHOOK_URL;
  if (!url || !import.meta.env.PROD) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
    if (!res.ok) {
      console.warn(`Discord webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn('Discord webhook failed:', err);
  }
}

export function notifyPurchase(data: {
  email: string | null;
  guestName: string;
  eventSlug: string;
  ticketType: string;
  quantity: number;
  amountCents: number;
  accessCode?: string;
}): Promise<void> {
  const dollars = (data.amountCents / 100).toFixed(2);
  const fields: DiscordEmbedField[] = [
    { name: 'Name', value: data.guestName, inline: true },
    { name: 'Email', value: data.email ?? 'N/A', inline: true },
    { name: 'Event', value: data.eventSlug, inline: true },
    { name: 'Tier', value: data.ticketType, inline: true },
    { name: 'Qty', value: String(data.quantity), inline: true },
    { name: 'Amount', value: `$${dollars}`, inline: true },
  ];
  if (data.accessCode) {
    fields.push({ name: 'Access Code', value: data.accessCode, inline: true });
  }
  return sendWebhook([{
    title: data.accessCode ? '🔑 Early Access Purchase' : '🎟️ Ticket Purchase',
    color: COLORS.purchase,
    fields,
    timestamp: new Date().toISOString(),
  }]);
}

export function notifySignup(email: string): Promise<void> {
  return sendWebhook([{
    title: '📬 New Subscriber',
    color: COLORS.signup,
    fields: [
      { name: 'Email', value: email },
    ],
    timestamp: new Date().toISOString(),
  }]);
}

export function notifyWalkin(data: {
  event: string;
  name: string;
  notes?: string | null;
}): Promise<void> {
  const fields: DiscordEmbedField[] = [
    { name: 'Name', value: data.name, inline: true },
    { name: 'Event', value: data.event, inline: true },
  ];
  if (data.notes) {
    fields.push({ name: 'Notes', value: data.notes });
  }
  return sendWebhook([{
    title: '🚶 Walk-in Added',
    color: COLORS.walkin,
    fields,
    timestamp: new Date().toISOString(),
  }]);
}

export interface TierSummary {
  name: string;
  sold: number;
  revenue: number;
}

export interface EventSummary {
  eventName: string;
  eventSlug: string;
  date: string;
  daysUntil: number;
  ticketsSold: number;
  capacity: number | null;
  revenue: number;
  tiers: TierSummary[];
  last24hSales: number;
  subscriberCount: number;
}

export function notifyDailySummary(events: EventSummary[]): Promise<void> {
  if (events.length === 0) return Promise.resolve();

  const embeds: DiscordEmbed[] = events.map((ev) => {
    const dollars = (ev.revenue / 100).toFixed(2);
    const capStr = ev.capacity ? `${ev.ticketsSold} / ${ev.capacity}` : String(ev.ticketsSold);
    const pctStr = ev.capacity ? ` (${Math.round((ev.ticketsSold / ev.capacity) * 100)}%)` : '';
    const tierLines = ev.tiers.map(
      (t) => `${t.name}: ${t.sold} tickets — $${(t.revenue / 100).toFixed(2)}`
    ).join('\n') || 'No sales yet';

    const fields: DiscordEmbedField[] = [
      { name: 'Date', value: ev.date, inline: true },
      { name: 'Days Out', value: ev.daysUntil === 0 ? 'TODAY' : String(ev.daysUntil), inline: true },
      { name: 'Tickets', value: `${capStr}${pctStr}`, inline: true },
      { name: 'Revenue', value: `$${dollars}`, inline: true },
      { name: 'Last 24h', value: `${ev.last24hSales} sales`, inline: true },
      { name: 'Subscribers', value: String(ev.subscriberCount), inline: true },
      { name: 'By Tier', value: tierLines },
    ];

    return {
      title: `📊 ${ev.eventName}`,
      color: COLORS.summary,
      fields,
      timestamp: new Date().toISOString(),
    };
  });

  return sendWebhook(embeds);
}

export function notifySalesAlert(data: {
  eventName: string;
  reason: string;
  recommendation: string;
  stats: string;
}): Promise<void> {
  return sendWebhook([{
    title: `📢 ${data.eventName}`,
    color: COLORS.alert,
    fields: [
      { name: 'Signal', value: data.reason },
      { name: 'Numbers', value: data.stats },
      { name: 'Recommendation', value: data.recommendation },
    ],
    timestamp: new Date().toISOString(),
  }]);
}

export function notifyError(data: {
  endpoint: string;
  message: string;
  context?: string;
}): Promise<void> {
  const fields: DiscordEmbedField[] = [
    { name: 'Endpoint', value: data.endpoint, inline: true },
    { name: 'Error', value: data.message.slice(0, 1024) },
  ];
  if (data.context) {
    fields.push({ name: 'Context', value: data.context.slice(0, 1024) });
  }
  return sendWebhook([{
    title: '🔴 API Error',
    color: COLORS.error,
    fields,
    timestamp: new Date().toISOString(),
  }]);
}
