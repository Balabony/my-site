import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const path = resolve(process.cwd(), '.env.local')
    const lines = readFileSync(path, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    console.log('No .env.local found, using process.env')
  }
}

loadEnv()

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const CATEGORIES = ['З життя','Містика','Любов','Воєнні','Історичні','Родинні','Гумор','Детектив','Психологічні','Дитячі']

function calcDuration(text) {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

async function classifyCategory(text, title) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      messages: [{ role: 'user', content:
        `Обери ОДНУ категорію зі списку, яка найкраще описує цю історію. Поверни ТІЛЬКИ назву категорії без пояснень.\nСписок: ${CATEGORIES.join(', ')}\nТекст:\n${text.slice(0, 2000)}`
      }],
    })
    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const result = CATEGORIES.includes(answer) ? answer : 'З життя'
    return result
  } catch (err) {
    console.error(`  ⚠ Claude error for "${title}": ${err.message} → fallback "З життя"`)
    return 'З життя'
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('Завантажую всі схвалені історії...')

  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, title, text, duration_minutes, category')
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  console.log(`Знайдено ${stories.length} схвалених історій\n`)

  // ── 1. Тривалість (без API, швидко) ────────────────────────────────────────
  const needDuration = stories.filter(s => s.duration_minutes == null)
  console.log(`Тривалість: оновлюю ${needDuration.length} із ${stories.length} записів...`)

  for (const story of needDuration) {
    const duration_minutes = calcDuration(story.text)
    const { error: upErr } = await supabase
      .from('stories')
      .update({ duration_minutes })
      .eq('id', story.id)

    if (upErr) {
      console.error(`  ✗ ${story.title}: ${upErr.message}`)
    } else {
      console.log(`  ✓ "${story.title}" → ${duration_minutes} хв`)
    }
  }

  if (needDuration.length === 0) console.log('  Всі записи вже мають тривалість.')
  console.log()

  // ── 2. Категорія (з Claude API, з паузою) ──────────────────────────────────
  const needCategory = stories.filter(s => !s.category)
  console.log(`Категорія: класифікую ${needCategory.length} із ${stories.length} записів через Claude...\n`)

  for (let i = 0; i < needCategory.length; i++) {
    const story = needCategory[i]
    console.log(`Story ${i + 1}/${needCategory.length}: "${story.title}"`)

    const category = await classifyCategory(story.text, story.title)
    console.log(`  → ${category}`)

    const { error: upErr } = await supabase
      .from('stories')
      .update({ category })
      .eq('id', story.id)

    if (upErr) {
      console.error(`  ✗ Помилка запису: ${upErr.message}`)
    }

    if (i < needCategory.length - 1) {
      await sleep(1000)
    }
  }

  if (needCategory.length === 0) console.log('  Всі записи вже мають категорію.')

  console.log('\nГотово!')
}

main()
