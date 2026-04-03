/**
 * Stop hook — reminds to run /session-close if there's uncommitted work.
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { check } = await import(pathToFileURL(join(__dirname, 'sentinels.mjs')).href);

const messages = [];

// Check for uncommitted source changes
let dirtyCount = 0;
try {
  const status = execSync('git status --short -- src/ supabase/ 2>/dev/null', { encoding: 'utf8' }).trim();
  dirtyCount = status ? status.split('\n').length : 0;
} catch {}

// Check for commits made this session
let recentCommits = 0;
try {
  const log = execSync('git log --oneline --since="2 hours ago" 2>/dev/null', { encoding: 'utf8' }).trim();
  recentCommits = log ? log.split('\n').length : 0;
} catch {}

const session = check('session-active');
const sessionAge = session.age || 0;

if (dirtyCount >= 3 || recentCommits > 0 || sessionAge > 1) {
  messages.push('SESSION ENDING — consider running /session-close to:');
  if (dirtyCount >= 3) messages.push(`  - Review ${dirtyCount} uncommitted source files`);
  if (recentCommits > 0) messages.push(`  - Capture learnings from ${recentCommits} commit(s)`);
  messages.push('  - Clear sentinel state');
}

if (messages.length > 0) {
  console.log(JSON.stringify({ stopReason: messages.join('\n') }));
}

process.exit(0);
