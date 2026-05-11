// scripts/audit-sequence.mjs
// удит послідовності серій через Claude API
// апуск: node --env-file=.env.local scripts/audit-sequence.mjs

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// --- алаштування ---
const TEST_MODE = false      // якщо true — обробляє тільки перші 3 пари
const CACHE_DIR = 'scripts/audit-cache'
const REPORT_MD = 'scripts/audit-sequence-report.md'
const REPORT_JSON = 'scripts/audit-sequence-report.json'
const MODEL = 'claude-sonnet-4-5'

// --- еревірки env ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('FAIL: SUPABASE env not configured')
  process.exit(1)
}
if (!anthropicKey) {
  console.error('FAIL: ANTHROPIC_API_KEY not configured')
  process.exit(1)
}

// --- ніціалізація ---
const supabase = createClient(supabaseUrl, supabaseKey)
const anthropic = new Anthropic({ apiKey: anthropicKey })

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

// --- ромпт ---
const SYSTEM_PROMPT = `Ти редактор серіалу "алабони". Тобі дають дві сусідні серії (A — попередня, B — наступна). найди порушення наративної послідовності між ними.

Шукай чотири типи порушень:
1.  ССТЬ: подія в B суперечить тому що було в A (напр.: персонаж помер у A, але говорить у B).
2. Я С: персонаж у B знає або згадує подію з A, на якій його не було.
3. ССТЬ: фактичні розбіжності (літо в A → зима в B без переходу; кількість дітей; стан речей).
4. ТЯ  : серія B посилається на минулу подію ("як ми тоді на весіллі...", "відколи ван помер...") якої немає ні в A, ні в попередніх (умовно).

оверни С JSON у форматі:
{ "issues": [
  { "type": "logic|knowledge|contradiction|gap", "severity": "low|medium|high", "description": "коротко українською", "quote_b": "цитата з серії B (макс 100 символів)" }
] }

Якщо порушень немає: { "issues": [] }

:
- е фіксуй стилістику, граматику, опечатки. Тільки наративну послідовність.
- е вигадуй проблем. Якщо сумніваєшся — пропусти.
- Серіал має жанровий характер (комедія, мильна опера). еякі недомовки — нормально.`

// --- ункції ---
async function fetchAllEpisodes() {
  const { data, error } = await supabase
    .from('content')
    .select('slug, season_number, episode_number, text, title')
    .eq('type', 'balabony')
    .eq('status', 'published')
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true })

  if (error) throw error
  return data
}

function cacheKey(a, b) {
  return `${a.slug}__${b.slug}.json`
}

function loadCache(a, b) {
  const path = join(CACHE_DIR, cacheKey(a, b))
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch { return null }
  }
  return null
}

function saveCache(a, b, result) {
  const path = join(CACHE_DIR, cacheKey(a, b))
  writeFileSync(path, JSON.stringify(result, null, 2), 'utf-8')
}

async function auditPair(a, b) {
  const cached = loadCache(a, b)
  if (cached) {
    console.log(`  [cached] ${a.slug} → ${b.slug}`)
    return cached
  }

  const userPrompt = `СЯ A: ${a.slug} — "${a.title}"
${a.text}

---

СЯ B: ${b.slug} — "${b.title}"
${b.text}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let parsed
  try {
    // Спроба витягти JSON з відповіді (Claude іноді обгортає у ```json...```)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { issues: [], _raw: text }
  } catch (e) {
    parsed = { issues: [], _error: e.message, _raw: text }
  }

  saveCache(a, b, parsed)
  return parsed
}

// --- Main ---
console.log('=== Audit Sequence ===')
console.log(`Mode: ${TEST_MODE ? 'TEST (first 3 pairs)' : 'FULL'}`)
console.log(`Model: ${MODEL}`)
console.log('')

const episodes = await fetchAllEpisodes()
console.log(`Loaded ${episodes.length} episodes`)

const pairs = []
for (let i = 0; i < episodes.length - 1; i++) {
  pairs.push([episodes[i], episodes[i + 1]])
}
console.log(`Total pairs: ${pairs.length}`)

const toProcess = TEST_MODE ? pairs.slice(0, 3) : pairs
console.log(`Processing: ${toProcess.length}`)
console.log('')

const allResults = []
let totalIssues = 0

for (let i = 0; i < toProcess.length; i++) {
  const [a, b] = toProcess[i]
  console.log(`[${i + 1}/${toProcess.length}] ${a.slug} → ${b.slug}`)
  try {
    const result = await auditPair(a, b)
    const count = result.issues?.length || 0
    if (count > 0) {
      console.log(`  ⚠️  ${count} issue(s) found`)
      totalIssues += count
    }
    allResults.push({ a: a.slug, b: b.slug, ...result })
  } catch (e) {
    console.error(`  ERR: ${e.message}`)
    allResults.push({ a: a.slug, b: b.slug, error: e.message })
  }
}

// --- віт MD ---
let md = `# удит послідовності серій\n\n`
md += `генеровано: ${new Date().toISOString()}\n`
md += `одель: ${MODEL}\n`
md += `еревірено пар: ${toProcess.length}\n`
md += `найдено проблем: ${totalIssues}\n\n`
md += `---\n\n`

for (const r of allResults) {
  if (r.error) {
    md += `## ❌ ${r.a} → ${r.b}\nомилка: ${r.error}\n\n`
    continue
  }
  if (!r.issues || r.issues.length === 0) {
    md += `## ✅ ${r.a} → ${r.b}\nорушень не знайдено.\n\n`
    continue
  }
  md += `## ⚠️ ${r.a} → ${r.b}\n\n`
  for (const issue of r.issues) {
    md += `- **[${issue.severity || '?'}] ${issue.type || '?'}**: ${issue.description}\n`
    if (issue.quote_b) md += `  - итата з B: _"${issue.quote_b}"_\n`
  }
  md += `\n`
}

writeFileSync(REPORT_MD, md, 'utf-8')
writeFileSync(REPORT_JSON, JSON.stringify(allResults, null, 2), 'utf-8')

console.log('')
console.log('=== Done ===')
console.log(`Total issues found: ${totalIssues}`)
console.log(`Report: ${REPORT_MD}`)
console.log(`JSON:   ${REPORT_JSON}`)