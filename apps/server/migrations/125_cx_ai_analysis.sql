-- Migration: 125_cx_ai_analysis
-- AI sentiment & topic detection (Phase 15). One latest-analysis row per
-- org × subject (feedback submission or external review); recompute
-- upserts the same row, so re-analysis is idempotent. Prompt versions are
-- recorded for provenance, and low-confidence output is stored as
-- uncertain rather than forced. Additive and idempotent. No seeds.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cx_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('feedback', 'external_review')),
  subject_id UUID NOT NULL,
  -- Provenance: which model, prompt, and path produced this row.
  provider TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'cx-classify-v1',
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'fallback', 'failed')),
  -- Strict classification output. sentiment includes 'uncertain' for
  -- below-threshold confidence — never a forced label.
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'uncertain')),
  sentiment_score NUMERIC CHECK (sentiment_score IS NULL OR (sentiment_score >= 0 AND sentiment_score <= 1)),
  emotion TEXT CHECK (emotion IS NULL OR emotion IN ('joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'neutral')),
  -- Canonical taxonomy ids only (cx_categories/cx_tags). Model-proposed
  -- labels that match nothing land in unmapped_topics — categories are
  -- never auto-created from model output.
  topic_category_ids UUID[] NOT NULL DEFAULT '{}',
  topic_tag_slugs TEXT[] NOT NULL DEFAULT '{}',
  unmapped_topics TEXT[] NOT NULL DEFAULT '{}',
  urgency TEXT CHECK (urgency IS NULL OR urgency IN ('low', 'medium', 'high', 'critical')),
  -- Entity mentions as extracted strings (never resolved to records —
  -- the model must not invent links to orders/customers/products).
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Safe evidence: short verbatim spans (≤ 200 chars each, ≤ 3) supporting
  -- the label. Redacted the same way as model input.
  evidence_spans TEXT[] NOT NULL DEFAULT '{}',
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS cx_ai_analysis_org_subject_idx
  ON cx_ai_analysis (organization_id, subject_type, analyzed_at DESC);

COMMENT ON TABLE cx_ai_analysis IS 'Sparse LLM analysis of feedback/review text. Deterministic fallback rows carry status=fallback. Sentiment is uncertain below confidence threshold — never forced.';
COMMENT ON COLUMN cx_ai_analysis.unmapped_topics IS 'Model-proposed topics matching no canonical category/tag. Review source for taxonomy curation; never auto-persisted as categories.';

-- ─── Harden RLS: service_role only (matches 113–124 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_ai_analysis') THEN
    REVOKE ALL ON TABLE cx_ai_analysis FROM anon, authenticated;
    GRANT ALL ON TABLE cx_ai_analysis TO service_role;
  END IF;
END $$;
