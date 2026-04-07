// Runtime env var validation
// IMPORTANT: Vite statically replaces import.meta.env.X at build time.
// Dynamic access like import.meta.env[key] does NOT work — it returns undefined.
// So we must map each key to its static reference here.

function getEnvValue(key: string): string {
  switch (key) {
    case 'STRIPE_SECRET_KEY': return import.meta.env.STRIPE_SECRET_KEY ?? '';
    case 'STRIPE_WEBHOOK_SECRET': return import.meta.env.STRIPE_WEBHOOK_SECRET ?? '';
    case 'SUPABASE_URL': return import.meta.env.SUPABASE_URL ?? '';
    case 'SUPABASE_ANON_KEY': return import.meta.env.SUPABASE_ANON_KEY ?? '';
    case 'RESEND_API_KEY': return import.meta.env.RESEND_API_KEY ?? '';
    case 'RESEND_AUDIENCE_ID': return import.meta.env.RESEND_AUDIENCE_ID ?? '';
    case 'RESEND_FROM_EMAIL': return import.meta.env.RESEND_FROM_EMAIL ?? '';
    case 'DISCORD_WEBHOOK_URL': return import.meta.env.DISCORD_WEBHOOK_URL ?? '';
    case 'CRON_SECRET': return import.meta.env.CRON_SECRET ?? '';
    default: return '';
  }
}

type EnvKey =
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
  | 'SUPABASE_URL'
  | 'SUPABASE_ANON_KEY'
  | 'RESEND_API_KEY'
  | 'RESEND_AUDIENCE_ID'
  | 'RESEND_FROM_EMAIL'
  | 'DISCORD_WEBHOOK_URL'
  | 'CRON_SECRET';

/** Returns the env value or throws with a clear message. */
export function requireEnv(key: EnvKey): string {
  const val = getEnvValue(key).trim();
  if (!val) {
    throw new Error(`Missing env var: ${key} — check Vercel environment variables`);
  }
  return val;
}
