-- Migration: 083_platform_banner_home_explore_deals
-- Add new banner placement used by customer home page under cuisines section.

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_placement_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_placement_check
  CHECK (placement IN (
    'home_promotions',
    'home_below_hero',
    'home_explore_deals',
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

