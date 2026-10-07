-- Migration: 118_cx_negative_detection
-- Configurable deterministic negative-feedback rules + exactly-once case creation
-- + source evidence columns on cx_cases. Follows additive/idempotent conventions.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Detection rules (per-org, ordered, deterministic precedence) ──────────
CREATE TABLE IF NOT EXISTS cx_detection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 10000),
  enabled BOOLEAN NOT NULL DEFAULT true,
  severity TEXT NOT NULL DEFAULT 'high'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category_id UUID REFERENCES cx_categories(id) ON DELETE SET NULL,
  sla_hours INTEGER CHECK (sla_hours IS NULL OR (sla_hours >= 0 AND sla_hours <= 720)),
  -- Deterministic criteria (all fields optional; rule matches when ALL specified criteria match):
  --   overall_rating_lte: 1-5 | nps_max: 0-10 (match when NPS <= value) |
  --   csat_max: 1-5 | ces_min: 1-7 | negative_choices: string[] (match when any answer choice value in list) |
  --   tags_any: string[] (tag slugs) | categories_any: uuid[] (category ids)
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_detection_rules_org_priority_idx
  ON cx_detection_rules (organization_id, enabled, priority ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS cx_detection_rules_org_category_idx
  ON cx_detection_rules (organization_id, category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON TABLE cx_detection_rules IS
  'Deterministic negative-feedback rules per org. Evaluated in (priority ASC, created_at ASC) order; first match wins. No LLM.';

-- ─── Case evidence columns (source of detection) ───────────────────────────
ALTER TABLE cx_cases ADD COLUMN IF NOT EXISTS detection_rule_id UUID REFERENCES cx_detection_rules(id) ON DELETE SET NULL;
ALTER TABLE cx_cases ADD COLUMN IF NOT EXISTS detection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cx_cases ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'negative_detection', 'survey', 'order_triggered', 'external_review', 'pos', 'whatsapp', 'webhook', 'import'));

CREATE INDEX IF NOT EXISTS cx_cases_detection_rule_idx
  ON cx_cases (detection_rule_id)
  WHERE detection_rule_id IS NOT NULL;

COMMENT ON COLUMN cx_cases.detection_rule_id IS 'Rule that created this case (null for manual cases).';
COMMENT ON COLUMN cx_cases.detection_reasons IS 'Structured evidence explaining why the case was created (matched criteria).';
COMMENT ON COLUMN cx_cases.source IS 'Origin of the case: manual or detection/feedback channel.';

-- ─── Exactly-once: one case per feedback submission ────────────────────────
-- Partial unique index (not a table rewrite): duplicate inserts for the same
-- feedback_submission_id fail with 23505, which the service maps to "already exists".
CREATE UNIQUE INDEX IF NOT EXISTS cx_cases_feedback_unique
  ON cx_cases (feedback_submission_id)
  WHERE feedback_submission_id IS NOT NULL;

-- ─── Harden RLS: service_role only (matches 113 style) ─────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_detection_rules') THEN
    REVOKE ALL ON TABLE cx_detection_rules FROM anon, authenticated;
    GRANT ALL ON TABLE cx_detection_rules TO service_role;
  END IF;
END $$;
