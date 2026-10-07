-- Migration: 021_banner_image_scale
-- Adds adjustable background image scale for platform banners.

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_scale integer NOT NULL DEFAULT 100;

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_image_scale_range;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_image_scale_range
  CHECK (image_scale >= 50 AND image_scale <= 200);
