-- Migration: 032_login_page_builder
-- Adds persisted per-app login page builder config to platform themes.

ALTER TABLE platform_themes
ADD COLUMN IF NOT EXISTS login_page JSONB NOT NULL DEFAULT '{}'::jsonb;
