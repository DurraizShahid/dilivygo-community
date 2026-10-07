-- Canonical delivery provider-task mapping columns (Phase 10: delivery / last-mile provider capability).
--
-- Purpose: correlate Dilivygo delivery rows <-> provider task ids <->
-- idempotency keys <-> provider webhook events, so retries, duplicate
-- createDelivery calls, and duplicate/out-of-order provider callbacks resolve
-- provider truth without guessing. Written best-effort by
-- services/delivery-provider.js — mapping writes never fail the dispatch
-- itself (they warn and continue, and tolerate missing columns so deploy order
-- between code and migration is safe).
--
-- Lifecycle: columns are populated when a task is created through the
-- delivery capability (`provider_key`, `provider_task_id`,
-- `provider_idempotency_key`, `provider_quote_id`,
-- `provider_quote_expires_at`, `quoted_amount_cents`) and refreshed on
-- provider callbacks (`provider_status`, `provider_last_event_id`,
-- `provider_last_event_at`). The internal `deliveries.status` CHECK
-- constraint is DELIBERATELY untouched: provider cancellation/failure is
-- mapping-level state (`provider_status`), never a `deliveries.status`
-- value, because the order lifecycle (triggers `090`, RPCs `096`) owns that
-- row. Terminal order cancellation stays on the order path.
--
-- Idempotency: partial UNIQUE (organization_id, provider_idempotency_key).
-- Same logical task retried (same key) returns the original provider_task_id
-- instead of dispatching twice. Concurrent racers: the UNIQUE constraint
-- decides the winner; the loser re-reads the winner row. NULL keys (legacy
-- rows created outside the capability) never collide.
--
-- Tenant isolation: every lookup is (organization_id, ...) scoped; the
-- provider task id is an opaque correlation column, NEVER a primary key
-- (kit global rule §19).
--
-- Rollout: additive + idempotent (IF NOT EXISTS everywhere). Nullable columns
-- only, no backfill (capability writes going forward; historical deliveries
-- stay unmapped). No FK to external systems. Safe to apply any time; readers/
-- writers degrade cleanly when the columns are absent.
-- Do NOT run the migration runner without DB credentials; validate by re-read.

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_key TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_task_id TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_idempotency_key TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_quote_id TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_quote_expires_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS quoted_amount_cents INTEGER;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_last_event_id TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_last_event_at TIMESTAMPTZ;

-- Idempotency: one task per (organization, idempotency key). Partial so
-- legacy/uncorrelated rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_provider_idempotency_uq
  ON deliveries (organization_id, provider_idempotency_key)
  WHERE provider_idempotency_key IS NOT NULL;

-- Webhook lookup: provider callback -> internal delivery row.
CREATE INDEX IF NOT EXISTS deliveries_provider_task_idx
  ON deliveries (provider_key, provider_task_id)
  WHERE provider_task_id IS NOT NULL;

-- Operations scan: tasks by provider state.
CREATE INDEX IF NOT EXISTS deliveries_provider_status_idx
  ON deliveries (provider_key, provider_status)
  WHERE provider_key IS NOT NULL;
