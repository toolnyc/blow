---
name: verify
description: Run full build verification
requires: nothing
sets: verify-passed
---

# /verify — Build verification

## Procedure

1. Clear `verify-passed` sentinel
2. Run `pnpm build`
   - Fix all TypeScript errors
   - Fix all Astro build errors
3. If fixes were made, re-run `pnpm build` to confirm clean
4. When build passes clean: set `verify-passed` sentinel
5. Output what was fixed (if anything), or "Clean build."

## Rules

- Never skip the build step
- Never suppress TypeScript errors with `any` or `@ts-ignore`
- A clean build is the minimum bar for shipping
