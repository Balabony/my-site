// Regenerates cover for a given series ID without needing the dev server.
// Replicates the full /api/generate-cover pipeline:
//   Claude Haiku → Replicate flux-kontext-pro → golden frame → Supabase upload → DB update
// Usage: node --env-file=.env.local scripts/regen-cover.mjs <seriesId>
//   e.g. node --env-file=.env.local scripts/regen-cover.mjs s3e04

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERIES_ID = process.argv[2]
if (!SERIES_ID) { console.error('Usage: node regen-cover.mjs <seriesId>'); process.exit(1) }

const TOKEN        = process.env.REPLICATE_API_TOKEN
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!TOKEN)        { console.error('REPLICATE_API_TOKEN not set'); process.exit(1) }

const POSE_FILES = [
  'panas-walking', 'panas-sitting', 'panas-thinking', 'panas-back',
  'panas-crouching', 'panas-reaching', 'panas-lying', 'panas-running',
  'panas-laughing', 'panas-reading', 'panas-window-night', 'panas-digging',
  'panas-surprised', 'panas-praying', 'panas-arguing', 'panas-sleeping',
  'panas-notebook', 'panas-quarrel', 'panas-tree', 'panas-chickens',
  'panas-neighbor', 'panas-holding', 'panas-packages',
]

const GOLDEN_HOUR_LIGHTING = 'warm golden hour lighting, soft directional sunlight from low angle, deep amber and gold tones, long soft shadows, cinematic atmosphere, nostalgic mood, slight haze, rich warm colors, evening glow, painterly quality'

const NEGATIVE = 'text, letters, words, captions, logos, watermarks, signatures, typography, written words, BALABONI, БАЛАБОНИ, titles, subtitles, label, writing, font, alphabet, numbers, digits, inscription, cyrillic letters, latin letters, foreign script, gibberish, ornamental text, decorative lettering, handwriting, graffiti, newspaper, poster text, overlaid text, burned-in text, banner, headline'

// ── analyzeScene ─────────────────────────────────────────────────────────────
async function analyzeScene(title, description) {
  const fallbackPose  = POSE_FILES[Math.floor(Math.random() * POSE_FILES.length)] + '.jpg'
  const fallbackScene = description?.trim() || title
  if (!ANTHROPIC_KEY) return { scene: fallbackScene, poseFile: fallbackPose, keyObject: null, objectOwner: null }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: `Проаналізуй опис серії та поверни JSON з трьома полями.

ПОЗИ і коли використовувати:
- panas-walking: іде кудись, подорож, прогулянка
- panas-sitting: сидить, відпочиває, розмірковує спокійно
- panas-thinking: думає, вирішує задачу, здивований ситуацією
- panas-back: дивиться вдалину, чекає, спостерігає, самотність
- panas-crouching: щось розглядає на землі, городні роботи, пошук
- panas-reaching: тягнеться до чогось високого, дістає з полиці
- panas-lying: відпочиває на природі, дивиться в небо, мріє
- panas-running: тікає, женеться, поспішає, щось термінове
- panas-laughing: радість, кумедна ситуація, гумор, успіх
- panas-reading: читає, вивчає щось, вечірня сцена
- panas-window-night: нічна сцена, безсоння, очікування, туга
- panas-digging: копає, садить, ховає, знаходить у землі
- panas-surprised: шок, несподівана подія, відкриття, переляк
- panas-praying: молитва, вдячність, горе, духовний момент
- panas-arguing: конфлікт, суперечка, відстоює позицію
- panas-sleeping: втомився, дрімає, сни, ліниво
- panas-notebook: пише, планує, винаходить, веде записи
- panas-quarrel: гаряча сварка, злість, скандал
- panas-tree: пригода, ховається, застряг, дитячий момент
- panas-chickens: фермерський побут, тварини, щоденна рутина
- panas-neighbor: плітки, розмова через тин, сусідська комунікація
- panas-holding: знахідка, розглядає об'єкт, отримав подарунок
- panas-packages: шопінг, несе речі, переїзд, повернувся з міста

КЛЮЧОВИЙ ПРЕДМЕТ (keyObject):
- Один конкретний предмет, який є символом або рушієм сюжету цієї серії
- Має бути згаданий або підрозуміватись у тексті (не вигадуй)
- Якщо предмет має відкритий стан (блокнот, книга, шкатулка, скриня) — опиши у відкритому вигляді
- 1-5 слів, якщо очевидного предмета немає — null

ВЛАСНИК ПРЕДМЕТА (objectOwner):
- "self"  — предмет тримає або використовує сам дід Панас
- "other" — предмет належить іншому персонажу серії
- null    — якщо keyObject є null

Поверни ТІЛЬКИ валідний JSON без пояснень:
{"scene":"<одне речення до 15 слів: конкретна дія + ракурс + місце (стара хата, городець, подвір'я, садок, хлів, сіни)>","pose":"<назва без .jpg>","keyObject":"<опис предмета або null>","objectOwner":"self" або "other" або null}

Назва серії: ${title}
Опис: ${description}` }],
    })
    const raw    = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''))
    const poseKey  = String(parsed.pose || '').replace(/\.jpg$/, '')
    const poseFile = POSE_FILES.includes(poseKey) ? poseKey + '.jpg' : fallbackPose
    const scene    = String(parsed.scene || '').trim() || fallbackScene
    const keyObject = parsed.keyObject && parsed.keyObject !== 'null' ? String(parsed.keyObject).trim() : null
    const objectOwner = keyObject ? (parsed.objectOwner === 'other' ? 'other' : 'self') : null
    return { scene, poseFile, keyObject, objectOwner }
  } catch {
    return { scene: fallbackScene, poseFile: fallbackPose, keyObject: null, objectOwner: null }
  }
}

// ── Replicate ─────────────────────────────────────────────────────────────────
async function callReplicate(base64Image, prompt, seed) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      process.stdout.write(`retry ${attempt}/3 ... `)
      await new Promise(r => setTimeout(r, 30000))
    }
    const res = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        body: JSON.stringify({ input: { prompt, negative_prompt: NEGATIVE, input_image: base64Image, seed, guidance_scale: 7 } }),
      }
    )
    if (res.status === 429) {
      const { retry_after = 15 } = await res.json().catch(() => ({}))
      process.stdout.write(`rate-limited ${retry_after + 5}s ... `)
      await new Promise(r => setTimeout(r, (retry_after + 5) * 1000))
      attempt--; continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    let p = await res.json()
    for (let i = 0; i < 40 && !p.output && p.status !== 'failed'; i++) {
      await new Promise(r => setTimeout(r, 3000))
      p = await (await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      })).json()
    }
    if (p.output) return Array.isArray(p.output) ? p.output[0] : p.output
    process.stdout.write(`failed (${p.error || 'unknown'}) ... `)
  }
  throw new Error('gave up after 3 attempts')
}

// ── Golden frame ──────────────────────────────────────────────────────────────
async function applyGoldenFrame(inputBuf) {
  return sharp(inputBuf)
    .extend({ top: 8, left: 8, right: 8, bottom: 8, background: { r: 0xef, g: 0x9f, b: 0x27 } })
    .extend({ top: 70, left: 70, right: 70, bottom: 70, background: { r: 0xf2, g: 0xef, b: 0xf8 } })
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ── Main ──────────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

console.log(`Regenerating cover for ${SERIES_ID}...\n`)

const { data: series, error: fetchErr } = await supabase
  .from('series').select('title, description').eq('id', SERIES_ID).single()
if (fetchErr || !series) { console.error('Series not found:', fetchErr); process.exit(1) }

console.log(`Title:       ${series.title}`)
console.log(`Description: ${series.description?.slice(0, 80)}...\n`)

process.stdout.write('Claude Haiku → scene analysis ... ')
const { scene, poseFile, keyObject, objectOwner } = await analyzeScene(series.title, series.description)
console.log('OK')
console.log(`  pose:     ${poseFile}`)
console.log(`  scene:    ${scene}`)
console.log(`  object:   ${keyObject} (${objectOwner})\n`)

const imagePath   = join(ROOT, 'public', 'panas-poses', poseFile)
const base64Image = `data:image/jpeg;base64,${readFileSync(imagePath).toString('base64')}`
const seed        = Math.floor(Math.random() * 2_000_000)

let objectPrefix = ''
if (keyObject && objectOwner === 'other') {
  objectPrefix = `${keyObject} as a small detail at edge of frame, partially visible, hinting at another presence, `
} else if (keyObject) {
  objectPrefix = `${keyObject} clearly visible in his hands or directly beside him, `
}
const prompt = `${objectPrefix}${scene}, ${GOLDEN_HOUR_LIGHTING}, seed_${seed}`
console.log(`Prompt: ${prompt}\n`)

process.stdout.write('Replicate (flux-kontext-pro) ... ')
const generatedUrl = await callReplicate(base64Image, prompt, seed)
console.log('OK')

process.stdout.write('Downloading ... ')
const rawBuf = Buffer.from(await fetch(generatedUrl).then(r => r.arrayBuffer()))
console.log('OK')

process.stdout.write('Applying golden frame ... ')
const finalBuf = await applyGoldenFrame(rawBuf)
console.log('OK')

const { width, height } = await sharp(finalBuf).metadata()
console.log(`  dimensions: ${width}×${height}\n`)

process.stdout.write('Uploading to Supabase ... ')
const fileName = `${SERIES_ID}-${Date.now()}.jpg`
const { error: uploadErr } = await supabase.storage.from('covers').upload(fileName, finalBuf, { contentType: 'image/jpeg', upsert: true })
if (uploadErr) { console.log('FAILED'); console.error(uploadErr); process.exit(1) }
const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(fileName)
console.log('OK')

process.stdout.write('Updating DB cover_url ... ')
const { error: updateErr } = await supabase.from('series').update({ cover_url: publicUrl }).eq('id', SERIES_ID)
if (updateErr) { console.log('FAILED'); console.error(updateErr); process.exit(1) }
console.log('OK')

console.log(`\nDone. Cover URL:\n${publicUrl}`)
