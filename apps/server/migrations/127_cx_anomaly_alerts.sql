-- Migration: 127_cx_anomaly_alerts
-- Recurring problem & anomaly detection (Phase 17). One row per
-- (signal × scope) episode: repeats of the same episode bump
-- `times_seen`/`last_seen_at` instead of inserting (dedupe + cooldown),
-- and operators work alerts through open → acknowledged/snoozed →
-- resolved with audit. Baseline/observed values and samples persist so
-- every alert explains itself. Additive and idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Stable episode key: signal + scope (e.g. negative_feedback_rate:shop:<uuid>).
  alert_key TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN (
    'negative_feedback_rate', 'category_spike', 'product_complaints',
    'rider_issues', 'case_volume', 'sla_breach_rate'
  )),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('org', 'shop', 'category', 'product', 'rider')),
  scope_id TEXT,
  scope_label TEXT,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  baseline_value NUMERIC NOT NULL,
  baseline_sample INTEGER NOT NULL CHECK (baseline_sample >= 0),
  observed_value NUMERIC NOT NULL,
  observed_sample INTEGER NOT NULL CHECK (observed_sample >= 0),
  threshold_value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved')),
  snoozed_until TIMESTAMPTZ,
  times_seen INTEGER NOT NULL DEFAULT 1 CHECK (times_seen >= 1),
  -- Supporting record references: [{ kind, id, label }].
  supporting_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alert_key)
);

CREATE INDEX IF NOT EXISTS cx_anomaly_alerts_org_status_idx
  ON cx_anomaly_alerts (organization_id, status, last_seen_at DESC);

COMMENT ON TABLE cx_anomaly_alerts IS 'Deterministic CX anomaly episodes. Detector upserts by (organization_id, alert_key): repeats bump times_seen within cooldown instead of spamming new rows.';
COMMENT ON COLUMN cx_anomaly_alerts.baseline_value IS 'Baseline rate over the trailing baseline window (same scope). Compared against observed_value with threshold_value — all three shown in the inbox.';

-- ─── Harden RLS: service_role only (matches 113–126 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_anomaly_alerts') THEN
    REVOKE ALL ON TABLE cx_anomaly_alerts FROM anon, authenticated;
    GRANT ALL ON TABLE cx_anomaly_alerts TO service_role;
  END IF;
END $$;
