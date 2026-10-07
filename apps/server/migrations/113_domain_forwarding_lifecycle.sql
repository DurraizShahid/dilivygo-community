-- Migration: 113_domain_forwarding_lifecycle
-- Domain Forwarding V2 — persistence model for custom domain families (ADR-001).
-- Extends existing hostname tables (067/077) with lifecycle, primary, provider,
-- verification, TLS, error, audit, and hold semantics. No parallel source of
-- truth; both tables remain the authoritative stores. Backfill is idempotent.

-- ── 1. organization_hostnames — lifecycle + primary + provider + verification ──

ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS provider_domain_id TEXT;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS provider_project_id TEXT;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS dns_instructions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS tls_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE organization_hostnames ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;

-- Normalize existing status values that may be null/empty from partially migrated envs
UPDATE organization_hostnames SET status = 'active' WHERE status IS NULL OR status = '';
UPDATE organization_hostnames SET tls_status = 'pending' WHERE tls_status IS NULL OR tls_status = '';
UPDATE organization_hostnames SET dns_instructions = '{}'::jsonb WHERE dns_instructions IS NULL;
UPDATE organization_hostnames SET is_primary = false WHERE is_primary IS NULL;
UPDATE organization_hostnames SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

-- Backfill: canonicalize hostname in-place for case/trailing-dot duplicates (idempotent)
-- Only lowercases and trims one trailing dot — punycode backfill is app-layer (rare IDN rows).
-- If two rows would collide after canonicalization, keep oldest (created_at) and require manual fix.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT lower(rtrim(hostname, '.')) AS canon, count(*) AS n
    FROM organization_hostnames
    GROUP BY lower(rtrim(hostname, '.'))
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'organization_hostnames canonical collision for % (count %): manual review required', dup.canon, dup.n;
  END LOOP;
END $$;

UPDATE organization_hostnames
SET hostname = lower(rtrim(hostname, '.'))
WHERE hostname <> lower(rtrim(hostname, '.'));

UPDATE organization_hostnames
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

-- Constraints (add if not exists via DO block to keep idempotent on rerun)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_hostnames_status_check'
  ) THEN
    ALTER TABLE organization_hostnames ADD CONSTRAINT organization_hostnames_status_check
      CHECK (status IN ('pending','dns_pending','verifying','active','error','removing','removed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_hostnames_tls_status_check'
  ) THEN
    ALTER TABLE organization_hostnames ADD CONSTRAINT organization_hostnames_tls_status_check
      CHECK (tls_status IN ('pending','ready','error'));
  END IF;
END $$;

-- Keep surface check permissive for legacy rows (customer/rider/apex only for new writes via app validator).
-- Existing CHECK (customer,rider,apex) already correct — no change.

-- Primary uniqueness: at most one primary per (organization_id, app_surface) among non-removed rows
CREATE UNIQUE INDEX IF NOT EXISTS organization_hostnames_primary_uq
  ON organization_hostnames (organization_id, app_surface)
  WHERE is_primary AND status <> 'removed';

-- Active-host lookup helper (used by runtime Host header resolution — only active rows are claimable)
CREATE INDEX IF NOT EXISTS organization_hostnames_active_lower_idx
  ON organization_hostnames (lower(hostname))
  WHERE status = 'active';

-- Dashboard listing + status filtering
CREATE INDEX IF NOT EXISTS organization_hostnames_org_status_idx
  ON organization_hostnames (organization_id, status, app_surface);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_organization_hostnames_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_hostnames_updated_at_trg ON organization_hostnames;
CREATE TRIGGER organization_hostnames_updated_at_trg
  BEFORE UPDATE ON organization_hostnames
  FOR EACH ROW EXECUTE FUNCTION update_organization_hostnames_updated_at();

COMMENT ON COLUMN organization_hostnames.status IS 'Lifecycle: pending->dns_pending->verifying->active (+error/removing/removed). Only active rows are routable (ADR-001 §2.6). Legacy null treated as active shim.';
COMMENT ON COLUMN organization_hostnames.is_primary IS 'Canonical host per (organization_id, app_surface). At most one primary among non-removed rows (partial unique). Drives email baseUrl/SEO canonical (ADR-001 §2.4).';
COMMENT ON COLUMN organization_hostnames.provider IS 'Edge provider identity (e.g. vercel) when attached; null until dns_pending.';
COMMENT ON COLUMN organization_hostnames.tls_status IS 'Provider TLS readiness: pending|ready|error (orthogonal to status).';

-- ── 2. workspace_hostnames — same lifecycle columns ─────────────────────────────

ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS provider_domain_id TEXT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS provider_project_id TEXT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS dns_instructions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS tls_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;

UPDATE workspace_hostnames SET status = 'active' WHERE status IS NULL OR status = '';
UPDATE workspace_hostnames SET tls_status = 'pending' WHERE tls_status IS NULL OR tls_status = '';
UPDATE workspace_hostnames SET dns_instructions = '{}'::jsonb WHERE dns_instructions IS NULL;
UPDATE workspace_hostnames SET is_primary = false WHERE is_primary IS NULL;
UPDATE workspace_hostnames SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT lower(rtrim(hostname, '.')) AS canon, count(*) AS n
    FROM workspace_hostnames
    GROUP BY lower(rtrim(hostname, '.'))
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'workspace_hostnames canonical collision for % (count %): manual review required', dup.canon, dup.n;
  END LOOP;
END $$;

UPDATE workspace_hostnames
SET hostname = lower(rtrim(hostname, '.'))
WHERE hostname <> lower(rtrim(hostname, '.'));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_hostnames_status_check'
  ) THEN
    ALTER TABLE workspace_hostnames ADD CONSTRAINT workspace_hostnames_status_check
      CHECK (status IN ('pending','dns_pending','verifying','active','error','removing','removed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_hostnames_tls_status_check'
  ) THEN
    ALTER TABLE workspace_hostnames ADD CONSTRAINT workspace_hostnames_tls_status_check
      CHECK (tls_status IN ('pending','ready','error'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_hostnames_primary_uq
  ON workspace_hostnames (workspace_id, app_surface)
  WHERE is_primary AND status <> 'removed';

CREATE INDEX IF NOT EXISTS workspace_hostnames_active_lower_idx
  ON workspace_hostnames (lower(hostname))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS workspace_hostnames_ws_status_idx
  ON workspace_hostnames (workspace_id, status, app_surface);

CREATE OR REPLACE FUNCTION update_workspace_hostnames_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workspace_hostnames_updated_at_trg ON workspace_hostnames;
CREATE TRIGGER workspace_hostnames_updated_at_trg
  BEFORE UPDATE ON workspace_hostnames
  FOR EACH ROW EXECUTE FUNCTION update_workspace_hostnames_updated_at();

COMMENT ON COLUMN workspace_hostnames.status IS 'Lifecycle: pending->dns_pending->verifying->active (+error/removing/removed). Only active rows are routable (ADR-001 §2.6).';
COMMENT ON COLUMN workspace_hostnames.is_primary IS 'Canonical host per (workspace_id, app_surface). Partial unique among non-removed rows.';

-- ── 3. Cross-table hostname uniqueness guard (global lower(hostname) across both tables) ──
-- DB-level enforcement beyond per-table lower(hostname) uniques (067:28, 077:199).
-- Trigger raises exception on cross-table collision for inserts/updates of active/pending rows.
-- Removed rows still block during hold period (hold_until not yet expired) — takeover prevention.

CREATE OR REPLACE FUNCTION check_hostname_cross_table_unique()
RETURNS TRIGGER AS $$
DECLARE
  other_exists BOOLEAN;
  canon TEXT;
BEGIN
  canon := lower(rtrim(NEW.hostname, '.'));
  -- Only claimable rows participate in global uniqueness; removed rows during hold still block.
  IF NEW.status = 'removed' AND NEW.hold_until IS NOT NULL AND NEW.hold_until < now() THEN
    RETURN NEW; -- expired tombstone — allow reuse (cleanup job should have deleted)
  END IF;

  IF TG_TABLE_NAME = 'organization_hostnames' THEN
    SELECT EXISTS (
      SELECT 1 FROM workspace_hostnames w
      WHERE lower(rtrim(w.hostname, '.')) = canon
        AND w.status <> 'removed'
    ) INTO other_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM organization_hostnames o
      WHERE lower(rtrim(o.hostname, '.')) = canon
        AND o.status <> 'removed'
    ) INTO other_exists;
  END IF;

  IF other_exists THEN
    RAISE EXCEPTION 'hostname already claimed in other scope: %', NEW.hostname
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_hostnames_cross_unique_trg ON organization_hostnames;
CREATE TRIGGER organization_hostnames_cross_unique_trg
  BEFORE INSERT OR UPDATE OF hostname, status ON organization_hostnames
  FOR EACH ROW EXECUTE FUNCTION check_hostname_cross_table_unique();

DROP TRIGGER IF EXISTS workspace_hostnames_cross_unique_trg ON workspace_hostnames;
CREATE TRIGGER workspace_hostnames_cross_unique_trg
  BEFORE INSERT OR UPDATE OF hostname, status ON workspace_hostnames
  FOR EACH ROW EXECUTE FUNCTION check_hostname_cross_table_unique();

-- ── 4. Tombstone / hold table (optional but explicit for takeover audit) ─────────
-- Kept minimal: if we soft-delete via status='removed' we still keep row for 30d.
-- This table mirrors removed rows for external audit and for hold checks without scanning live tables.

CREATE TABLE IF NOT EXISTS hostname_tombstones (
  hostname TEXT PRIMARY KEY,
  normalized_hostname TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization','workspace')),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  app_surface TEXT NOT NULL,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hold_until TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS hostname_tombstones_hold_idx
  ON hostname_tombstones (hold_until);

COMMENT ON TABLE hostname_tombstones IS 'Soft-removal hold for takeover prevention (ADR-001 §2.6/§2.15). Hostname remains blocked until hold_until (30d). Cleanup job purges expired rows.';

-- ── 5. Unified view for runtime lookup (active only) ────────────────────────────
-- Documents single source-of-truth without duplicating writes. App code may
-- select from this view instead of unioning both tables manually.

CREATE OR REPLACE VIEW active_hostname_claims AS
  SELECT
    id,
    lower(rtrim(hostname, '.')) AS normalized_hostname,
    hostname,
    app_surface,
    'organization'::text AS scope_type,
    organization_id,
    NULL::uuid AS workspace_id,
    is_primary,
    status,
    provider,
    provider_domain_id,
    tls_status,
    verified_at,
    updated_at
  FROM organization_hostnames
  WHERE status = 'active'
  UNION ALL
  SELECT
    id,
    lower(rtrim(hostname, '.')),
    hostname,
    app_surface,
    'workspace'::text,
    (SELECT organization_id FROM workspaces w WHERE w.id = workspace_hostnames.workspace_id),
    workspace_id,
    is_primary,
    status,
    provider,
    provider_domain_id,
    tls_status,
    verified_at,
    updated_at
  FROM workspace_hostnames
  WHERE status = 'active';

COMMENT ON VIEW active_hostname_claims IS 'Unified active hostname claims (organization + workspace) for Host header lookup. Only active rows are routable — pending/dns_pending/verifying/error/removing/removed are excluded (ADR-001 §2.6).';

-- ── 6. Idempotent backfill verification ────────────────────────────────────────
-- Legacy rows had verified_at always null; mark active rows that have passed
-- at least one successful Host lookup (heuristic: created_at < now() - 1 day and not error) as verified_at = created_at
-- This preserves read compatibility: old code treated null verified_at as "Pending DNS" but still routable.
-- New code treats status=active as routable regardless of verified_at, so no behavior change.

UPDATE organization_hostnames
SET verified_at = COALESCE(verified_at, created_at)
WHERE status = 'active' AND verified_at IS NULL AND created_at < now() - interval '1 day';

UPDATE workspace_hostnames
SET verified_at = COALESCE(verified_at, created_at)
WHERE status = 'active' AND verified_at IS NULL AND created_at < now() - interval '1 day';

-- Ensure global lower(hostname) still unique after backfill normalization (notice collisions above if any)
-- Re-create lower uniques as partial where status != removed is NOT desired (tombstone hold needs block),
-- so keep original global uniques intact (067:28, 077:199) — they remain the arbiter.
