/**
 * Session lifecycle — runs on SessionStart.
 *
 * Handles: resume detection, compact warning, dirty exit recovery.
 */

import { check, set } from './sentinels.mjs';
import { execSync } from 'child_process';

const event = process.env.CLAUDE_SESSION_EVENT || 'startup';

const messages = [];

// Check for dirty exit (session-active still set from previous session)
const session = check('session-active');
if (event === 'startup' && session.active) {
  const ageHrs = session.age ? Math.round(session.age * 10) / 10 : '?';
  messages.push(`DIRTY EXIT DETECTED — previous session ran ${ageHrs}h ago.`);
  messages.push(`Context: ${session.context || 'unknown'}`);

  // Show what happened since
  try {
    const log = execSync('git log --oneline -5 2>/dev/null', { encoding: 'utf8' }).trim();
    if (log) messages.push(`\nRecent commits:\n${log}`);
  } catch {}

  try {
    const status = execSync('git status --short 2>/dev/null', { encoding: 'utf8' }).trim();
    if (status) messages.push(`\nUncommitted changes:\n${status}`);
  } catch {}

  messages.push('\nConsider running /session-close to capture learnings from the previous session.');
}

// Compact event — context was compressed
if (event === 'compact') {
  messages.push('CONTEXT COMPRESSED — conversation history was truncated to fit context window.');
  messages.push('If you were mid-task, review your current state before continuing.');
}

// Resume event
if (event === 'resume') {
  if (session.active) {
    const ageHrs = session.age ? Math.round(session.age * 10) / 10 : '?';
    messages.push(`Resuming session (${ageHrs}h old). Context: ${session.context || 'unknown'}`);
  }
}

// Set fresh session-active sentinel
try {
  const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf8' }).trim();
  set('session-active', `branch: ${branch || 'detached'}`);
} catch {
  set('session-active', 'branch: unknown');
}

if (messages.length > 0) {
  console.log(JSON.stringify({ hookSpecificOutput: messages.join('\n') }));
}

process.exit(0);
