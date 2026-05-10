# Karaoke (archived)

**Archived on:** 2026-05-10
**Reason:** Synchronization between minus tracks and lyrics text was not working reliably.

## What is here
- `KaraokeSection.tsx` - the original UI component

## What was missing / broken
- Audio-text sync: lyrics did not follow the playback position correctly
- No backend / API endpoints (it was front-only)
- No content (no minus tracks were uploaded)

## To restore
1. Copy `KaraokeSection.tsx` back to `app/components/`
2. Add import to `app/page.tsx`: `import KaraokeSection from './components/KaraokeSection'`
3. Add `<KaraokeSection />` somewhere in JSX
4. **First fix the sync logic** - probably needs a different audio library (e.g. howler.js with timed cues) or a JSON timing file per track

## To remove permanently
Just delete this folder. Git history retains everything.