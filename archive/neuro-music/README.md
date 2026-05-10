# Neuro-Music (archived)

**Archived on:** 2026-05-10
**Reason:** Section was empty - no AI-generated music tracks were ever uploaded.

## What is here
- `NeuroMusicSection.tsx` - the original UI component

## What was missing
- Content: no neuro-music tracks (was supposed to use Suno/Udio for AI music generation)
- The UI was ready, only the content pipeline was missing

## To restore
1. Generate 5-10 tracks with Suno or Udio matching Balabony storytelling style
2. Upload them to Supabase storage (same bucket as audio for series)
3. Copy `NeuroMusicSection.tsx` back to `app/components/`
4. Add import to `app/page.tsx`: `import NeuroMusicSection from './components/NeuroMusicSection'`
5. Add `<div id="neuro-music"><NeuroMusicSection /></div>` in JSX

## To remove permanently
Just delete this folder. Git history retains everything.