// One-off backfill: create order records for march21 attendees so they
// appear in the email campaign segment builder under "Ticket Buyers".
//
// Run with:
//   node --env-file .env.local scripts/backfill-march21-orders.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const csv = readFileSync(join(__dirname, '..', 'private', 'blow-attendees-march21.csv'), 'utf-8');
const lines = csv.trim().split('\n').slice(1);

const orders = lines
  .filter(l => l.trim())
  .map(line => {
    const cols = line.split(',');
    const name = cols[0]?.trim() || '';
    const email = cols[1]?.trim() || '';
    const ticketType = cols[2]?.trim() || 'Regular';
    const qty = parseInt(cols[3]?.trim() || '1', 10) || 1;
    return { name, email, ticketType, qty };
  })
  .filter(r => r.email); // skip rows without email (can't segment them anyway)

console.log(`Found ${orders.length} attendees with emails`);

// Ensure the march21 event exists (orders FK references events.slug)
const { error: eventErr } = await supabase
  .from('events')
  .upsert({
    slug: 'march21',
    name: 'Blow — March 21',
    date: '2026-03-21T22:00:00-04:00',
    venue: 'TBD',
  }, { onConflict: 'slug' });

if (eventErr) {
  console.error('Failed to ensure event exists:', eventErr.message);
  process.exit(1);
}
console.log('✓ Event march21 exists');

// Price lookup from the financials doc: Regular $20, Supporter $40
const priceCents = { Regular: 2000, Supporter: 4000 };

const rows = orders.map(o => ({
  event: 'march21',
  customer_email: o.email.toLowerCase(),
  ticket_type: o.ticketType,
  quantity: o.qty,
  amount_cents: (priceCents[o.ticketType] || 2000) * o.qty,
  status: 'completed',
  stripe_session_id: `backfill_march21_${o.email.toLowerCase()}`,
}));

console.log(`Inserting ${rows.length} order records for event: march21`);

const { error } = await supabase
  .from('orders')
  .upsert(rows, { onConflict: 'stripe_session_id' });

if (error) {
  console.error('Backfill failed:', error.message);
  process.exit(1);
}

console.log(`✓ Done — ${rows.length} orders backfilled`);
