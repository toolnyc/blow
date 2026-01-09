# CLAUDE.md

This project is for Blow, a DIY-party series in New York. The goal of the site is:
- Capture emails for marketing
- Display the blow brand

## Stack and Tools
- Vercel for deployment and media storage
- Supabase for database
- Resend for email client

## Build Commands

- `pnpm dev` - Start development server at localhost:4321
- `pnpm build` - Build production site to `./dist/`
- `pnpm preview` - Preview production build locally

## Architecture

This is an Astro static site. Pages live in `src/pages/` and are file-based routed (e.g., `index.astro` → `/`). Static assets are in `public/`.

TypeScript is configured with Astro's strict preset.
