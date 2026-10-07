-- 043_delivery_fee_config.sql
-- Seed a default delivery fee configuration into platform_settings.
-- The config is a JSON blob that frontends read to calculate the delivery fee.
-- The server trusts whatever fee the frontend sends — no server-side validation.

INSERT INTO platform_settings (key, value)
VALUES (
  'delivery_fee_config',
  '{"type":"flat","flatFeeCents":250,"freeDeliveryThresholdCents":0,"tiers":[]}'
)
ON CONFLICT (key) DO NOTHING;
