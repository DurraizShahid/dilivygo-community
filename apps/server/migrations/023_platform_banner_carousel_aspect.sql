-- Migration: 023_platform_banner_carousel_aspect
-- Carousel slides (JSON array) + aspect / resolution preset for layout hints

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS carousel_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS image_aspect_preset text NOT NULL DEFAULT 'auto';

ALTER TABLE platform_banners
  DROP CONSTRAINT IF EXISTS platform_banners_image_aspect_preset_check;

ALTER TABLE platform_banners
  ADD CONSTRAINT platform_banners_image_aspect_preset_check
  CHECK (image_aspect_preset IN (
    'auto',
    '21_9',
    '16_9',
    '3_2',
    '4_3',
    '1_1',
    '4_5',
    '9_16',
    'og_1200_628',
    'banner_1920_600',
    'leaderboard_728_90',
    'medium_300_250',
    'skyscraper_160_600',
    'mobile_390_844'
  ));
