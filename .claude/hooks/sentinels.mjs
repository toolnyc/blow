/**
 * Sentinel state management for Blow agentic system.
 * Adapted from clubstack — simplified for Astro + Supabase stack.
 *
 * Sentinels are ephemeral files in .claude/state/ that enforce
 * development discipline (plan before build, verify before ship).
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '..', 'state');

const SENTINELS = {
  'epic-created':    { description: 'Epic plan exists',            maxAgeHours: null },
  'feature-active':  { description: 'Building a feature',          maxAgeHours: 48 },
  'verify-passed':   { description: 'Lint + build passed',         maxAgeHours: 2 },
  'session-active':  { description: 'Session in progress',         maxAgeHours: null },
};

function filePath(name) {
  return join(STATE_DIR, name);
}

/**
 * Check if a sentinel is set and not expired.
 * Returns { active: boolean, context?: string, age?: number }
 */
export function check(name, { maxAgeHours } = {}) {
  const fp = filePath(name);
  if (!existsSync(fp)) return { active: false };

  const raw = readFileSync(fp, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch { data = { context: raw.trim() }; }

  const age = data.setAt ? (Date.now() - new Date(data.setAt).getTime()) / 3600000 : null;
  const ttl = maxAgeHours ?? SENTINELS[name]?.maxAgeHours ?? null;

  if (ttl !== null && age !== null && age > ttl) {
    // Expired — clean up
    try { unlinkSync(fp); } catch {}
    return { active: false, expired: true, age };
  }

  return { active: true, context: data.context, age, data };
}

/**
 * Set a sentinel with optional context string.
 */
export function set(name, context = '') {
  const payload = {
    setAt: new Date().toISOString(),
    context,
  };
  writeFileSync(filePath(name), JSON.stringify(payload, null, 2));
}

/**
 * Clear a single sentinel.
 */
export function clear(name) {
  const fp = filePath(name);
  if (existsSync(fp)) {
    try { unlinkSync(fp); } catch {}
  }
}

/**
 * Clear all sentinels.
 */
export function clearAll() {
  if (!existsSync(STATE_DIR)) return;
  for (const f of readdirSync(STATE_DIR)) {
    try { unlinkSync(join(STATE_DIR, f)); } catch {}
  }
}

/**
 * List all active sentinels with their status.
 */
export function list() {
  const result = {};
  for (const [name, config] of Object.entries(SENTINELS)) {
    result[name] = { ...config, ...check(name) };
  }
  return result;
}
