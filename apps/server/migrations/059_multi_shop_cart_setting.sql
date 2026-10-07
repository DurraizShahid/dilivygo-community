-- 059_multi_shop_cart_setting.sql
-- Platform toggle: allow one cart with items from multiple shops and a single checkout delivery fee.

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('multi_shop_cart_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;
