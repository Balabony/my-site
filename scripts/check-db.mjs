// Check DB structure: content table, old tables, ENUMs
// Usage: node --env-file=.env.local scripts/check-db.mjs

import pg from 'pg'
const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

async function q(sql, params) {
  const res = await client.query(sql, params)
  return res.rows
}

// ── 1. content table columns ──────────────────────────────────────────────────
console.log('\n═══ TABLE: content ═══')
const cols = await q(`
  SELECT column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'content'
  ORDER BY ordinal_position
`)
if (!cols.length) {
  console.log('Table "content" does NOT exist (or has no columns).')
} else {
  const w = [28, 18, 18, 10, 28]
  console.log(
    'column_name'.padEnd(w[0]) + 'data_type'.padEnd(w[1]) +
    'udt_name'.padEnd(w[2]) + 'nullable'.padEnd(w[3]) + 'default'
  )
  console.log('─'.repeat(w.reduce((a,b)=>a+b,0)))
  for (const c of cols) {
    console.log(
      c.column_name.padEnd(w[0]) +
      c.data_type.padEnd(w[1]) +
      (c.udt_name ?? '').padEnd(w[2]) +
      c.is_nullable.padEnd(w[3]) +
      (c.column_default ?? '').toString().slice(0, 40)
    )
  }
}

// ── 2. tables: content / series / stories / episodes ─────────────────────────
console.log('\n═══ TABLES (content|series|stories|episodes) ═══')
const tables = await q(`
  SELECT table_name, table_type
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('content','series','stories','episodes')
  ORDER BY table_name
`)
if (!tables.length) {
  console.log('None of these tables found.')
} else {
  for (const t of tables) console.log(`  ${t.table_name.padEnd(20)} ${t.table_type}`)
}

// ── 3. all USER-DEFINED type columns (ENUMs) ──────────────────────────────────
console.log('\n═══ All ENUM columns in public schema ═══')
const enums = await q(`
  SELECT table_name, column_name, udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type = 'USER-DEFINED'
  ORDER BY table_name, column_name
`)
if (!enums.length) {
  console.log('No ENUM columns found.')
} else {
  for (const e of enums) {
    console.log(`  ${e.table_name}.${e.column_name}  →  ENUM(${e.udt_name})`)
  }
}

// ── 4. ENUM values ────────────────────────────────────────────────────────────
if (enums.length) {
  const enumNames = [...new Set(enums.map(e => e.udt_name))]
  console.log('\n═══ ENUM values ═══')
  const vals = await q(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = ANY($1)
    ORDER BY t.typname, e.enumsortorder
  `, [enumNames])
  let last = ''
  for (const v of vals) {
    if (v.typname !== last) { console.log(`\n  ${v.typname}:`); last = v.typname }
    console.log(`    • ${v.enumlabel}`)
  }
}

await client.end()
console.log('')
