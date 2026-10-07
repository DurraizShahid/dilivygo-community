-- Migration: 116_provisioning_domain_lifecycle
--
-- Phase 07 (tenant provisioning, Clerk & custom domains).
--
-- What this adds:
--   1. `provisioning_operations` — durable ledger for idempotent tenant
--      provisioning. Each provisioning attempt claims a stable operation key
--      (`provision:{clerkUserId}` for new-org signup,
--      `provision:{clerkUserId}:{orgId}` for invite joins,
--      `offboard:{orgId}:{requestId}` for tenant deletion) behind
--      `UNIQUE (operation_key)`. The UNIQUE constraint decides the winner
--      when Clerk retries / concurrent replays race: the loser re-reads the
--      existing row and resumes from the recorded `step` instead of
--      duplicating orgs, members, workspaces, or hostnames.
--   2. Domain-lifecycle columns on `workspace_hostnames` and
--      `organization_hostnames` so a custom domain's *persisted* status
--      reflects EXTERNAL readiness (DNS ownership + TLS serving), never the
--      request intent:
--        requested -> dns_instructions -> verifying -> active ⇄ degraded
--        verifying -> failed | any -> revoked
--      Columns: `status`, `verification_token` (expected TXT value),
--      `verification_observed` (last seen TXT material, truncated),
--      `last_checked_at`, `check_attempts`, `last_error` (actionable),
--      `provider_domain_id` / `provider_project_id` (opaque external
--      hosting-provider ids — NULL until a provider contract exists; never
--      secrets), `updated_at`.
--
-- Rollout / backfill:
--   - Additive + idempotent (`IF NOT EXISTS` everywhere; CHECK constraints
--     guarded by `DO` blocks; backfill UPDATEs match only rows still on the
--     old default, so re-runs are no-ops).
--   - Backfill rule: rows with `verified_at` set (platform-seeded
--     `{ref}.{surface}.{apex}` hostnames) stay `active`; rows with
--     `verified_at IS NULL` (custom domains requested but never verified)
--     move to `requested` so the health job picks them up for DNS checks.
--   - Deploy order is safe either way: application code treats a missing
--     `status` column value (NULL, pre-migration rows selected by old code)
--     as `active` when `verified_at` is set, and insert paths fall back to
--     the legacy column set if the new columns are not yet present.
--   - Do NOT run the migration runner here (no DB credentials in this
--     session); apply with `npm run migrate --workspace=dilivygo-backend`
--     where credentials exist.
--
-- Rollback:
--   - New table: `DROP TABLE IF EXISTS provisioning_operations;`
--   - New columns: `ALTER TABLE <t> DROP COLUMN IF EXISTS <col>;` per column
--     (status, verification_token, verification_observed, last_checked_at,
--     check_attempts, last_error, provider_domain_id, provider_project_id,
--     updated_at) + `ALTER TABLE <t> DROP CONSTRAINT IF EXISTS
--     <t>_status_check;` + `DROP INDEX IF EXISTS <idx>;`. Application code
--     degrades cleanly when the columns are absent (legacy insert/update
--     fallback + NULL-status handling), so rollback needs no code revert.

-- ─── 1. Provisioning operations ledger ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS provisioning_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable idempotency key, e.g. `provision:{clerkUserId}`,
  -- `provision:{clerkUserId}:{orgId}`, `offboard:{orgId}:{requestId}`.
  operation_key TEXT NOT NULL,
  organization_id UUID NULL,
  clerk_user_id TEXT NULL,
  -- Last COMPLETED step (resume point after partial failure), e.g.
  -- `org`, `settings`, `templates`, `member`, `workspace`,
  -- `admin_settings`, `hostnames`, `done`.
  step TEXT NOT NULL DEFAULT 'started',
  status TEXT NOT NULL DEFAULT 'in_progress'
    CONSTRAINT provisioning_operations_status_check
    CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1
    CONSTRAINT provisioning_operations_attempts_check
    CHECK (attempts >= 1),
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provisioning_operations_key_uq UNIQUE (operation_key)
);

CREATE INDEX IF NOT EXISTS provisioning_operations_org_idx
  ON provisioning_operations (organization_id);

CREATE INDEX IF NOT EXISTS provisioning_operations_status_idx
  ON provisioning_operations (status);

COMMENT ON TABLE provisioning_operations IS
  'Phase 07 idempotency ledger for tenant provisioning/offboarding. '
  'UNIQUE(operation_key) makes retries resume instead of duplicating rows. '
  'No provider secrets are stored here.';

-- ─── 2. Domain lifecycle columns (workspace hostnames: vendor/pos) ──────────

ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS verification_token TEXT NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS verification_observed TEXT NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS check_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS provider_domain_id TEXT NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS provider_project_id TEXT NULL;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_hostnames_status_check') THEN
    ALTER TABLE workspace_hostnames ADD CONSTRAINT workspace_hostnames_status_check
      CHECK (status IN ('requested', 'dns_instructions', 'verifying', 'active', 'degraded', 'revoked', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS workspace_hostnames_status_checked_idx
  ON workspace_hostnames (status, last_checked_at);

-- ─── 3. Domain lifecycle columns (organization hostnames: customer/rider) ────

ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS verification_token TEXT NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS verification_observed TEXT NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS check_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS provider_domain_id TEXT NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS provider_project_id TEXT NULL;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_hostnames_status_check') THEN
    ALTER TABLE organization_hostnames ADD CONSTRAINT organization_hostnames_status_check
      CHECK (status IN ('requested', 'dns_instructions', 'verifying', 'active', 'degraded', 'revoked', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS organization_hostnames_status_checked_idx
  ON organization_hostnames (status, last_checked_at);

-- ─── 4. Backfill: unverified custom domains go back to `requested` ───────────
-- Idempotent: only rows still on the migration default (`active`) with no
-- `verified_at` are touched; re-runs match zero rows.

UPDATE workspace_hostnames
SET status = 'requested', updated_at = now()
WHERE verified_at IS NULL AND status = 'active';

UPDATE organization_hostnames
SET status = 'requested', updated_at = now()
WHERE verified_at IS NULL AND status = 'active';
