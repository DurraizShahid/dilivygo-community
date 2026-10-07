-- Migration: 035_rider_commission
-- Adds rider commission settings (global + per-rider override) and
-- stores commission snapshots on tips for auditable earnings.

-- Per-rider override (NULL means fallback to global default)
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS commission_override_bps INTEGER;

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_commission_override_bps_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_commission_override_bps_check
  CHECK (
    commission_override_bps IS NULL
    OR (commission_override_bps >= 0 AND commission_override_bps <= 10000)
  );

-- Tip-level commission snapshots
ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS commission_bps INTEGER,
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS rider_net_cents INTEGER;

UPDATE tips
SET
  commission_bps = COALESCE(commission_bps, 0),
  platform_fee_cents = COALESCE(platform_fee_cents, 0),
  rider_net_cents = COALESCE(rider_net_cents, amount_cents)
WHERE commission_bps IS NULL
   OR platform_fee_cents IS NULL
   OR rider_net_cents IS NULL;

ALTER TABLE tips
  ALTER COLUMN commission_bps SET NOT NULL,
  ALTER COLUMN commission_bps SET DEFAULT 0,
  ALTER COLUMN platform_fee_cents SET NOT NULL,
  ALTER COLUMN platform_fee_cents SET DEFAULT 0,
  ALTER COLUMN rider_net_cents SET NOT NULL;

ALTER TABLE tips
  DROP CONSTRAINT IF EXISTS tips_commission_bps_check,
  DROP CONSTRAINT IF EXISTS tips_platform_fee_cents_check,
  DROP CONSTRAINT IF EXISTS tips_rider_net_cents_check;

ALTER TABLE tips
  ADD CONSTRAINT tips_commission_bps_check CHECK (commission_bps >= 0 AND commission_bps <= 10000),
  ADD CONSTRAINT tips_platform_fee_cents_check CHECK (platform_fee_cents >= 0),
  ADD CONSTRAINT tips_rider_net_cents_check CHECK (rider_net_cents >= 0 AND rider_net_cents <= amount_cents);

-- Global default (stored in platform_settings key-value table)
INSERT INTO platform_settings (key, value)
VALUES ('rider_commission_bps', '0')
ON CONFLICT (key) DO NOTHING;

