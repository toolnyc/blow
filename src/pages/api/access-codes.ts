import type { APIRoute } from 'astro';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// GET — list access codes, optionally filtered by event
export const GET: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const eventSlug = url.searchParams.get('event');

  let query = auth.supabase
    .from('access_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (eventSlug) {
    query = query.eq('event_slug', eventSlug);
  }

  const { data: codes, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ codes: codes ?? [] }), { status: 200, headers: JSON_HEADERS });
};

// POST — create a new access code
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const eventSlug = typeof body.event_slug === 'string' ? body.event_slug.trim() : '';
  let code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const tierNames = Array.isArray(body.tier_names) ? body.tier_names.filter((t): t is string => typeof t === 'string') : [];
  const maxUses = typeof body.max_uses === 'number' && body.max_uses > 0 ? body.max_uses : null;
  const expiresAt = typeof body.expires_at === 'string' ? body.expires_at : null;

  if (!eventSlug || tierNames.length === 0) {
    return new Response(JSON.stringify({ error: 'event_slug and tier_names are required' }), { status: 400, headers: JSON_HEADERS });
  }

  // Auto-generate code if empty
  if (!code) {
    code = crypto.randomUUID().slice(0, 8).toUpperCase();
  }

  // Verify event exists
  const { data: event } = await auth.supabase
    .from('events')
    .select('slug')
    .eq('slug', eventSlug)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ error: `Event "${eventSlug}" not found` }), { status: 404, headers: JSON_HEADERS });
  }

  // Verify tier names exist for this event
  const { data: existingTiers } = await auth.supabase
    .from('ticket_tiers')
    .select('name')
    .eq('event_slug', eventSlug)
    .eq('active', true);

  const existingNames = (existingTiers ?? []).map((t) => t.name.toLowerCase());
  const invalid = tierNames.filter((n) => !existingNames.includes(n.toLowerCase()));
  if (invalid.length > 0) {
    return new Response(JSON.stringify({ error: `Tiers not found: ${invalid.join(', ')}` }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: created, error } = await auth.supabase
    .from('access_codes')
    .insert({
      event_slug: eventSlug,
      code,
      tier_names: tierNames,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ code: created }), { status: 201, headers: JSON_HEADERS });
};

// PATCH — update an existing access code
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.max_uses === 'number' && body.max_uses > 0) updates.max_uses = body.max_uses;
  if (body.max_uses === null) updates.max_uses = null;
  if (typeof body.expires_at === 'string') updates.expires_at = body.expires_at;
  if (body.expires_at === null) updates.expires_at = null;
  if (Array.isArray(body.tier_names)) {
    const tierNames = body.tier_names.filter((t): t is string => typeof t === 'string');
    if (tierNames.length > 0) updates.tier_names = tierNames;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: updated, error } = await auth.supabase
    .from('access_codes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ code: updated }), { status: 200, headers: JSON_HEADERS });
};

// DELETE — soft-delete (deactivate)
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const { error } = await auth.supabase
    .from('access_codes')
    .update({ active: false })
    .eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
};
