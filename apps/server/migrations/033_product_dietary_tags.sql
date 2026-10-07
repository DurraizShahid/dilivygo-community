-- Migration: 033_product_dietary_tags
-- Adds allergy / dietary tags to products for menu filtering and display.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS dietary_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS products_dietary_tags_gin_idx
ON products USING gin (dietary_tags);
