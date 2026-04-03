/**
 * Pre-tool gate — blocks risky operations without proper sentinel state.
 *
 * Gate 1: Block new src/ files without feature-active sentinel
 * Gate 2: Block new migration files without feature-active sentinel
 * Gate 3: Warn on git commit/PR without verify-passed sentinel
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

// Gate 3: Warn on git commit without verify-passed
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
