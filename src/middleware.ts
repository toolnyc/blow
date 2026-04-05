import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';

// Emails authorized to access /admin
const ADMIN_EMAILS: string[] = [
  'boss@blowme.nyc',
  'inyourdirtyears@gmail.com',
];

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

  // Verify the token and check authorization
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });
    return redirect('/?login=1');
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
