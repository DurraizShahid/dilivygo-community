-- Migration: 030_workspace_promo_toggle
-- Allow superadmins to disable vendor promo codes per workspace

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS promo_codes_enabled BOOLEAN NOT NULL DEFAULT TRUE;
