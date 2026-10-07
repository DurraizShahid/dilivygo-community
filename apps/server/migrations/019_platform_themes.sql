-- Migration: 019_platform_themes
-- Platform-level theme configuration table.
-- Supports global defaults + per-app overrides, optionally scoped to a workspace.

CREATE TABLE IF NOT EXISTS platform_themes (
  id uuid PRIMARY KEY,
  app_target text NOT NULL CHECK (app_target IN (
    'global',
    'customer_web', 'rider_web', 'vendor_web', 'superadmin_web',
    'customer_mobile', 'rider_mobile', 'vendor_mobile'
  )),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  light_theme jsonb NOT NULL DEFAULT '{}',
  dark_theme jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_themes_target_workspace_uq
  ON platform_themes (app_target, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS platform_themes_workspace_idx ON platform_themes(workspace_id)
  WHERE workspace_id IS NOT NULL;
