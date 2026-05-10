// scripts/generate-clean-reference.mjs
// Generates 4 clean reference photos of Panas WITHOUT book/notebook
// Usage: node --env-file=.env.local scripts/generate-clean-reference.mjs

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = process.env.REPLICATE_API_TOKEN
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const base64Image = 'data:image/jpeg;base64,' +
  readFileSync(join(ROOT, 'public', 'dad-panas.jpg')).toString('base64')

const POSITIVE = `Same elderly Ukrainian man portrait, gray hair and full white-gray beard, warm kind face with weathered character lines, gentle subtle smile. Wearing traditional embroidered linen shirt with red and black geometric ornament on collar, black wool vest over shirt, small wooden cross necklace pendant. Empty hands relaxed at sides, arms hanging naturally, absolutely nothing held in hands. Plain light beige seamless studio backdrop, completely empty clean background. Soft even diffused indoor studio daylight, no harsh shadows, no warm tones. Waist-up frontal portrait, facing camera directly, looking at viewer. Photorealistic, sharp focus on face, professional reference photo style.`

const NEGATIVE = `book, notebook, journal, diary, papers, document, pen, pencil, holding, clasping, hands together holding object, flowers, flower field, meadow, garden, trees, forest, outdoor, landscape, golden hour, sunset, dramatic lighting, warm orange light, blurred background, hat, glasses, sunglasses, props, furniture, fence, building, wall texture`

const SEEDS = [1001, 2002, 3003, 4004]

async function callReplicate(seed, attempt = 1) {
  const res = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: POSITIVE,
          negative_prompt: NEGATIVE,
          input_image: base64Image,
          guidance_scale: 7,
          seed,
        },
      }),
    }
  )
  if (res.status === 429) {
    const { retry_after = 15 } = await res.json().catch(() => ({}))
    process.stdout.write(`rate-limited, waiting ${retry_after + 5}s ... `)
    await new Promise(r => setTimeout(r, (retry_after + 5) * 1000))
    return callReplicate(seed, attempt + 1)
  }
  if (!res.ok) throw new Error(`Replicate error: ${await res.text()}`)
  let p = await res.json()
  for (let i = 0; i < 40 && !p.output && p.status !== 'failed'; i++) {
    await new Promise(r => setTimeout(r, 3000))
    p = await (await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })).json()
  }
  if (p.status === 'failed' || !p.output) throw new Error(`Generation failed: ${p.error || 'unknown'}`)
  return Array.isArray(p.output) ? p.output[0] : p.output
}

if (!TOKEN) { console.error('REPLICATE_API_TOKEN not set'); process.exit(1) }

console.log('Generating 4 clean reference photos...\n')

for (let i = 0; i < SEEDS.length; i++) {
  const seed = SEEDS[i]
  const num = i + 1
  process.stdout.write(`  [${num}/4] seed ${seed} ... `)
  try {
    const url = await callReplicate(seed)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())

    const localPath = join(ROOT, 'public', `dad-panas-clean-${num}.jpg`)
    writeFileSync(localPath, buf)

    const fileName = `reference-clean-${seed}.jpg`
    await supabase.storage.from('covers').upload(fileName, buf, {
      contentType: 'image/jpeg', upsert: true,
    })
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(fileName)

    console.log(`OK\n     local:  public/dad-panas-clean-${num}.jpg\n     remote: ${publicUrl}`)
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
  }
}

console.log('\nDone.')
