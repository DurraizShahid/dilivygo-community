-- Migration: 135_cx_packaging
-- CX packaging & entitlements (Phase 30). Settings-based, no new tables:
-- the package preset (`cx_package`) and per-capability overrides
-- (`cx_cap_<name>`) live in organization_platform_settings and resolve in
-- code via apps/server/services/cx-entitlement.service.js.
--
-- Capability flags are the source of truth — never prices, never plan
-- names in enforcement code. Packages are preset bundles:
--   starter      — surveys, feedback, cases, analytics (the CX core)
--   growth       — + recovery, reputation, funnel, whatsapp, pos,
--                  anomaly, webhooks, customer360
--   intelligence — + ai, competitors, automation
--
-- Upgrade-safe rollout: every pre-existing organization missing a package
-- is explicitly seeded to `intelligence` so this migration cannot remove
-- access from an existing tenant. New organizations created after rollout
-- use the code default `starter`, which prevents a missing settings row from
-- silently granting paid capabilities. Additive and idempotent. No RLS
-- changes (table already service_role only).

INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
SELECT o.id, 'cx_package', 'intelligence', NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_platform_settings s
  WHERE s.organization_id = o.id AND s.key = 'cx_package'
)
ON CONFLICT (organization_id, key) DO NOTHING;
