-- Migration: 115_domain_reconciliation_state
-- Domain Forwarding V2 — reconciliation bookkeeping for custom domains.
--
-- Adds per-hostname reconciliation state so the background reconciliation job
-- (apps/server/jobs/domain-reconciliation.job.js) can refresh provider / DNS /
-- TLS state on a cadence with exponential backoff for transient failures.
--
--   last_reconciled_at      — last time the job inspected this hostname
--   reconcile_attempts      — consecutive failed attempts (0 = healthy)
--   next_reconcile_at       — earliest time the job may pick the row again
--   last_reconcile_outcome  — activated | advanced | unchanged | recovered |
--                             error | rate_limited | skipped
--
-- Purely additive: the service layer tolerates these columns being absent
-- (persistReconcilePatch retries without them), so this migration can ship
-- independently of the deploy. Idempotent — safe to re-run.

-- ── 1. organization_hostnames — reconciliation state ──

ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS next_reconcile_at TIMESTAMPTZ;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_reconcile_outcome TEXT;

UPDATE organization_hostnames SET reconcile_attempts = 0 WHERE reconcile_attempts IS NULL;

CREATE INDEX IF NOT EXISTS organization_hostnames_reconcile_idx
  ON organization_hostnames (next_reconcile_at)
  WHERE status <> 'removed';

-- ── 2. workspace_hostnames — reconciliation state ──

ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS reconcile_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS next_reconcile_at TIMESTAMPTZ;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_reconcile_outcome TEXT;

UPDATE workspace_hostnames SET reconcile_attempts = 0 WHERE reconcile_attempts IS NULL;

CREATE INDEX IF NOT EXISTS workspace_hostnames_reconcile_idx
  ON workspace_hostnames (next_reconcile_at)
  WHERE status <> 'removed';
