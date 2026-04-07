import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { notifyError } from '../../../lib/discord';

export const prerender = false;

function buildCookieOptions(url: URL): string {
  const isSecure = url.protocol === 'https:';
  const parts = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
  ];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
}

function setCookiesAndRedirect(accessToken: string, refreshToken: string, url: URL): Response {
  const cookieOptions = buildCookieOptions(url);
  const headers = new Headers();
  headers.append('Set-Cookie', `sb-access-token=${accessToken}; ${cookieOptions}`);
  headers.append('Set-Cookie', `sb-refresh-token=${refreshToken}; ${cookieOptions}`);
  headers.set('Location', '/admin');
  return new Response(null, { status: 302, headers });
}

// GET: PKCE flow — Supabase redirects with ?code=
export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return redirect('/?login=1&error=auth');
  }

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('Auth callback error:', error);
    void notifyError({ endpoint: 'auth/callback', message: error?.message ?? 'No session returned', context: 'PKCE code exchange' });
    return redirect('/?login=1&error=auth');
  }

  return setCookiesAndRedirect(data.session.access_token, data.session.refresh_token, url);
};

// POST: Implicit flow — client-side JS sends tokens from hash fragment
export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);

  try {
    const body = await request.json();
    const { access_token, refresh_token } = body;

    if (!access_token || !refresh_token) {
      return new Response(JSON.stringify({ error: 'Missing tokens' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the token is valid
    const supabase = createClient(
      import.meta.env.SUPABASE_URL,
      import.meta.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase.auth.getUser(access_token);
    if (error || !data.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cookieOptions = buildCookieOptions(url);
    const headers = new Headers();
    headers.append('Set-Cookie', `sb-access-token=${access_token}; ${cookieOptions}`);
    headers.append('Set-Cookie', `sb-refresh-token=${refresh_token}; ${cookieOptions}`);
    headers.set('Content-Type', 'application/json');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    void notifyError({ endpoint: 'auth/callback', message: String(err), context: 'Implicit token POST' });
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
