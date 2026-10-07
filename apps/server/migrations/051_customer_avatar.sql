-- Migration: 051_customer_avatar
-- Optional profile photo URL for customers; platform toggle for uploads.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('customer_profile_photo_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
