-- Migration: 020_platform_banners
-- Promotional banners managed by superadmins.
-- Supports scheduling, ordering, styling, and optional link targets.

CREATE TABLE IF NOT EXISTS platform_banners (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  cta_text text,
  cta_link text,
  image_url text,
  bg_gradient text NOT NULL DEFAULT 'from-primary to-primary/80',
  text_color text NOT NULL DEFAULT '#ffffff',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_banners DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS platform_banners_active_idx
  ON platform_banners (is_active, sort_order)
  WHERE is_active = true;
