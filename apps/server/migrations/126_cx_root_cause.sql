-- Migration: 126_cx_root_cause
-- AI root cause analysis (Phase 16). One row per analysis VERSION per
-- case — regenerate/review appends a new version, never overwrites, so
-- staff can audit how an assessment evolved. Evidence references point
-- at canonical records (orders/audit/deliveries/refunds/feedback);
-- primary_cause is restricted to a controlled taxonomy. Additive and
-- idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_case_root_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cx_cases(id) ON DELETE CASCADE,
  -- Monotonic per case (1, 2, 3…). Latest = highest version.
  version INTEGER NOT NULL CHECK (version >= 1),
  -- 'ai' = model-assisted (evidence-grounded), 'rule' = deterministic baseline.
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('ai', 'rule')),
  -- Controlled taxonomy. Only the model output path is restricted further
  -- in code (unknown labels fall back to the rule baseline).
  primary_cause TEXT NOT NULL CHECK (primary_cause IN (
    'kitchen_delay', 'dispatch_delay', 'rider_delay', 'unassigned_delivery',
    'order_cancelled', 'item_accuracy', 'food_quality', 'ambiguous'
  )),
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Traceable evidence: [{ id, kind, label, detail }]. Every id refers to
  -- a record assembled server-side (order/audit/delivery/refund/feedback/
  -- support/shop/items) — the model cannot invent references.
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Runner-up hypotheses: [{ cause, confidence, why }].
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence TEXT[] NOT NULL DEFAULT '{}',
  investigation_questions TEXT[] NOT NULL DEFAULT '{}',
  -- Frozen input snapshot for review/audit of past versions.
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'cx-rootcause-v1',
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'rule', 'fallback')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, case_id, version)
);

CREATE INDEX IF NOT EXISTS cx_case_root_causes_case_version_idx
  ON cx_case_root_causes (organization_id, case_id, version DESC);

COMMENT ON TABLE cx_case_root_causes IS 'Evidence-grounded probable root causes per complaint. Versions append-only; primary_cause is taxonomy-closed; every evidence ref traces to a canonical record.';
COMMENT ON COLUMN cx_case_root_causes.evidence_snapshot IS 'Frozen assembler output for this version so past assessments stay reviewable after source records change.';

-- ─── Harden RLS: service_role only (matches 113–125 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_case_root_causes') THEN
    REVOKE ALL ON TABLE cx_case_root_causes FROM anon, authenticated;
    GRANT ALL ON TABLE cx_case_root_causes TO service_role;
  END IF;
END $$;
