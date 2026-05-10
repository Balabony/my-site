#!/usr/bin/env node
/**
 * Run analytics tables migration against Supabase.
 * Tries three methods in order:
 *   1. pg-meta REST API (works with service role key on some Supabase plans)
 *   2. Direct PostgreSQL via pg + DATABASE_URL
 *   3. Prints manual SQL if both fail
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Load .env.local manually (no dotenv dependency needed)
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    raw.split('\n').forEach(line => {
      const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] ??= m[2].trim()
    })
  } catch { /* no .env.local */ }
}
loadEnv()

const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const DATABASE_URL       = process.env.DATABASE_URL

const SQL = readFileSync(join(ROOT, 'supabase', 'migrations', '001_analytics.sql'), 'utf8')

// ─── Method 1: pg-meta REST endpoint ─────────────────────────────────────────
async function tryPgMeta() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return false
  const url = `${SUPABASE_URL}/pg-meta/v1/query`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'x-client-info': 'supabase-js/2',
      },
      body: JSON.stringify({ query: SQL }),
    })
    const body = await res.text()
    if (res.ok) return true
    // 401/403 → not allowed on this plan; other errors → try next method
    if (res.status === 401 || res.status === 403) return false
    console.log(`  pg-meta response ${res.status}: ${body.slice(0, 120)}`)
    return false
  } catch { return false }
}

// ─── Method 2: direct PostgreSQL via pg ──────────────────────────────────────
async function tryPg() {
  if (!DATABASE_URL) return false
  try {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await pool.query(SQL)
    await pool.end()
    return true
  } catch (err) {
    console.log(`  pg error: ${err.message}`)
    return false
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
console.log('🔄  Running analytics migration…\n')

console.log('  Method 1: pg-meta REST API…')
if (await tryPgMeta()) {
  console.log('✅  Done via pg-meta API!')
  printSuccess(); process.exit(0)
}

console.log('  Method 2: direct PostgreSQL…')
if (await tryPg()) {
  console.log('✅  Done via direct PostgreSQL!')
  printSuccess(); process.exit(0)
}

// ─── Fallback: print manual instructions ─────────────────────────────────────
console.log('\n⚠️  Could not run migration automatically.\n')
console.log('Run the SQL manually in the Supabase SQL Editor:')
console.log(`👉  https://supabase.com/dashboard/project/swwzsrtbfjsdsmpgfpsk/sql/new\n`)
console.log('─────────────────── SQL (copy below) ───────────────────')
console.log(SQL)
console.log('─────────────────────────────────────────────────────────')
console.log('\nOR add DATABASE_URL to .env.local and re-run this script:')
console.log('  Supabase Dashboard → Settings → Database → Connection string → URI')
console.log('  DATABASE_URL=postgresql://postgres.[ref]:[password]@...')

function printSuccess() {
  console.log('\nTables created:')
  console.log('  ✓ survey_responses')
  console.log('  ✓ page_views')
  console.log('  ✓ story_events')
  console.log('  ✓ user_sessions')
}
