import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// Пакетна регенерація обкладинок.
// Може приймати або {slugs: [...]} — конкретні slug,
// або {all: true} — всі що є в cover_plan,
// або {limit: N} — перші N з плану.
//
// Параметри:
// - delayMs: затримка між запитами (default 2000ms — щоб не перевантажити Replicate)
// - dryRun: тільки повернути список що буде регенеруватися

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const slugs: string[] | undefined = body.slugs
    const all: boolean = body.all === true
    const limit: number | undefined = body.limit
    const delayMs: number = body.delayMs ?? 2000
    const dryRun: boolean = body.dryRun === true

    const supabase = getSupabaseAdmin()

    // 1. Визначити що регенеруємо
    let targetSlugs: string[] = []
    if (slugs && Array.isArray(slugs) && slugs.length > 0) {
      targetSlugs = slugs
    } else if (all) {
      const { data: plan, error } = await supabase
        .from('cover_plan')
        .select('slug')
        .order('slug')
      if (error || !plan) {
        return NextResponse.json({ error: `Plan read error: ${error?.message}` }, { status: 500 })
      }
      targetSlugs = plan.map(p => p.slug)
    } else {
      return NextResponse.json({ error: 'Provide slugs[], or all:true, or limit:N' }, { status: 400 })
    }

    if (limit && limit > 0) {
      targetSlugs = targetSlugs.slice(0, limit)
    }

    if (dryRun) {
      return NextResponse.json({
        wouldRegenerate: targetSlugs.length,
        slugs: targetSlugs,
        estimatedMinutes: Math.ceil((targetSlugs.length * 45) / 60),
      })
    }

    // 2. Завантажити title/description для кожного slug (потрібно для виклику generate-cover)
    const { data: contentData, error: contentErr } = await supabase
      .from('content')
      .select('slug, title, description')
      .in('slug', targetSlugs)

    if (contentErr || !contentData) {
      return NextResponse.json({ error: `Content read error: ${contentErr?.message}` }, { status: 500 })
    }

    const contentMap = new Map(contentData.map(c => [c.slug, c]))

    // 3. Визначити базовий URL для виклику generate-cover (наш же сервер)
    // Беремо з origin запиту
    const origin = req.nextUrl.origin

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    const results: Array<{
      slug: string
      ok: boolean
      url?: string
      pose?: string
      location?: string
      season?: string
      error?: string
    }> = []

    for (let i = 0; i < targetSlugs.length; i++) {
      const slug = targetSlugs[i]
      const content = contentMap.get(slug)
      if (!content) {
        results.push({ slug, ok: false, error: 'Content not found in DB' })
        continue
      }

      try {
        const genRes = await fetch(`${origin}/api/generate-cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesId: slug,
            title: content.title,
            description: content.description || '',
          }),
        })
        const genData = await genRes.json()
        if (genRes.ok && genData.url) {
          results.push({
            slug,
            ok: true,
            url: genData.url,
            pose: genData.poseFile,
            location: genData.location,
            season: genData.season,
          })
          console.log(`[${i + 1}/${targetSlugs.length}] ✓ ${slug} (${genData.poseFile} / ${genData.location || 'no-loc'})`)
        } else {
          results.push({
            slug,
            ok: false,
            error: genData.error || `HTTP ${genRes.status}`,
          })
          console.log(`[${i + 1}/${targetSlugs.length}] ✗ ${slug}: ${genData.error}`)
        }
      } catch (err) {
        results.push({
          slug,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      if (i < targetSlugs.length - 1) {
        await sleep(delayMs)
      }
    }

    const successful = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok)

    return NextResponse.json({
      total: targetSlugs.length,
      successful,
      failedCount: failed.length,
      failed,
      results,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
