-- Migration: 028_admin_settings_project_ref
-- Scope admin_settings per workspace by adding project_ref.
-- Backfill existing rows from the seed data's workspace.

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS project_ref TEXT;

-- Backfill: assign existing rows to the first workspace's project_ref
UPDATE admin_settings
SET project_ref = (SELECT project_ref FROM workspaces LIMIT 1)
WHERE project_ref IS NULL;

-- Make project_ref required going forward
ALTER TABLE admin_settings ALTER COLUMN project_ref SET NOT NULL;

-- Unique constraint: one settings row per workspace
CREATE UNIQUE INDEX IF NOT EXISTS admin_settings_project_ref_uq
  ON admin_settings (project_ref);

CREATE INDEX IF NOT EXISTS idx_admin_settings_project_ref
  ON admin_settings (project_ref);
