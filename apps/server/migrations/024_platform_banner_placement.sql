-- Migration: 024_platform_banner_placement
-- Where the banner appears on the customer website

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'home_promotions';

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_placement_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_placement_check
  CHECK (placement IN (
    'home_promotions',
    'home_below_hero',
    'restaurant_list',
    'restaurant_menu',
    'cart',
    'checkout',
    'orders_list',
    'order_detail',
    'account',
    'chat_list',
    'chat_thread',
    'login'
  ));

CREATE INDEX IF NOT EXISTS platform_banners_placement_active_idx
  ON platform_banners (placement, is_active, sort_order)
  WHERE is_active = true;
