-- Migration: 036_shop_operating_hours
-- Add per-shop operating hours and timezone for open/closed checks.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS operating_hours JSONB,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

UPDATE shops
SET timezone = COALESCE(NULLIF(timezone, ''), 'UTC')
WHERE timezone IS NULL OR timezone = '';

ALTER TABLE shops
  ALTER COLUMN timezone SET DEFAULT 'UTC';

