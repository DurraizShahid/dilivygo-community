-- Migration: 118_ai_usage_events
-- Durable metadata sink for AI telemetry. Metadata only by design: there are
-- intentionally NO prompt/response/payload columns. Readers aggregate by
-- organization, capability, model, and day.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL CHECK (type IN ('model_call', 'router_decision', 'assistant_answer', 'action_execute')),
  trace_id TEXT,
  capability TEXT,
  detail TEXT,
  organization_id UUID,
  project_ref TEXT,
  actor_kind TEXT,
  model_class TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  tokens_estimated BOOLEAN NOT NULL DEFAULT true,
  cost_usd NUMERIC,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  error_code TEXT,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  tool_count INTEGER NOT NULL DEFAULT 0,
  fallbacks INTEGER NOT NULL DEFAULT 0,
  llm_avoided BOOLEAN NOT NULL DEFAULT false,
  selection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_org_time_idx
  ON ai_usage_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_capability_idx
  ON ai_usage_events (capability, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_project_idx
  ON ai_usage_events (project_ref, occurred_at DESC);
