import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from './lib/auth';

export const onRequest = defineMiddleware(async ({ request, redirect, cookies }, next) => {
  const url = new URL(request.url);

  // Only gate /admin routes
  if (!url.pathname.startsWith('/admin')) {
    return next();
  }

  // Dev bypass: skip auth entirely in local development
  if (import.meta.env.DEV) {
    return next();
  }

  const accessToken = cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return redirect('/?login=1');
  }

  // Verify the token and check authorization
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  let { data, error } = await supabase.auth.getUser(accessToken);

  // If access token expired, try refreshing with the refresh token
  if (error || !data.user) {
    const refreshToken = cookies.get('sb-refresh-token')?.value;
    if (refreshToken) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (!refreshError && refreshData.session) {
        // Update cookies with new tokens
        const isSecure = request.url.startsWith('https');
        const cookieOpts = { path: '/', httpOnly: true, secure: isSecure, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7 };
        cookies.set('sb-access-token', refreshData.session.access_token, cookieOpts);
        cookies.set('sb-refresh-token', refreshData.session.refresh_token, cookieOpts);
        data = { user: refreshData.user };
        error = null;
      }
    }

    if (error || !data.user) {
      cookies.delete('sb-access-token', { path: '/' });
      cookies.delete('sb-refresh-token', { path: '/' });
      return redirect('/?login=1');
    }
  }

  // Authorization: only allowed emails can access admin
  const userEmail = data.user.email?.toLowerCase();
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });
    return redirect('/?login=1&error=forbidden');
  }

  return next();
});
