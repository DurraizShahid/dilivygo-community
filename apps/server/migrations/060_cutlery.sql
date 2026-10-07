-- 060_cutlery.sql — optional cutlery at checkout (per shop + platform toggle)

ALTER TABLE vendor_settings
  ADD COLUMN IF NOT EXISTS cutlery_offered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cutlery_fee_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN vendor_settings.cutlery_offered IS 'When true, customers may request cutlery at checkout for this shop.';
COMMENT ON COLUMN vendor_settings.cutlery_fee_cents IS 'Fee in cents when cutlery is offered and charged; 0 means free when offered.';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cutlery_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cutlery_fee_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.cutlery_requested IS 'Customer opted in for cutlery on this order.';
COMMENT ON COLUMN orders.cutlery_fee_cents IS 'Charged cutlery amount in cents (0 if free or not requested).';

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('customer_cutlery_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
