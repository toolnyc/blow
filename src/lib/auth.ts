import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

// Emails authorized to access /admin
export const ADMIN_EMAILS: string[] = [
  'boss@blowme.nyc',
  'inyourdirtyears@gmail.com',
];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

type AdminResult =
  | { supabase: SupabaseClient; error?: never }
  | { error: Response; supabase?: never };

/**
 * Shared admin auth gate for API routes.
 * In dev mode, returns a service-role client without checking cookies.
 */
export async function requireAdmin(cookies: AstroCookies): Promise<AdminResult> {
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY,
  );

  // Dev bypass: skip auth entirely in local development
  if (import.meta.env.DEV) {
    return { supabase };
  }

  const accessToken = cookies.get('sb-access-token')?.value;
  if (!accessToken) {
    return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS }) };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS }) };
  }

  const userEmail = authData.user.email?.toLowerCase();
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: JSON_HEADERS }) };
  }

  return { supabase };
}
