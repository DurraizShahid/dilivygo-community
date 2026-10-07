-- Migration: 134_cx_ai_runs
-- AI CX employee (Phase 25). Conversation/audit ledger for assistant
-- runs: the staff question (truncated), the answer given, every typed
-- tool call with its result summary, iteration count, and provider
-- provenance. Daily per-org budgets are enforced in code against this
-- table. Additive and idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID,
  question TEXT NOT NULL,
  answer TEXT,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  iterations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'fallback', 'failed')),
  provider TEXT,
  model TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_ai_runs_org_day_idx
  ON cx_ai_runs (organization_id, created_at DESC);

-- ─── Harden RLS: service_role only (matches 113–133 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_ai_runs') THEN
    REVOKE ALL ON TABLE cx_ai_runs FROM anon, authenticated;
    GRANT ALL ON TABLE cx_ai_runs TO service_role;
  END IF;
END $$;
