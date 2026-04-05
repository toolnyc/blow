import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async () => {
  const expiredCookie = [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');

  const headers = new Headers();
  headers.append('Set-Cookie', `sb-access-token=; ${expiredCookie}`);
  headers.append('Set-Cookie', `sb-refresh-token=; ${expiredCookie}`);
  headers.set('Location', '/');

  return new Response(null, {
    status: 302,
    headers,
  });
};
