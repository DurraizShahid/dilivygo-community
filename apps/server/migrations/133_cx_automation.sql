-- Migration: 133_cx_automation
-- CX automation builder (Phase 24). Versioned rules (trigger +
-- conditions + action list) with append-only execution runs.
-- Idempotency is per (org, rule, event): replays return the recorded
-- run instead of re-executing. Rule edits bump `version`; in-flight
-- executions already snapshotted their definition. Additive and
-- idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger TEXT NOT NULL CHECK (trigger IN (
    'survey.completed', 'feedback.negative', 'case.created', 'case.overdue',
    'recovery.redeemed', 'review.created', 'refund.requested',
    'order.delayed', 'anomaly.raised'
  )),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional rule scope: when set, only events from this shop evaluate.
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_automation_rules_org_trigger_idx
  ON cx_automation_rules (organization_id, trigger) WHERE enabled;

CREATE TABLE IF NOT EXISTS cx_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES cx_automation_rules(id) ON DELETE CASCADE,
  rule_version INTEGER NOT NULL,
  rule_snapshot JSONB NOT NULL,
  trigger TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed', 'skipped')),
  condition_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (organization_id, rule_id, event_key, dry_run)
);

CREATE INDEX IF NOT EXISTS cx_automation_runs_rule_idx
  ON cx_automation_runs (rule_id, started_at DESC);

-- ─── Harden RLS: service_role only (matches 113–132 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_automation_rules') THEN
    REVOKE ALL ON TABLE cx_automation_rules FROM anon, authenticated;
    GRANT ALL ON TABLE cx_automation_rules TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_automation_runs') THEN
    REVOKE ALL ON TABLE cx_automation_runs FROM anon, authenticated;
    GRANT ALL ON TABLE cx_automation_runs TO service_role;
  END IF;
END $$;
