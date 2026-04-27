import type { APIRoute } from 'astro';
import { requireAdmin } from '../../lib/auth';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const DEFAULT_HOMEPAGE_COPY = 'a sexy daytime affair on...';

interface EventRow {
  id: string;
  slug: string;
  name: string;
  date: string;
  venue: string | null;
  homepage_copy: string | null;
  walk_in_limit: number;
  capacity: number | null;
  stripe_url: string | null;
  created_at: string;
}

// Slug validation: lowercase alphanumeric + hyphens
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

// GET — list all events ordered by date desc
export const GET: APIRoute = async ({ cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from('events')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ events: (data ?? []) as EventRow[] }), { status: 200, headers: JSON_HEADERS });
};

// POST — create a new event
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const venue = typeof body.venue === 'string' ? body.venue.trim() : null;
  const homepageCopy = typeof body.homepage_copy === 'string' && body.homepage_copy.trim()
    ? body.homepage_copy.trim()
    : DEFAULT_HOMEPAGE_COPY;
  const walkInLimit = typeof body.walk_in_limit === 'number' ? body.walk_in_limit : 30;
  const capacity = typeof body.capacity === 'number' ? body.capacity : null;
  const stripeUrl = typeof body.stripe_url === 'string' && body.stripe_url.trim() ? body.stripe_url.trim() : null;

  // Validate required fields
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Slug is required' }), { status: 400, headers: JSON_HEADERS });
  }
  if (!isValidSlug(slug)) {
    return new Response(JSON.stringify({ error: 'Slug must be lowercase alphanumeric with hyphens only' }), { status: 400, headers: JSON_HEADERS });
  }
  if (!name) {
    return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400, headers: JSON_HEADERS });
  }
  if (!date) {
    return new Response(JSON.stringify({ error: 'Date is required' }), { status: 400, headers: JSON_HEADERS });
  }
  if (isNaN(Date.parse(date))) {
    return new Response(JSON.stringify({ error: 'Date is not valid' }), { status: 400, headers: JSON_HEADERS });
  }

  // Check slug uniqueness
  const { data: existing } = await auth.supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ error: `Slug "${slug}" is already taken` }), { status: 409, headers: JSON_HEADERS });
  }

  const { data: event, error } = await auth.supabase
    .from('events')
    .insert({
      slug,
      name,
      date,
      venue,
      homepage_copy: homepageCopy,
      walk_in_limit: walkInLimit,
      capacity,
      stripe_url: stripeUrl,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ event: event as EventRow }), { status: 201, headers: JSON_HEADERS });
};

// PUT — update an existing event (slug identifies the record)
export const PUT: APIRoute = async ({ request, cookies }) => {
  const auth = await requireAdmin(cookies);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Slug is required to identify the event' }), { status: 400, headers: JSON_HEADERS });
  }

  // Build partial update object — only include provided fields
  const updates: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.date === 'string' && body.date.trim()) {
    if (isNaN(Date.parse(body.date.trim()))) {
      return new Response(JSON.stringify({ error: 'Date is not valid' }), { status: 400, headers: JSON_HEADERS });
    }
    updates.date = body.date.trim();
  }
  if (typeof body.venue === 'string') {
    updates.venue = body.venue.trim() || null;
  }
  if (typeof body.homepage_copy === 'string') {
    updates.homepage_copy = body.homepage_copy.trim() || DEFAULT_HOMEPAGE_COPY;
  }
  if (typeof body.walk_in_limit === 'number') {
    updates.walk_in_limit = body.walk_in_limit;
  }
  if (typeof body.capacity === 'number') {
    updates.capacity = body.capacity;
  }
  if (body.capacity === null) {
    updates.capacity = null;
  }
  if (typeof body.stripe_url === 'string') {
    updates.stripe_url = body.stripe_url.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: event, error } = await auth.supabase
    .from('events')
    .update(updates)
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return new Response(JSON.stringify({ error: `Event "${slug}" not found` }), { status: 404, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ event: event as EventRow }), { status: 200, headers: JSON_HEADERS });
};
