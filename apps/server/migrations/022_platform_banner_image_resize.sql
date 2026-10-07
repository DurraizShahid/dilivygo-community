-- Migration: 022_platform_banner_image_resize
-- Resize mode for banner background image (fit, stretch, tile, center, span)

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_resize text NOT NULL DEFAULT 'center';

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_image_resize_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_image_resize_check
  CHECK (image_resize IN ('fit', 'stretch', 'tile', 'center', 'span'));
