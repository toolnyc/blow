import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { notifyWalkin, notifyError } from '../../lib/discord';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let event: string, name: string, notes: string | undefined;
  try {
    ({ event, name, notes } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!event || !name?.trim()) {
    return new Response(JSON.stringify({ error: 'event and name are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data: eventRow } = await supabase
    .from('events')
    .select('walk_in_limit')
    .eq('slug', event)
    .single();

  const walkinLimit = eventRow?.walk_in_limit ?? 30;

  const { count } = await supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .eq('event', event)
    .eq('ticket_type', 'Walk-in');

  if (count !== null && count >= walkinLimit) {
    return new Response(JSON.stringify({ error: 'Walk-in limit reached' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: guest, error } = await supabase
    .from('guests')
    .insert({
      event,
      name: name.trim(),
      ticket_type: 'Walk-in',
      tickets: 1,
      notes: notes?.trim() || null,
      checked_in_count: 0,
    })
    .select()
    .single();

  if (error) {
    void notifyError({ endpoint: 'add-guest', message: error.message, context: `Event: ${event}` });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  void notifyWalkin({ event, name: name.trim(), notes: notes?.trim() });

  return new Response(JSON.stringify({ success: true, guest }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
