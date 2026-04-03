/**
 * Post-tool schema linter — validates SQL migration files on write.
 *
 * Checks:
 * 1. RLS enabled on new tables
 * 2. No dangerous write policies (USING (true) on INSERT/UPDATE/DELETE)
 * 3. Primary key convention (id uuid)
 * 4. Timestamp columns (created_at, updated_at)
 */

const toolName  = process.env.CLAUDE_TOOL_NAME  || '';
const toolInput = process.env.CLAUDE_TOOL_INPUT || '{}';

let input;
try { input = JSON.parse(toolInput); } catch { input = {}; }

const filePath = input.file_path || '';

// Only lint SQL files in supabase/
if (!filePath.includes('/supabase/') || !filePath.endsWith('.sql')) {
  process.exit(0);
}

import { readFileSync } from 'fs';

let sql;
try { sql = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

const errors = [];
const warnings = [];

const sqlUpper = sql.toUpperCase();

// Check 1: CREATE TABLE should have RLS
const tableMatches = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/gi) || [];
for (const match of tableMatches) {
  const tableName = match.replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?/i, '').trim();
  // Check if RLS is explicitly enabled or disabled in the same file
  const rlsPattern = new RegExp(`alter\\s+table\\s+${tableName}\\s+(enable|disable)\\s+row\\s+level\\s+security`, 'i');
  const rlsMatch = sql.match(rlsPattern);
  if (!rlsMatch) {
    errors.push(`Table "${tableName}": missing RLS statement. Add ALTER TABLE ${tableName} ENABLE/DISABLE ROW LEVEL SECURITY.`);
  }
}

// Check 2: Dangerous write policies
if (/USING\s*\(\s*true\s*\)/i.test(sql) && /FOR\s+(INSERT|UPDATE|DELETE)/i.test(sql)) {
  warnings.push('Potentially dangerous RLS policy: USING (true) on write operation.');
}

// Check 3: Primary key convention
for (const match of tableMatches) {
  const tableName = match.replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?/i, '').trim();
  if (!sql.includes('id uuid') && !sql.includes('id UUID')) {
    warnings.push(`Table "${tableName}": consider using "id uuid primary key default gen_random_uuid()" convention.`);
    break; // One warning is enough
  }
}

// Check 4: Timestamp columns
if (tableMatches.length > 0) {
  if (!sqlUpper.includes('CREATED_AT')) {
    warnings.push('Missing created_at column. Convention: created_at timestamptz default now().');
  }
}

const messages = [];
if (errors.length > 0) {
  messages.push('SCHEMA ERRORS:');
  errors.forEach(e => messages.push(`  ✗ ${e}`));
}
if (warnings.length > 0) {
  messages.push('SCHEMA WARNINGS:');
  warnings.forEach(w => messages.push(`  ⚠ ${w}`));
}

if (messages.length > 0) {
  console.log(JSON.stringify({ hookSpecificOutput: messages.join('\n') }));
}

process.exit(0);
