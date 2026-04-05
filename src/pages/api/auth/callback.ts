import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

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
    return redirect('/?login=1&error=auth');
  }

  const cookieOptions = [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
  ].join('; ');

  const headers = new Headers();
  headers.append('Set-Cookie', `sb-access-token=${data.session.access_token}; ${cookieOptions}`);
  headers.append('Set-Cookie', `sb-refresh-token=${data.session.refresh_token}; ${cookieOptions}`);
  headers.set('Location', '/admin');

  return new Response(null, {
    status: 302,
    headers,
  });
};
