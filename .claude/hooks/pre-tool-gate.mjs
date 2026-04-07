/**
 * Pre-tool gate — blocks risky operations without proper sentinel state.
 *
 * Gate 1: Block new src/ files without feature-active sentinel
 * Gate 2: Block new migration files without feature-active sentinel
 * Gate 3: Warn on git commit/PR without verify-passed sentinel
 * Gate 4: Block vercel env add/rm on protected keys (prevent accidental overwrites)
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { check } = await import(pathToFileURL(join(__dirname, 'sentinels.mjs')).href);

const toolName  = process.env.CLAUDE_TOOL_NAME  || '';
const toolInput = process.env.CLAUDE_TOOL_INPUT || '{}';

let input;
try { input = JSON.parse(toolInput); } catch { input = {}; }

const filePath = input.file_path || input.command || '';
const featureActive = check('feature-active');
const verifyPassed  = check('verify-passed');

// Gate 1: New src/ files require feature-active
if (
  (toolName === 'Write') &&
  filePath.includes('/src/') &&
  !featureActive.active
) {
  const msg = [
    'BLOCKED: Creating new src/ files requires an active feature.',
    '',
    'Run /epic first to plan, then /feature to start building.',
    'Quick fixes to existing files (Edit tool) are not blocked.',
  ].join('\n');

  console.log(JSON.stringify({ hookSpecificOutput: msg }));
  process.exit(2);
}

// Gate 2: New migration files require feature-active
if (
  (toolName === 'Write') &&
  filePath.includes('/supabase/') &&
  filePath.endsWith('.sql') &&
  !featureActive.active
) {
  const msg = [
    'BLOCKED: Creating migration files requires an active feature.',
    '',
    'Run /epic first to plan, then /feature to start building.',
  ].join('\n');

  console.log(JSON.stringify({ hookSpecificOutput: msg }));
  process.exit(2);
}

// Gate 3: Block vercel env add/rm on protected keys
const PROTECTED_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'DATABASE_URL',
  'RESEND_API_KEY',
];

if (
  toolName === 'Bash' &&
  typeof filePath === 'string' &&
  /vercel\s+env\s+(add|rm|remove)\b/.test(filePath)
) {
  const hitKey = PROTECTED_ENV_KEYS.find(k => filePath.includes(k));
  if (hitKey) {
    const msg = [
      `BLOCKED: "${hitKey}" is a protected env var.`,
      '',
      'These keys were already configured and overwriting them previously broke Stripe.',
      'If you genuinely need to change this value:',
      '  1. Ask Pete to do it manually via the Vercel dashboard',
      '  2. Or have Pete run the command directly with ! vercel env ...',
      '',
      'Claude should NEVER add/remove protected env vars via CLI.',
    ].join('\n');

    console.log(JSON.stringify({ hookSpecificOutput: msg }));
    process.exit(2);
  }
}

// Gate 4: Warn on git commit without verify-passed
if (
  toolName === 'Bash' &&
  typeof filePath === 'string' &&
  (filePath.includes('git commit') || filePath.includes('git push') || filePath.includes('gh pr create')) &&
  !verifyPassed.active
) {
  const msg = [
    'WARNING: Committing without running /verify.',
    '',
    'Run /verify first (pnpm build) to catch errors before shipping.',
    'Proceeding anyway — this is a soft warning.',
  ].join('\n');

  console.log(JSON.stringify({ hookSpecificOutput: msg }));
  // Soft warn — don't block
  process.exit(0);
}

process.exit(0);
