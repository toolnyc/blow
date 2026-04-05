import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';

export const onRequest = defineMiddleware(async ({ request, redirect, cookies }, next) => {
  const url = new URL(request.url);

  // Only gate /admin routes
  if (!url.pathname.startsWith('/admin')) {
    return next();
  }

  const accessToken = cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return redirect('/?login=1');
  }

  // Verify the token by calling getUser
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    // Token invalid or expired — clear cookies and redirect
    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });
    return redirect('/?login=1');
  }

  return next();
});
