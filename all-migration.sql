-- Migration: Create unified content table
-- Replaces separate `series` and `stories` tables with a single `content` table.
-- Route: /read/[slug] for all content types.

CREATE TYPE content_type AS ENUM ('episode', 'story');
CREATE TYPE content_status AS ENUM ('draft', 'humanizing', 'review', 'approved', 'published');
CREATE TYPE audio_status_type AS ENUM ('pending', 'processing', 'ready', 'failed');

CREATE TABLE content (
  -- identity
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,       -- URL slug: s3e04 for episodes, UUID text for stories
  type          content_type NOT NULL,

  -- common fields
  title         TEXT NOT NULL,
  description   TEXT,
  cover_url     TEXT,
  status        content_status NOT NULL DEFAULT 'draft',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,

  -- episode-only fields (NULL for stories)
  series_name   TEXT,                       -- e.g. 'Балабони'
  season_number INTEGER,
  episode_number INTEGER,

  -- story-only fields (NULL for episodes)
  author_name   TEXT,
  genre         TEXT,
  category      TEXT,
  text          TEXT,
  corrected_text TEXT,
  humanized_text TEXT,
  humanize_summary TEXT,
  changes       JSONB,
  published_version TEXT,
  ai_report     TEXT,
  ai_score      TEXT,
  admin_notes   TEXT,
  duration_minutes INTEGER,

  -- audio (shared)
  audio_url     TEXT,
  audio_status  audio_status_type DEFAULT 'pending',

  CONSTRAINT episode_required_fields CHECK (
    type != 'episode' OR (
      series_name IS NOT NULL
      AND season_number IS NOT NULL
      AND episode_number IS NOT NULL
    )
  ),
  CONSTRAINT story_required_fields CHECK (
    type != 'story' OR author_name IS NOT NULL
  )
);

-- Enforce uniqueness of (series_name, season, episode) for episodes only
CREATE UNIQUE INDEX episode_series_unique
  ON content (series_name, season_number, episode_number)
  WHERE type = 'episode';

-- Fast lookup by type
CREATE INDEX content_type_idx ON content (type);
CREATE INDEX content_status_idx ON content (status);
CREATE INDEX content_published_idx ON content (published_at DESC NULLS LAST);
-- Migration: Move data from `series` and `stories` into `content`
-- Run AFTER 20260506_001_content_table.sql
-- Prerequisites: run scripts/generate-story-slugs.mjs to populate stories.slug first.

-- ── Guard: ensure all stories have slugs ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stories WHERE slug IS NULL OR slug = '') THEN
    RAISE EXCEPTION 'stories has rows with NULL slug — run generate-story-slugs.mjs first';
  END IF;
END $$;

-- ── 1. Migrate series → content (type = 'episode') ───────────────────────────
-- id is auto-generated UUID; slug carries the normalised episode key (s3e04).
-- Legacy slugs normalised: s3-ep45 → s3e45 via regexp_replace.
-- New-format IDs (s3e04) are already canonical — regex won't match them.
-- series.status is NULL for all rows — mapped to 'published' (content is live).

INSERT INTO content (
  slug, type,
  title, description, cover_url,
  status, created_at, published_at,
  series_name, season_number, episode_number
)
SELECT
  regexp_replace(id, '^s(\d+)-ep(\d+)$', 's\1e\2') AS slug,
  'episode'::content_type,
  title,
  description,
  cover_url,
  'published'::content_status,
  created_at,
  created_at,          -- treat creation as publish date; update manually if needed
  'Балабони',
  season::integer,
  number::integer
FROM series;

-- ── 2. Migrate stories → content (type = 'story') ────────────────────────────
-- Existing story UUID preserved as content.id (UUID PK).
-- stories.slug (Latin transliteration) used as content.slug.
-- Verified 2026-05-06: only 'approved' exists in stories.status (12 rows).

INSERT INTO content (
  id, slug, type,
  title, description, cover_url,
  status, created_at, published_at,
  author_name, genre, category,
  text, corrected_text, humanized_text, humanize_summary,
  changes, published_version,
  ai_report, ai_score, admin_notes,
  duration_minutes, audio_url, audio_status
)
SELECT
  id,
  slug,                -- stories.slug populated by generate-story-slugs.mjs
  'story'::content_type,
  title,
  NULL,                -- stories have no description field
  cover_url,
  CASE status
    WHEN 'approved' THEN 'approved'::content_status
    ELSE                 'draft'::content_status
  END,
  created_at,
  approved_at,
  author_name,
  genre,
  category,
  text,
  corrected_text,
  humanized_text,
  humanize_summary,
  changes,
  published_version,
  ai_report,
  ai_score,
  admin_notes,
  NULLIF(duration_minutes::text, '')::integer,
  audio_url,
  audio_status::audio_status_type
FROM stories;

-- ── 3. Integrity check ───────────────────────────────────────────────────────
DO $$
DECLARE
  series_count  INTEGER;
  stories_count INTEGER;
  content_ep    INTEGER;
  content_st    INTEGER;
BEGIN
  SELECT COUNT(*) INTO series_count  FROM series;
  SELECT COUNT(*) INTO stories_count FROM stories;
  SELECT COUNT(*) INTO content_ep    FROM content WHERE type = 'episode';
  SELECT COUNT(*) INTO content_st    FROM content WHERE type = 'story';

  IF content_ep <> series_count THEN
    RAISE EXCEPTION 'Episode count mismatch: series=% content=%', series_count, content_ep;
  END IF;
  IF content_st <> stories_count THEN
    RAISE EXCEPTION 'Story count mismatch: stories=% content=%', stories_count, content_st;
  END IF;

  RAISE NOTICE 'Migration OK: % episodes + % stories → % content rows',
    content_ep, content_st, content_ep + content_st;
END $$;
