-- Migration: 121_cx_recovery_policy
-- Role-based recovery authority (who may propose/approve what) for the
-- Phase 9 guardrails program. Additive and idempotent.
--
-- No rows are seeded: when an org has no row for a role, the conservative
-- code defaults apply (owner = unlimited + approve, admin = capped +
-- approve, member = propose-only). Existing tenants therefore gain no new
-- monetary authority by upgrading.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cx_recovery_role_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  -- Max amount (cents) the role may approve/auto-release. NULL = unlimited.
  -- Proposals above the limit are not denied: they are forced into
  -- requires_approval so a higher authority must approve (manager approval).
  max_amount_cents INTEGER CHECK (max_amount_cents IS NULL OR max_amount_cents >= 0),
  can_approve BOOLEAN NOT NULL DEFAULT false,
  -- Action types the role may propose. NULL = all types.
  allowed_types TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role)
);

CREATE INDEX IF NOT EXISTS cx_recovery_role_limits_org_idx
  ON cx_recovery_role_limits (organization_id);

COMMENT ON TABLE cx_recovery_role_limits IS 'Per-org recovery authority per SaaS role. Absent rows fall back to conservative code defaults (see cx-recovery-policy.service).';
COMMENT ON COLUMN cx_recovery_role_limits.max_amount_cents IS 'Approval ceiling in cents. Amounts above it force manager approval instead of being denied.';
COMMENT ON COLUMN cx_recovery_role_limits.allowed_types IS 'Nullable allow-list of recovery types. NULL means every type.';

-- ─── Harden RLS: service_role only (matches 113/118/119/120 style) ─────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_role_limits') THEN
    REVOKE ALL ON TABLE cx_recovery_role_limits FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_role_limits TO service_role;
  END IF;
END $$;
