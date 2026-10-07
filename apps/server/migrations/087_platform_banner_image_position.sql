-- Migration: 087_platform_banner_image_position
-- Allow repositioning banner background images (0–100% per axis).

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_pos_x int NOT NULL DEFAULT 50;

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_pos_y int NOT NULL DEFAULT 50;

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_image_pos_x_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_image_pos_x_check
  CHECK (image_pos_x >= 0 AND image_pos_x <= 100);

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_image_pos_y_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_image_pos_y_check
  CHECK (image_pos_y >= 0 AND image_pos_y <= 100);

