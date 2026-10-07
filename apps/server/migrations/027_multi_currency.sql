-- Migration: 027_multi_currency
-- Add currency support at workspace, shop, and order level.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'gbp';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'gbp';

-- Backfill workspace currency from platform_settings if available
DO $$
DECLARE
  plat_currency TEXT;
BEGIN
  SELECT value INTO plat_currency FROM platform_settings WHERE key = 'default_currency';
  IF plat_currency IS NOT NULL AND plat_currency <> '' THEN
    UPDATE workspaces SET currency = plat_currency WHERE currency = 'gbp' OR currency IS NULL;
    UPDATE orders SET currency = plat_currency WHERE currency = 'gbp' OR currency IS NULL;
  END IF;
END $$;
