-- Migration: 034_shop_reviews
-- Adds customer-to-shop reviews with superadmin moderation controls.

CREATE TABLE IF NOT EXISTS shop_reviews (
  id UUID PRIMARY KEY,
  project_ref TEXT NOT NULL,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'visible' CHECK (moderation_status IN ('visible', 'hidden')),
  moderation_reason TEXT,
  moderated_by TEXT,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, customer_id),
  UNIQUE (order_id, shop_id)
);

CREATE INDEX IF NOT EXISTS shop_reviews_shop_id_idx
ON shop_reviews (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shop_reviews_project_ref_idx
ON shop_reviews (project_ref);

CREATE INDEX IF NOT EXISTS shop_reviews_moderation_status_idx
ON shop_reviews (moderation_status);
