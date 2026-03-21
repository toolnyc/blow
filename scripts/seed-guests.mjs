// One-time seed script. Run with:
//   node --env-file .env.local scripts/seed-guests.mjs

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
const lines = csv.trim().split('\n').slice(1); // skip header row

const raw = lines
  .filter(l => l.trim())
  .map(line => {
    const cols = line.split(',');
    return {
      name: cols[0]?.trim() || '',
      email: cols[1]?.trim() || '',
      ticket_type: cols[2]?.trim() || '',
      tickets: parseInt(cols[3]?.trim() || '1', 10) || 1,
      notes: cols.slice(6).join(',').trim(),
    };
  })
  .filter(r => r.name);

// Merge duplicate names (e.g. Sallie Bestul appears twice with different emails/types)
const byName = new Map();
for (const row of raw) {
  const key = row.name.toLowerCase().trim();
  if (!byName.has(key)) {
    byName.set(key, { ...row });
  } else {
    const existing = byName.get(key);
    existing.tickets += row.tickets;
    // Prefer the email from the non-"alt" row
    if (!row.notes.toLowerCase().includes('alt') && row.email) {
      existing.email = row.email;
    }
    // Concatenate ticket types if different
    if (existing.ticket_type !== row.ticket_type) {
      existing.ticket_type = `${existing.ticket_type} + ${row.ticket_type}`;
    }
    if (row.notes && !existing.notes.includes(row.notes)) {
      existing.notes = [existing.notes, row.notes].filter(Boolean).join('; ');
    }
  }
}

const guests = Array.from(byName.values()).map(g => ({
  event: 'march21',
  name: g.name,
  email: g.email || null,
  ticket_type: g.ticket_type,
  tickets: g.tickets,
  notes: g.notes || null,
  checked_in_count: 0,
}));

console.log(`Seeding ${guests.length} guests for event: march21`);

const { error } = await supabase
  .from('guests')
  .upsert(guests, { onConflict: 'event,name' });

if (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}

console.log(`✓ Done — ${guests.length} guests seeded`);
