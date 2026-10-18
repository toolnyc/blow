import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const EVENT_SLUG = 'may3';
const COSTS = { pizza: 100_00, wine: 300_00 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1); }
if (!SUPABASE_ANON_KEY) { console.error('Missing SUPABASE_ANON_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function fmtDollars(cents) { return `$${(cents / 100).toFixed(2)}`; }

async function main() {
  // Fetch ticket tiers to get the canonical (case-sensitive) tier names
  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('name, price_cents')
    .eq('event_slug', EVENT_SLUG)
    .eq('active', true);

  // Build set of canonical tier names (case-sensitive) and price map
  const canonicalTierNames = new Set((tiers ?? []).map((t) => t.name));
  const tierPriceMap = new Map();
  if (tiers) for (const t of tiers) tierPriceMap.set(t.price_cents, t.name);

  // Fetch all may3 orders (excluding refunds)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('event', EVENT_SLUG)
    .neq('status', 'refunded')
    .order('created_at', { ascending: true });

  if (error) { console.error('Supabase error:', error); process.exit(1); }
  if (!orders || orders.length === 0) {
    console.log('No orders found for May 3.');
    return;
  }

  // Classification:
  // ticket_type "Regular", "Supporter", "Early Riser (Before 12P)" = real tickets
  // ticket_type "regular" (lowercase) = webhook default = no tier metadata = DONATION
  const tickets = [];
  const beverages = [];
  const doorDonations = [];

  for (const order of orders) {
    const tt = order.ticket_type ?? '';
    const amt = order.amount_cents;
    const qty = order.quantity;

    // Skip test orders
    if (tt === 'Schedule Test' || tt.toLowerCase() === 'test') continue;

    if (canonicalTierNames.has(tt)) {
      // Exact case-sensitive match with a known tier → ticket
      tickets.push({ tier: tt, email: order.customer_email, quantity: qty, amountCents: amt });
    } else if (tt === 'regular') {
      // Lowercase "regular" = webhook default = donation
      const entry = { email: order.customer_email, amountCents: amt };
      if (amt <= 1500) beverages.push(entry);
      else doorDonations.push(entry);
    } else {
      // Unknown ticket_type — try amount matching
      const unitPrice = qty > 0 ? Math.round(amt / qty) : 0;
      const matchedTier = tierPriceMap.get(unitPrice);
      if (matchedTier) {
        tickets.push({ tier: matchedTier, email: order.customer_email, quantity: qty, amountCents: amt });
      } else {
        (amt <= 1500 ? beverages : doorDonations).push({ email: order.customer_email, amountCents: amt });
      }
    }
  }

  // Compute financials
  const ticketRevenue = tickets.reduce((s, t) => s + t.amountCents, 0);
  const beverageRevenue = beverages.reduce((s, d) => s + d.amountCents, 0);
  const doorRevenue = doorDonations.reduce((s, d) => s + d.amountCents, 0);
  const totalRevenue = ticketRevenue + beverageRevenue + doorRevenue;
  const totalCosts = COSTS.pizza + COSTS.wine;
  const net = totalRevenue - totalCosts;

  const tierMap = {};
  for (const t of tickets) {
    const key = t.tier;
    if (!tierMap[key]) tierMap[key] = { count: 0, tickets: 0, revenue: 0 };
    tierMap[key].count++;
    tierMap[key].tickets += t.quantity;
    tierMap[key].revenue += t.amountCents;
  }

  const uniqueTicketBuyers = new Set(tickets.map((t) => t.email).filter(Boolean));
  const uniqueBevDonors = new Set(beverages.map((d) => d.email).filter(Boolean));
  const uniqueDoorDonors = new Set(doorDonations.map((d) => d.email).filter(Boolean));
  const allUniqueEmails = new Set([...uniqueTicketBuyers, ...uniqueBevDonors, ...uniqueDoorDonors]);

  const totalTicketsSold = tickets.reduce((s, t) => s + t.quantity, 0);
  const avgTicketPerOrder = tickets.length > 0 ? ticketRevenue / tickets.length : 0;
  const avgBeverage = beverages.length > 0 ? beverageRevenue / beverages.length : 0;
  const avgDoor = doorDonations.length > 0 ? doorRevenue / doorDonations.length : 0;

  const ticketBuyersWhoDonatedBev = [...uniqueTicketBuyers].filter((e) => uniqueBevDonors.has(e));
  const ticketBuyersWhoDonatedDoor = [...uniqueTicketBuyers].filter((e) => uniqueDoorDonors.has(e));

  // Donation amount breakdown
  const bevAmounts = {};
  for (const d of beverages) {
    const key = fmtDollars(d.amountCents);
    bevAmounts[key] = (bevAmounts[key] || 0) + 1;
  }
  const doorAmounts = {};
  for (const d of doorDonations) {
    const key = fmtDollars(d.amountCents);
    doorAmounts[key] = (doorAmounts[key] || 0) + 1;
  }

  // ── Report ────────────────────────────────────────────────────────────────

  const lines = [];

  lines.push('# Post-Mortem — May 3 2026');
  lines.push('');
  lines.push(`> Auto-generated ${new Date().toISOString().slice(0, 10)} from Supabase orders`);
  lines.push('');

  lines.push('---');
  lines.push('');

  lines.push('## Financial Summary');
  lines.push('');
  lines.push('| Category | Amount |');
  lines.push('|----------|--------|');

  for (const [tier, data] of Object.entries(tierMap)) {
    lines.push(`| ${tier} (${data.tickets} tkts, ${data.count} orders) | ${fmtDollars(data.revenue)} |`);
  }
  lines.push(`| Ticket subtotal | ${fmtDollars(ticketRevenue)} |`);
  if (beverages.length > 0) {
    lines.push(`| Beverage donations (${beverages.length}) | ${fmtDollars(beverageRevenue)} |`);
  }
  if (doorDonations.length > 0) {
    lines.push(`| Door donations (${doorDonations.length}) | ${fmtDollars(doorRevenue)} |`);
  }
  lines.push(`| **Revenue** | **${fmtDollars(totalRevenue)}** |`);
  lines.push('');
  lines.push('| Cost | |');
  lines.push('|------|--------|');
  lines.push(`| Pizza | -${fmtDollars(COSTS.pizza)} |`);
  lines.push(`| Wine | -${fmtDollars(COSTS.wine)} |`);
  lines.push('| **Costs** | **-' + fmtDollars(totalCosts) + '** |');
  lines.push('');
  lines.push(`| **Net** | **${fmtDollars(net)}** |`);
  lines.push('');

  const profitLabel = net >= 0 ? 'profit' : 'loss';
  lines.push(`Blow May 3 generated a **${profitLabel} of ${fmtDollars(Math.abs(net))}**.`);
  lines.push('');

  lines.push('---');
  lines.push('');

  lines.push('## Ticket Sales');
  lines.push('');
  lines.push('| Tier | Orders | Tickets | Revenue |');
  lines.push('|------|--------|---------|---------|');
  for (const [tier, data] of Object.entries(tierMap)) {
    lines.push(`| ${tier} | ${data.count} | ${data.tickets} | ${fmtDollars(data.revenue)} |`);
  }
  lines.push(`| **Total** | **${tickets.length}** | **${totalTicketsSold}** | **${fmtDollars(ticketRevenue)}** |`);
  lines.push('');

  lines.push('---');
  lines.push('');

  lines.push('## Donations');
  lines.push('');
  lines.push('| Type | Count | Total | Average |');
  lines.push('|------|-------|-------|---------|');
  if (beverages.length > 0) {
    lines.push(`| Beverage | ${beverages.length} | ${fmtDollars(beverageRevenue)} | ${fmtDollars(Math.round(avgBeverage))} |`);
  }
  if (doorDonations.length > 0) {
    lines.push(`| Door | ${doorDonations.length} | ${fmtDollars(doorRevenue)} | ${fmtDollars(Math.round(avgDoor))} |`);
  }
  lines.push(`| **Total** | **${beverages.length + doorDonations.length}** | **${fmtDollars(beverageRevenue + doorRevenue)}** | |`);
  lines.push('');
  if (Object.keys(bevAmounts).length > 0) {
    lines.push('Beverage donation amounts:');
    for (const [amt, count] of Object.entries(bevAmounts).sort()) {
      lines.push(`- ${amt}: ${count}`);
    }
    lines.push('');
  }
  if (Object.keys(doorAmounts).length > 0) {
    lines.push('Door donation amounts:');
    for (const [amt, count] of Object.entries(doorAmounts).sort()) {
      lines.push(`- ${amt}: ${count}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  lines.push('## Interesting Stats');
  lines.push('');
  lines.push(`- **${orders.length}** total transactions`);
  lines.push(`- **${allUniqueEmails.size}** unique customers`);
  lines.push(`- **${uniqueTicketBuyers.size}** ticket buyers, **${uniqueBevDonors.size}** beverage donors, **${uniqueDoorDonors.size}** door donors`);
  if (tickets.length > 0) {
    lines.push(`- **${fmtDollars(Math.round(avgTicketPerOrder))}** average per ticket order`);
    lines.push(`- **${totalTicketsSold}** total tickets across ${tickets.length} orders`);
  }
  if (beverages.length > 0) {
    lines.push(`- **${fmtDollars(Math.round(avgBeverage))}** average beverage donation`);
  }
  if (doorDonations.length > 0) {
    lines.push(`- **${fmtDollars(Math.round(avgDoor))}** average door donation`);
  }
  if (ticketBuyersWhoDonatedBev.length > 0) {
    lines.push(`- **${ticketBuyersWhoDonatedBev.length}** ticket buyers also donated beverages`);
  }
  if (ticketBuyersWhoDonatedDoor.length > 0) {
    lines.push(`- **${ticketBuyersWhoDonatedDoor.length}** ticket buyers also made a door donation`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');

  lines.push('## What Went Well');
  lines.push('');
  lines.push('- ...');
  lines.push('');

  lines.push('## Pain Points / For Next Time');
  lines.push('');
  lines.push('- ...');

  const report = lines.join('\n');

  console.log(report);
  console.log('\n' + '─'.repeat(70) + '\n');

  const obsidianDir = path.resolve(process.env.HOME, 'Dropbox/Notes/Obsidian/Clubstack/Blow');
  const reportPath = path.join(obsidianDir, 'Post-Mortem — May 3 2026.md');

  if (fs.existsSync(obsidianDir)) {
    fs.writeFileSync(reportPath, report);
    console.log(`Written to: ${reportPath}`);
  } else {
    console.log(`Obsidian dir not found: ${obsidianDir}`);
    console.log('Report printed above — copy manually.');
  }
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
