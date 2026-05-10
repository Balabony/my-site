// Generates reference pose library for Grandpa Panas
// Output: public/panas-poses/ directory with 23 pose images
// Usage: node --env-file=.env.local scripts/generate-panas-poses.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const OUT_DIR = join(ROOT, 'public', 'panas-poses')
const TOKEN = process.env.REPLICATE_API_TOKEN

if (!TOKEN) { console.error('REPLICATE_API_TOKEN not set'); process.exit(1) }

const imagePath = join(ROOT, 'public', 'dad-panas.jpg')
const base64Image = `data:image/jpeg;base64,${readFileSync(imagePath).toString('base64')}`

const NEGATIVE_CLEAN = 'book, notebook, journal, diary, papers, document, pen, pencil, holding object, clasping object, golden hour, sunset, blurred background'
const NEGATIVE_BASE  = 'golden hour, sunset, blurred background'

const POSES = [
  // ── 6 base poses (regenerated with clean reference) ──────────────────────
  {
    file: 'panas-walking.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard walking along a dirt path, full body side view, natural stride, arms swinging freely, empty hands, no objects, nothing held, warm daylight, village background',
  },
  {
    file: 'panas-sitting.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard sitting on a wooden bench, leaning forward with elbows on knees, hands loosely clasped together empty, three-quarter view, relaxed, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-thinking.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard standing thoughtfully, one hand raised to chin in thinking pose, other arm crossed, puzzled expression, slight side angle, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-back.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard seen from behind, looking at distant horizon, full body rear view, hands clasped loosely behind back, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-crouching.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard crouching down low to inspect something on the ground, three-quarter front view, low angle, hands resting on knees, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-reaching.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard reaching up with one hand toward a high shelf or tree branch, side view, arm fully extended upward, other arm at side, empty hands, no objects, nothing held',
  },
  // ── 17 additional poses ───────────────────────────────────────────────────
  {
    file: 'panas-lying.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard lying on his back in grass, looking up at the sky, top-down view, arms relaxed at sides, empty hands, no objects, nothing held, peaceful expression',
  },
  {
    file: 'panas-running.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard running away, full body rear view, leaning forward, arms pumping, empty hands, no objects, nothing held, dynamic motion blur on legs',
  },
  {
    file: 'panas-laughing.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard sitting and laughing loudly, slapping his knee with one hand, mouth wide open, three-quarter view, eyes crinkled, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-reading.jpg',
    hasObject: true,  // intentional: book
    prompt: 'same elderly Ukrainian man with white beard reading a book by candlelight at night, leaning over a wooden table, side view, warm candle glow on face',
  },
  {
    file: 'panas-window-night.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard standing looking out a window at night, moonlight clearly illuminating face profile and beard, soft warm interior lamp casting visible glow on shoulder, silhouette readable against night sky, balanced exposure not underexposed, cinematic night scene, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-digging.jpg',
    hasObject: true,  // intentional: shovel
    prompt: 'same elderly Ukrainian man with white beard digging with a shovel, bent forward with effort, rear three-quarter view, soil flying, overcast daylight',
  },
  {
    file: 'panas-surprised.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard stumbling backward in surprise, both hands raised open, wide open eyes and mouth, three-quarter view, dramatic expression, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-praying.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard kneeling in prayer, head bowed, hands clasped together in prayer, strict side profile view, soft warm light',
  },
  {
    file: 'panas-arguing.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard pointing finger aggressively forward, leaning in, three-quarter front view, stern expression, mouth open mid-speech, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-sleeping.jpg',
    hasObject: true,  // intentional: newspaper
    prompt: 'same elderly Ukrainian man with white beard asleep in an armchair, newspaper resting on belly, mouth slightly open, strict side view, soft indoor light',
  },
  {
    file: 'panas-notebook.jpg',
    hasObject: true,  // intentional: open notebook
    prompt: 'same elderly Ukrainian man with white beard hunched over a small open blue notebook writing intently on the open pages, three-quarter view from above, pen in hand, concentrated expression',
  },
  {
    file: 'panas-quarrel.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard quarreling animatedly, hands gesturing wildly open, strict side profile view, mouth open, eyebrows raised, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-tree.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard up in a tree, gripping a branch with both hands, looking down with wide eyes, low angle view from below, leaves around him',
  },
  {
    file: 'panas-chickens.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard squatting in a chicken coop surrounded by chickens, strict side view, arm extended open toward a hen, amused expression, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-neighbor.jpg',
    hasObject: false,
    prompt: 'same elderly Ukrainian man with white beard leaning over a wooden fence talking to another old man, three-quarter view, both gesturing with open hands, daytime village setting, empty hands, no objects, nothing held',
  },
  {
    file: 'panas-holding.jpg',
    hasObject: true,  // intentional: small found object
    prompt: 'same elderly Ukrainian man with white beard holding a small round object out in his extended open palm, close-up three-quarter view, squinting to examine it, curious expression',
  },
  {
    file: 'panas-packages.jpg',
    hasObject: true,  // intentional: bags
    prompt: 'same elderly Ukrainian man with white beard walking while carrying several bags and bundles in both hands, full body strict side view, slightly hunched under the weight',
  },
]

async function callReplicate(prompt, hasObject) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      process.stdout.write(`retry ${attempt}/3 ... `)
      await new Promise(r => setTimeout(r, 30000))
    }
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      body: JSON.stringify({ input: {
        prompt,
        negative_prompt: hasObject ? NEGATIVE_BASE : NEGATIVE_CLEAN,
        input_image: base64Image,
        seed: Math.floor(Math.random() * 2_000_000),
      }}),
    })
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

mkdirSync(OUT_DIR, { recursive: true })

console.log(`Generating ${POSES.length} poses into public/panas-poses/\n`)

for (const { file, prompt, hasObject } of POSES) {
  process.stdout.write(`  ${file} ... `)
  try {
    const url = await callReplicate(prompt, hasObject)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    writeFileSync(join(OUT_DIR, file), buf)
    console.log('OK')
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
  }
}

console.log('\nDone. Files saved to public/panas-poses/')
