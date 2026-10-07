-- Migration: 031_customer_favorites
-- Persist customer favorite shops and products for quick access.

CREATE TABLE IF NOT EXISTS customer_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_ref TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('shop', 'product')),
  shop_id     UUID REFERENCES shops(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer
  ON customer_favorites(customer_id, project_ref, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_favorites_shop
  ON customer_favorites(customer_id, project_ref, shop_id)
  WHERE kind = 'shop' AND shop_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_favorites_product
  ON customer_favorites(customer_id, project_ref, product_id)
  WHERE kind = 'product' AND product_id IS NOT NULL;
