-- Migration: 117_support_ai_summary
-- Incremental AI summaries for support conversations. Additive only.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary_up_to TIMESTAMPTZ;
