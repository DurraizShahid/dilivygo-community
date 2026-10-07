-- Migration: 029_promo_codes
-- Promo codes / coupons / discounts system

CREATE TABLE IF NOT EXISTS promo_codes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref           TEXT,
  shop_id               UUID REFERENCES shops(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('percentage', 'fixed_amount', 'free_delivery')),
  value                 INTEGER NOT NULL DEFAULT 0,
  min_order_cents       INTEGER NOT NULL DEFAULT 0,
  max_discount_cents    INTEGER,
  max_uses              INTEGER,
  max_uses_per_customer INTEGER NOT NULL DEFAULT 1,
  times_used            INTEGER NOT NULL DEFAULT 0,
  starts_at             TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_scope_uq
  ON promo_codes (UPPER(code), COALESCE(project_ref, '__platform__'), COALESCE(shop_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS idx_promo_codes_project_ref ON promo_codes(project_ref);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(UPPER(code));

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id   UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  discount_cents  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_code ON promo_redemptions(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_customer ON promo_redemptions(promo_code_id, customer_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL;
