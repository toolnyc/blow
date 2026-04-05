// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:4321',
  output: 'static',
  adapter: vercel(),
  vite: {
    ssr: {
      noExternal: ['@supabase/supabase-js', 'tslib'],
    },
    optimizeDeps: {
      include: ['tslib'],
    },
  },
});
