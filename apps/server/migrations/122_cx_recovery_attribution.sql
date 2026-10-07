-- Migration: 122_cx_recovery_attribution
-- Recovery revenue attribution (Phase 10). Additive and idempotent.
--
-- Each executed recovery may attribute at most one subsequent order
-- (UNIQUE on recovery_action_id, from migration 120). These columns record
-- HOW it was attributed so aggregates stay interpretable when the tenant
-- later changes its attribution window:
--   attribution_kind: 'direct' = the guest redeemed this recovery's promo on
--     the attributed order; 'subsequent' = first qualifying order in window.
--   window_days: the tenant window in force when computed (stable history).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE cx_recovery_redemptions
  ADD COLUMN IF NOT EXISTS attribution_kind TEXT
    CHECK (attribution_kind IS NULL OR attribution_kind IN ('direct', 'subsequent'));

ALTER TABLE cx_recovery_redemptions
  ADD COLUMN IF NOT EXISTS window_days INTEGER
    CHECK (window_days IS NULL OR window_days BETWEEN 1 AND 365);

COMMENT ON COLUMN cx_recovery_redemptions.attribution_kind IS 'direct = promo issued by this recovery redeemed on the order; subsequent = first qualifying order inside the attribution window.';
COMMENT ON COLUMN cx_recovery_redemptions.window_days IS 'Tenant attribution window (days) in force at compute time. Aggregates must never assume one global window.';

CREATE INDEX IF NOT EXISTS cx_recovery_redemptions_org_time_idx
  ON cx_recovery_redemptions (organization_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS cx_recovery_redemptions_customer_idx
  ON cx_recovery_redemptions (customer_id, redeemed_at DESC)
  WHERE customer_id IS NOT NULL;

-- ─── Harden RLS: service_role only (matches 113–121 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_redemptions') THEN
    REVOKE ALL ON TABLE cx_recovery_redemptions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_redemptions TO service_role;
  END IF;
END $$;
