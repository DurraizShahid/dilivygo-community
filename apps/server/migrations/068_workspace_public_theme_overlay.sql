-- Migration: 068_workspace_public_theme_overlay
-- Tenant-scoped partial overrides merged into GET /api/public/theme when ref=<project_ref>.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS public_theme_overlay JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN workspaces.public_theme_overlay IS
  'Partial public theme payload (branding keys, light/dark tokens, mapSettings, deliveryFeeConfig) merged over platform_settings for this workspace.';
