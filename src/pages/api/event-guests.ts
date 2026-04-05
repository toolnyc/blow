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
    .select('id, name, email, ticket_type, tickets, checked_in_count, first_checked_in_at, created_at, notes')
    .eq('event', event)
    .order('name');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ guests: guests ?? [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
