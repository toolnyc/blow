import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let id: string, action: string;
  try {
    ({ id, action } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!id || !['in', 'undo'].includes(action)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data: guest, error: fetchError } = await supabase
    .from('guests')
    .select('checked_in_count, tickets, first_checked_in_at')
    .eq('id', id)
    .single();

  if (fetchError || !guest) {
    return new Response(JSON.stringify({ error: 'Guest not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let newCount = guest.checked_in_count;
  let newFirstCheckedIn = guest.first_checked_in_at;

  if (action === 'in') {
    if (newCount >= guest.tickets) {
      return new Response(JSON.stringify({ error: 'Already fully checked in' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    newCount++;
    if (newCount === 1) newFirstCheckedIn = new Date().toISOString();
  } else {
    if (newCount <= 0) {
      return new Response(JSON.stringify({ error: 'Not checked in' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    newCount--;
    if (newCount === 0) newFirstCheckedIn = null;
  }

  const { error: updateError } = await supabase
    .from('guests')
    .update({
      checked_in_count: newCount,
      first_checked_in_at: newFirstCheckedIn,
      last_action_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, checked_in_count: newCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
