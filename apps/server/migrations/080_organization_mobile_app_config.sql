-- Migration: 080_organization_mobile_app_config
--
-- Reserves a `mobile_app_config` JSONB column on `organizations` so future
-- EAS white-label builds can read per-org display name / icon / splash /
-- primary color / deep-link scheme / bundle-id suffix without another
-- schema change.
--
-- This round nothing reads the column at runtime — the app-builder still
-- ships generic Expo Go / dev-client binaries scoped to an org via
-- `EXPO_PUBLIC_PROJECT_REF`. Only the SaaS dashboard eventually surfaces an
-- editor for these values. See `packages/types/src/saas.ts` for the shape
-- (`OrganizationMobileAppConfig` + `MobileAppSurfaceConfig`).
--
-- Defaults to an empty JSON object so existing rows are valid without a
-- backfill step.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mobile_app_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.mobile_app_config IS
  'Per-surface mobile white-label config (customer/rider/vendor). '
  'Empty by default. See packages/types/src/saas.ts OrganizationMobileAppConfig.';
